"""HTTP safety helpers; media validators and identity display remain independent."""
import hashlib,json,re
from fastapi.responses import Response

_TAG=re.compile(r'(?:W/)?"[\x21\x23-\x7e\x80-\xff]*"')

def no_store(response):
    response.headers['Cache-Control']='no-store'
    response.headers['Cloudflare-CDN-Cache-Control']='no-store'
    for name in ('etag', 'x-teacher-render-ok', 'x-teacher-data-ok', 'cache-tag'):
        if name in response.headers:del response.headers[name]
    return response

def matches_etag(value,etag):
    """GET/HEAD weak comparison; malformed or oversized lists fall back to 200."""
    if not value or len(value)>8192:return False
    value=value.strip()
    if value=='*':return True
    target=etag.removeprefix('W/');matched=False;count=0
    while value:
        value=value.lstrip(' \t,')
        if not value:break
        match=_TAG.match(value)
        if not match:return False
        count+=1
        if count>64:return False
        matched=matched or match[0].removeprefix('W/')==target
        value=value[match.end():].lstrip(' \t')
        if value and not value.startswith(','):return False
    return matched

def identity_fingerprint(principal):
    """Display fingerprint includes live permissions, not just session identity."""
    if not principal:return ''
    return hashlib.sha256(json.dumps(principal,sort_keys=True,ensure_ascii=True,separators=(',',':')).encode()).hexdigest()

def successful_page(request, response):
    from backend.app.public_performance import page_request
    return (page_request(request) and response.status_code in (200, 304)
            and response.headers.get('X-Teacher-Render-OK') == '1'
            and 'set-cookie' not in response.headers
            and (response.status_code == 304 or response.headers.get('content-type', '').lower().startswith('text/html')))

def finish(request, response, *, public_ok=False):
    from backend.app.public_performance import page_request, page_headers
    cacheable = (public_ok and page_request(request) and response.status_code == 200
                 and 'set-cookie' not in response.headers
                 and response.headers.get('content-type', '').lower().startswith('text/html')
                 and isinstance(getattr(response, 'body', None), bytes))
    if cacheable:
        # Hash the finished representation; no extra revision lookup or SQL cache.
        etag = 'W/"' + hashlib.sha256(response.body).hexdigest() + '"'
        response.headers.update(page_headers())
        response.headers['X-Teacher-Render-OK'] = '1'
        from .public_cache_tags import page_tags
        response.headers['Cache-Tag'] = page_tags(request)
        response.headers['ETag'] = etag
        if matches_etag(','.join(request.headers.getlist('if-none-match')), etag):
            headers = dict(response.headers)
            for name in ('content-length', 'content-type'):
                headers.pop(name, None)
            return Response(status_code=304, headers=headers)
    else:
        no_store(response)
    if request.method == 'HEAD':
        return Response(status_code=response.status_code, headers=dict(response.headers))
    return response
