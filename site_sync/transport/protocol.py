"""HMAC authenticates small bodies; TLS protects native media streams.
Read-only requests can safely replay inside the clock window. No remote SQL,
remote writes, arbitrary URLs or filesystem paths are accepted.
"""
import hashlib
import hmac
import json
import re
import secrets
import time
from site_sync.core.authority import AuthorizationError, ConflictError
from site_sync.core.diagnostics import coded

PATH='/sync/v1/read'
MAX_CONTROL=8192
MAX_REQUEST=2048
MAX_SLICE=4*1024*1024
MAX_MEDIA=1024*1024*1024


def encode(value):return json.dumps(value,ensure_ascii=True,separators=(',',':'),sort_keys=True).encode()
def digest(body):return hashlib.sha256(body).hexdigest()
def mac(secret,text):
    if not isinstance(secret,bytes) or len(secret)<32:raise ValueError('Use at least 32 random key bytes')
    return hmac.new(secret,text.encode(),hashlib.sha256).hexdigest()

def request_headers(secret,body,*,clock=time.time,nonce=None):
    if len(body)>MAX_REQUEST:raise ValueError('Request too large')
    stamp=str(int(clock()));nonce=nonce or secrets.token_hex(16)
    message='\n'.join(('sync-v1-request',stamp,nonce,'POST',PATH,digest(body)))
    return {'x-sync-time':stamp,'x-sync-nonce':nonce,'x-sync-signature':mac(secret,message),
            'content-type':'application/json','accept-encoding':'identity'}

def verify_request(secret,headers,body,*,clock=time.time):
    stamp=headers.get('x-sync-time','');nonce=headers.get('x-sync-nonce','')
    if len(body)>MAX_REQUEST or not re.fullmatch(r'[0-9]{1,12}',stamp) or not re.fullmatch(r'[a-f0-9]{32}',nonce):
        raise coded(AuthorizationError('Invalid request envelope'),'SYNC_ENVELOPE_INVALID')
    if abs(int(clock())-int(stamp))>120:raise coded(AuthorizationError('Request outside clock window'),'SYNC_CLOCK_SKEW')
    expected=request_headers(secret,body,clock=lambda:int(stamp),nonce=nonce)['x-sync-signature']
    if not hmac.compare_digest(headers.get('x-sync-signature',''),expected):raise coded(AuthorizationError('Invalid request signature'),'SYNC_SIGNATURE_INVALID')
    return nonce

def response_headers(secret,nonce,status,metadata,body=b'',*,stream=False):
    meta=encode(metadata).decode()
    if len(meta)>2048:raise ValueError('Metadata too large')
    value='stream' if stream else digest(body)
    signature=mac(secret,'\n'.join(('sync-v1-response',nonce,str(status),meta,value)))
    return {'x-sync-meta':meta,'x-sync-signature':signature,'cache-control':'no-store',
            'content-type':'application/octet-stream','content-length':str(metadata['length'] if stream else len(body))}

def verify_response(secret,nonce,status,headers,body=b'',*,stream=False):
    meta=headers.get('x-sync-meta','')
    if len(meta)>2048:raise AuthorizationError('Invalid response metadata')
    expected=mac(secret,'\n'.join(('sync-v1-response',nonce,str(status),meta,'stream' if stream else digest(body))))
    if not hmac.compare_digest(headers.get('x-sync-signature',''),expected):raise coded(AuthorizationError('Invalid response signature'),'SYNC_RESPONSE_SIGNATURE')
    try:result=json.loads(meta)
    except (ValueError,TypeError) as exc:raise AuthorizationError('Invalid response metadata') from exc
    if not isinstance(result,dict):raise AuthorizationError('Invalid response metadata')
    return result

def manifest(value,version):
    if not isinstance(value,dict) or len(encode(value))>MAX_CONTROL or value.get('version')!=version:
        raise ConflictError('Source version or manifest changed')
    if 'snapshot_hash' in value and (not isinstance(value['snapshot_hash'],str) or not re.fullmatch(r'[a-f0-9]{64}',value['snapshot_hash'])):raise ConflictError('Invalid snapshot identity')
    fields=value.get('fields');files=value.get('files',[])
    if not isinstance(fields,dict) or len(fields)>32 or not isinstance(files,list) or len(files)>16:
        raise ConflictError('Manifest exceeds bounds')
    for key,size in fields.items():
        if not isinstance(key,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,63}',key) or type(size)!=int or not 0<=size<=1048576:
            raise ConflictError('Invalid field descriptor')
    if sum(fields.values())>1048576:raise ConflictError('Record exceeds byte limit')
    seen=set()
    for f in files:
        if not isinstance(f,dict) or set(f)!={'id','version','size'} or any(not isinstance(f[k],str) or not 0<len(f[k])<=256 for k in ('id','version')) or type(f['size'])!=int or not 0<=f['size']<=MAX_MEDIA or f['id'] in seen:
            raise ConflictError('Invalid media descriptor')
        seen.add(f['id'])
    return value
