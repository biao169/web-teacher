"""Shared bounded HTTP contract for translation adapters; no redirects or arbitrary destinations."""
import json
from urllib.parse import urlsplit
from .translation_config import DEFAULT_ENDPOINTS,endpoint

MAX_BYTES=1048576
MAX_BODY=131072

def validate_request(request,hosts=()):
    """Validate a generated request again at the I/O boundary, binding keys to its provider."""
    provider=request['provider'];url=request['url'];p=urlsplit(url)
    base=endpoint(url.split('?',1)[0],DEFAULT_ENDPOINTS[provider])
    official=urlsplit(DEFAULT_ENDPOINTS[provider]).hostname
    approved={official,*(hosts if provider in ('libretranslate','microsoft') else ())}
    if provider=='deepl':approved.add('api-free.deepl.com')
    if p.hostname not in approved or len(url)>8000 or p.fragment:raise ValueError('Invalid translation destination')
    paths={'google':'/language/translate/v2','deepl':'/v2/translate','mymemory':'/get'}
    if provider in paths and p.path!=paths[provider]:raise ValueError('Invalid translation path')
    if provider in ('libretranslate','microsoft') and not p.path.endswith('/translate'):raise ValueError('Invalid translation path')
    method=request['method'];headers=request.get('headers',{});body=request.get('body')
    if method!=('GET' if provider=='mymemory' else 'POST'):raise ValueError('Invalid translation method')
    allowed={'google':{'X-Goog-Api-Key'},'deepl':{'Authorization'},'microsoft':{'Ocp-Apim-Subscription-Key','Ocp-Apim-Subscription-Region'},'mymemory':set(),'libretranslate':set()}[provider]|{'Content-Type'}
    if set(headers)-allowed or any(not isinstance(v,str) or len(v)>4200 or any(ord(c)<32 or ord(c)>126 for c in v) for v in headers.values()):raise ValueError('Invalid translation headers')
    if body is not None and (not isinstance(body,bytes) or len(body)>MAX_BODY):raise ValueError('Translation body too large')
    return {'Accept':'application/json','User-Agent':'TeacherSite translation assistant',**headers}

def decode_response(body):
    """Reject oversized/malformed JSON before any provider-specific field extraction."""
    if len(body)>MAX_BYTES:raise ValueError('Translation response too large')
    return json.loads(body)
