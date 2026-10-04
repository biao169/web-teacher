"""Immutable origin policy shared by adapters; standard library only.

The public scheme comes from explicit configuration, never forwarded headers.
A reverse proxy must preserve Host. Cookie and CSRF enforcement remain callers'
responsibility; this module does not grant authentication or permissions.
"""
from dataclasses import dataclass, field
from types import MappingProxyType
from urllib.parse import urlsplit
import ipaddress
import re


def normalize_origin(value, *, root_slash=True):
    if not isinstance(value, str) or not value or len(value) > 2048:
        raise ValueError('Expected one site origin')
    if any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value) or any(c in value for c in '\\,?#'):
        raise ValueError('Invalid origin characters')
    p = urlsplit(value)
    if p.scheme not in ('http', 'https') or not p.hostname or p.username is not None or p.password is not None or p.path not in (('', '/') if root_slash else ('',)):
        raise ValueError('Expected an HTTP(S) root origin')
    host = p.hostname
    if '%' in host:
        raise ValueError('Scoped or escaped hosts are not supported')
    try:
        ip = ipaddress.ip_address(host)
        host = '[' + ip.compressed + ']' if ip.version == 6 else ip.compressed
    except ValueError:
        if ':' in host or '%' in host:
            raise ValueError('Invalid host') from None
        host = host.encode('idna').decode('ascii').lower()
        if len(host) > 253 or any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label) for label in host.split('.')):
            raise ValueError('Invalid host')
    if p.scheme == 'http' and host not in ('localhost', '127.0.0.1', '[::1]'):
        raise ValueError('HTTP is allowed only for local development')
    port = p.port  # Reject malformed and out-of-range ports.
    if port == 0 or p.netloc.endswith(':'):
        raise ValueError('Invalid port')
    suffix = '' if port is None or port == (443 if p.scheme == 'https' else 80) else ':' + str(port)
    return p.scheme + '://' + host + suffix


def parse_origins(primary, allowed=None):
    """Return normalized unique origins, primary first; no wildcards or guessing."""
    primary = normalize_origin(primary)
    if allowed is None or allowed == '':
        values = ()
    elif isinstance(allowed, str):
        values = tuple(v.strip() for v in allowed.split(','))
    elif isinstance(allowed, (tuple, list)):
        values = tuple(allowed)
    else:
        raise ValueError('Allowed origins must be a comma-separated string or sequence')
    if len(values) > 100:
        raise ValueError('Too many allowed origins')
    origins = tuple(dict.fromkeys((primary, *(normalize_origin(v) for v in values))))
    if any(urlsplit(v).scheme != urlsplit(primary).scheme for v in origins):
        raise ValueError('All site origins must use the same scheme')
    return origins


def _header(request, name):
    headers = request.headers
    if hasattr(headers, 'getlist'):
        values = headers.getlist(name)
        if len(values) != 1:
            raise ValueError('Expected one ' + name + ' header')
        return values[0]
    value = headers.get(name)
    if not isinstance(value, str):
        raise ValueError('Missing ' + name + ' header')
    return value


@dataclass(frozen=True)
class OriginPolicy:
    primary: str
    allowed: tuple = ()
    _hosts: object = field(init=False, repr=False, compare=False)

    def __post_init__(self):
        origins = parse_origins(self.primary, self.allowed)
        object.__setattr__(self, 'primary', origins[0])
        object.__setattr__(self, 'allowed', origins)
        hosts = {urlsplit(v).netloc: v for v in origins}
        object.__setattr__(self, '_hosts', MappingProxyType(hosts))

    def request_origin(self, request):
        """Match exactly one Host to an explicitly configured public origin."""
        host = _header(request, 'host')
        if '/' in host or '@' in host:
            raise ValueError('Invalid Host')
        scheme = urlsplit(self.primary).scheme
        candidate = normalize_origin(scheme + '://' + host, root_slash=False)
        result = self._hosts.get(urlsplit(candidate).netloc)
        if result is None:
            raise ValueError('Host not allowed')
        return result

    def require_same_origin(self, request):
        current = self.request_origin(request)
        origin = normalize_origin(_header(request, 'origin'), root_slash=False)
        if origin != current:
            raise ValueError('Origin does not match request Host')
        sites = request.headers.getlist('sec-fetch-site') if hasattr(request.headers, 'getlist') else [request.headers.get('sec-fetch-site')]
        if len(sites) > 1 or any(v not in (None, 'same-origin', 'none') for v in sites):
            raise ValueError('Cross-site request rejected')
        return current

    def is_site_url(self, value):
        """Recognize an absolute HTTP(S) URL, not a relative path or credential URL."""
        if not isinstance(value, str) or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value) or '\\' in value:
            return False
        try:
            p = urlsplit(value)
            if p.username is not None or p.password is not None:
                return False
            return normalize_origin(p.scheme + '://' + p.netloc) in self.allowed
        except (ValueError, UnicodeError):
            return False
