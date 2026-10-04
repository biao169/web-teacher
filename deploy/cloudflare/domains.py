"""One canonical site origin, optionally derived from the workers.dev account name."""
import re
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from backend.app.security.origins import parse_origins
from urllib.parse import urlsplit

LABEL = r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'


def hostname(value):
    value = value.strip().lower()
    if len(value) > 253 or '.' not in value or not all(re.fullmatch(LABEL, p) for p in value.split('.')):
        raise ValueError('域名格式无效（国际域名请填 punycode）/ Invalid hostname: ' + value)
    if value in ('example.com', 'example.org', 'example.net', 'localhost') or any(
            value.endswith('.'+x) for x in ('example.com', 'example.org', 'example.net')):
        raise ValueError('请使用实际域名 / Use the actual domain')
    return value


def settings(env, name):
    custom = env.get('TEACHER_CUSTOM_DOMAIN', '').strip().lower()
    if custom:
        custom = hostname(custom)
        if custom.endswith('.workers.dev'):
            raise ValueError('TEACHER_CUSTOM_DOMAIN 应为自己的域名 / Custom domain cannot be workers.dev')
    origin = env.get('TEACHER_ORIGIN', '').strip()
    if not origin:
        if custom:
            origin = 'https://' + custom
        else:
            sub = env.get('TEACHER_WORKERS_SUBDOMAIN', '').strip().lower()
            if not re.fullmatch(LABEL, sub):
                raise ValueError('填写 TEACHER_ORIGIN 或 TEACHER_WORKERS_SUBDOMAIN（账号子域名）/ Set origin or workers.dev account subdomain')
            origin = 'https://' + name + '.' + sub + '.workers.dev'
    origin = parse_origins(origin)[0]
    p = urlsplit(origin)
    if (p.scheme != 'https' or not p.hostname or p.username or p.password or p.query or p.fragment
            or p.path not in ('', '/') or p.port not in (None, 443)):
        raise ValueError('TEACHER_ORIGIN 必须是 HTTPS 根地址 / Use an HTTPS origin')
    host = hostname(p.hostname)
    if custom and custom != host:
        raise ValueError('TEACHER_ORIGIN 与 TEACHER_CUSTOM_DOMAIN 不一致 / Origin and custom domain mismatch')
    enabled = env.get('TEACHER_WORKERS_DEV', 'true').strip().lower()
    if enabled not in ('true', 'false', '1', '0'):
        raise ValueError('TEACHER_WORKERS_DEV 应为 true/false / Expected true or false')
    enabled = enabled in ('true', '1')
    if host.endswith('.workers.dev') and not enabled:
        raise ValueError('不能关闭当前主地址 workers.dev / Cannot disable the canonical workers.dev address')
    custom_domains = tuple(dict.fromkeys(([custom] if custom else []) +
        ([hostname(v.strip().lower()) for v in env.get('TEACHER_CUSTOM_DOMAINS','').split(',')] if env.get('TEACHER_CUSTOM_DOMAINS','') else [])))
    if any(v.endswith('.workers.dev') for v in custom_domains):
        raise ValueError('Custom domains cannot be workers.dev')
    origins = parse_origins('https://' + host, env.get('TEACHER_ALLOWED_ORIGINS',''))
    origins = parse_origins(origins[0], (*origins, *('https://' + v for v in custom_domains)))
    for value in origins:
        p = urlsplit(value)
        hostname(p.hostname)
        if p.port is not None:raise ValueError('Worker public origins require standard HTTPS port')
        if p.hostname.endswith('.workers.dev') and not enabled:raise ValueError('Cannot allow disabled workers.dev address')
    return dict(origin=origins[0], allowed_origins=origins, custom_domain=custom,
                custom_domains=custom_domains, workers_dev=enabled)


def apply(config, values):
    config['workers_dev'] = values['workers_dev']
    config.setdefault('vars', {})['TEACHER_ALLOWED_ORIGINS'] = ','.join(values['allowed_origins'])
    # Merge explicitly managed routes; allowlisted aliases alone do not change routes.
    routes = list(config.get('routes', []))
    for host in values.get('custom_domains', ()):
        route = {'pattern': host, 'custom_domain': True}
        if route not in routes:routes.append(route)
    if routes:config['routes'] = routes
