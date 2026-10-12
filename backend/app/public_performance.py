"""Single Public policy: successful standard anonymous pages, no application cache."""
from dataclasses import dataclass
import os

@dataclass(frozen=True)
class PublicPerformance:
    public_stream_concurrency: int = 2

    def to_env(self):
        return {'TEACHER_PUBLIC_STREAM_CONCURRENCY': str(self.public_stream_concurrency)}

    @classmethod
    def from_env(cls, env=None):
        env = os.environ if env is None else env
        get = env.get if callable(getattr(env, 'get', None)) else lambda key, default: getattr(env, key, default)
        raw = get('TEACHER_PUBLIC_STREAM_CONCURRENCY', '2')
        try:
            value = int(str(raw))
            if str(raw).strip() != str(value) or not 1 <= value <= 4:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError('TEACHER_PUBLIC_STREAM_CONCURRENCY: allowed 1..4; default 2') from None
        return cls(public_stream_concurrency=value)

KEYS = ('TEACHER_PUBLIC_STREAM_CONCURRENCY',)
LEGACY_CACHE_KEYS = ('TEACHER_PUBLIC_CACHE_TTL_SECONDS', 'TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS',
                     'TEACHER_PUBLIC_NAV_PREFETCH_CONCURRENCY', 'TEACHER_PUBLIC_CACHE_MB',
                     'TEACHER_WORKER_CACHE_MODE', 'TEACHER_WORKER_REQUEST_CACHE')

def public_headers():
    """Default for dynamic or unconfirmed responses; successful pages opt in below."""
    return {'Cache-Control': 'no-store', 'Cloudflare-CDN-Cache-Control': 'no-store'}

# Fixed policy for this reconstruction; legacy environment switches are ignored.
PUBLIC_HTML_TTL = 1800
PUBLIC_EDGE_POLICY = f'public, max-age={PUBLIC_HTML_TTL}, stale-while-revalidate=300, stale-if-error=86400'
PUBLIC_TABLES = frozenset(('profiles', 'students', 'research_interests', 'projects',
                           'publications', 'patents', 'courses', 'news'))
PUBLIC_DETAIL_TABLES = frozenset(('profiles', 'courses'))

PUBLIC_NAV_HTML_TTL = 60
PUBLIC_NAV_EDGE_POLICY = 'public, max-age=120, stale-while-revalidate=30, stale-if-error=300'

def navigation_context(request):
    """Fixed list path only; query/fragment representations still require live scope."""
    import re
    from urllib.parse import urlsplit
    if str(getattr(request,'method','')) not in ('GET','HEAD'):return None
    url=urlsplit(str(request.url));parts=url.path.split('/')
    if (url.fragment or len(parts)!=4 or parts[:1]!=['']
            or parts[1] not in ('en','zh') or parts[2]!='n'
            or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,79}',parts[3])):return None
    return parts[3]

def navigation_target(request):
    """Only the query-free full-page representation can enter shared cache."""
    from urllib.parse import urlsplit
    slug=navigation_context(request)
    if slug is None or urlsplit(str(request.url)).query:return None
    if any(request.headers.get(k) for k in ('x-public-fragment','range','if-match','if-unmodified-since')):return None
    if 'application/json' in str(request.headers.get('accept') or '').lower():return None
    return slug

def page_request(request):
    """Static allowlist used before platform lookup and after rendering. No D1."""
    import re
    from urllib.parse import urlsplit, urlencode
    if str(getattr(request, 'method', '')) not in ('GET', 'HEAD'):
        return False
    headers = request.headers
    if headers.get('x-public-fragment') or headers.get('range') or headers.get('if-match') or headers.get('if-unmodified-since'):
        return False
    if 'application/json' in str(headers.get('accept') or '').lower():
        return False
    url = urlsplit(str(request.url))
    if url.fragment:
        return False
    parts = url.path.split('/')
    if len(parts) < 2 or parts[0] or parts[1] not in ('en', 'zh'):
        return False
    if len(parts) == 2:
        return not url.query
    if len(parts) == 3:
        return not url.query and parts[2] in PUBLIC_TABLES
    if navigation_target(request) is not None:return True
    # News details may contain identity-sensitive forms and are excluded until split.
    return (len(parts) == 4 and parts[2] in PUBLIC_DETAIL_TABLES
            and re.fullmatch(r'[A-Za-z0-9_:-]{1,128}', parts[3]) is not None
            and (not url.query or url.query == urlencode({'from': '/' + parts[1] + '/' + parts[2]})))

def page_headers(request=None):
    if request is not None and navigation_target(request) is not None:
        return {'Cache-Control':f'public, max-age={PUBLIC_NAV_HTML_TTL}',
                'Cloudflare-CDN-Cache-Control':PUBLIC_NAV_EDGE_POLICY,'Vary':'X-Public-Fragment'}
    return {'Cache-Control': f'public, max-age={PUBLIC_HTML_TTL}',
            'Cloudflare-CDN-Cache-Control': PUBLIC_EDGE_POLICY,
            'Vary': 'X-Public-Fragment'}

PUBLIC_DATA_TTL = 300
PUBLIC_DATA_EDGE_POLICY = PUBLIC_EDGE_POLICY

def data_target(request):
    """Exactly sixteen module/locale URLs. No visitor query or identity lookup."""
    from urllib.parse import urlsplit
    if str(getattr(request, 'method', '')) not in ('GET', 'HEAD'):
        return None
    url = urlsplit(str(request.url))
    if url.query or url.fragment:
        return None
    parts = url.path.split('/')
    if (len(parts) != 6 or parts[:4] != ['', 'api', 'public', 'data']
            or parts[4] not in ('zh', 'en') or parts[5] not in PUBLIC_TABLES):
        return None
    headers = request.headers
    if any(headers.get(key) for key in ('x-public-fragment', 'range', 'if-match', 'if-unmodified-since')):
        return None
    return parts[4], parts[5]

def data_headers():
    return {'Cache-Control': f'public, max-age={PUBLIC_DATA_TTL}',
            'Cloudflare-CDN-Cache-Control': PUBLIC_DATA_EDGE_POLICY}
