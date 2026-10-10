"""Small representation validators; no HTML storage or business-state cache."""
import hashlib,json,re
from fastapi.responses import Response
from .catalog import now

# Bump with releases that change public rendering, even if the DB revision is unchanged.
REPRESENTATION_VERSION='0.16.077'
_TAG=re.compile(r'(?:W/)?"[\x21\x23-\x7e\x80-\xff]*"')

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
    """Browser restore guard includes live permissions, not just session identity."""
    if not principal:return ''
    return hashlib.sha256(json.dumps(principal,sort_keys=True,ensure_ascii=True,separators=(',',':')).encode()).hexdigest()

def representation_key(request,r,revision,query,scope=None,fragment=False,clock=''):
    """Stable key shared by ETag and the anonymous Render Cache."""
    # Includes current effective grants, display fields and session fingerprint.
    # Only the final digest leaves the server; no UID/username/CSRF in the header.
    identity=r.p or 'anonymous'
    values=[('0.16.077' if getattr(r,'public_light',False) else REPRESENTATION_VERSION),revision,identity,request.url.path,
            sorted((k,str(v)) for k,v in query.items()),bool(fragment),
            scope['stamp'] if scope else '',clock,r.config.origin,
            getattr(r,'asset_mode',''),r.public_performance.to_env()]
    return hashlib.sha256(json.dumps(values,sort_keys=True,ensure_ascii=True,separators=(',',':')).encode()).hexdigest()

async def validator(request,r,revision,query,scope=None,fragment=False,table=None,uid=None):
    if (uid and not getattr(r,'public_shared',False)) or request.method not in ('GET','HEAD') or (request.headers.get('authorization') and not getattr(r,'public_shared',False)):
        return None
    # Keep explicit cache-disable semantics; conditional responses are not HTML storage.
    if not r.public_performance.public_cache_enabled and (fragment or not r.public_performance.public_page_cache_ttl_seconds):return None
    clock=''
    if table=='news':
        # Existing covering index (visibility,published_at,...) + LIMIT 1, no count/scan.
        # Time alone can make a scheduled news item visible without a revision write.
        rows=await r.sql.query("SELECT published_at FROM news WHERE visibility='public' AND published_at<=? ORDER BY published_at DESC LIMIT 1",(now(),))
        clock=rows[0]['published_at'] if rows else ''
    return 'W/"'+representation_key(request,r,revision,query,scope,fragment,clock)+'"'

def not_modified(request,etag,headers):
    # Do not evaluate this ahead of other preconditions or range processing.
    if etag and not request.headers.get('if-match') and not request.headers.get('range') and matches_etag(','.join(request.headers.getlist('if-none-match')),etag):
        return Response(status_code=304,headers=dict(headers,ETag=etag))
    return None

def finish(request,response,etag):
    if 'set-cookie' in response.headers or response.status_code>=400:
        response.headers['Cache-Control']='no-store'
        if 'etag' in response.headers:del response.headers['etag']
        etag=None
    if response.status_code==200 and 'set-cookie' not in response.headers and etag:
        response.headers['ETag']=etag
    if request.method=='HEAD':
        # Preserve the GET representation length/type, but never send its body.
        return Response(status_code=response.status_code,headers=dict(response.headers))
    return response


def private_page_policy(r):
    """Worker-only browser freshness; never shared storage, local policy unchanged."""
    if (r.kind=='local' or not getattr(r,'public_light',False)
            or getattr(r,'worker_cache_mode','simple')=='off'
            or not r.public_performance.public_page_cache_ttl_seconds
            or r.p.get('must_change_password')):
        return 'private, no-cache'
    return 'private, max-age='+('60' if r.p.get('is_system')==1 else '120')
