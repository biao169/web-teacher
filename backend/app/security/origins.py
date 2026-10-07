"""Bounded origin parsing shared by runtime and deployment; no application imports."""
import ipaddress
import json
import re
from urllib.parse import urlsplit


def normalize_origin(value):
    if not isinstance(value,str) or not value or len(value)>512 or re.search(r'[\s\\%*]',value):
        raise ValueError('Expected a complete HTTP(S) origin without whitespace or wildcards')
    p=urlsplit(value)
    if p.scheme not in ('http','https') or not p.hostname or p.username is not None or p.password is not None or p.path not in ('','/') or p.query or p.fragment or '?' in value or '#' in value:
        raise ValueError('Expected one HTTP(S) origin without credentials, path, query or fragment')
    host=p.hostname.lower()
    try:
        address=ipaddress.ip_address(host);host=address.compressed
    except ValueError:
        if len(host)>253 or not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?',label) for label in host.split('.')):
            raise ValueError('Invalid hostname; use punycode for international domains')
    if p.scheme=='http' and host not in ('localhost','127.0.0.1','::1'):
        raise ValueError('HTTP is allowed only for local development')
    port=p.port
    if p.netloc.endswith(':'):raise ValueError('Missing port')
    if port is not None and not 1<=port<=65535:raise ValueError('Invalid port')
    authority='['+host+']' if ':' in host else host
    if port is not None and port!=({'http':80,'https':443}[p.scheme]):authority+=':'+str(port)
    return p.scheme+'://'+authority


def parse_origins(origin,values=''):
    canonical=normalize_origin(origin)
    if isinstance(values,str):
        if len(values)>4096:raise ValueError('TEACHER_ALLOWED_ORIGINS is too long')
        value=values.strip()
        values=json.loads(value) if value.startswith('[') else re.split(r'[,\s]+',value) if value else []
    if not isinstance(values,(list,tuple)) or len(values)>32:raise ValueError('Use at most 32 allowed origins')
    result=[canonical]
    for value in values:
        candidate=normalize_origin(value)
        if candidate.split(':',1)[0]!=canonical.split(':',1)[0]:raise ValueError('Allowed origins must use the canonical scheme')
        if candidate not in result:result.append(candidate)
    if len(result)>32:raise ValueError('Use at most 32 allowed origins including the canonical origin')
    return tuple(result)
