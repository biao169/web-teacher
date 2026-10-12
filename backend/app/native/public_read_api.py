"""Success-only PublicData responses shared by local HTTP and the Worker callee.

Read Model code is imported only on a valid data MISS. No auth, renderer, writes,
Cache API or stale-copy store; platform Workers Caching owns response caching.
"""
from dataclasses import dataclass
import hashlib
import json
import logging
from urllib.parse import urlsplit
from backend.app.public_performance import data_target, data_headers, public_headers

@dataclass(frozen=True)
class DataReply:
    text: str
    status: int
    headers: dict
    cacheable: bool = False


def error_reply(status, code):
    text=json.dumps({'error':'Public data temporarily unavailable' if status>=500 else 'Invalid public data request',
                     'code':code},separators=(',',':'))
    headers=dict(public_headers(), **{'Content-Type':'application/json; charset=utf-8',
                                     'Content-Length':str(len(text.encode())),
                                     'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'})
    if status==503:headers['Retry-After']='60'
    if status==405:headers['Allow']='GET, HEAD'
    return DataReply(text,status,headers)


def invalid_request(request):
    if str(getattr(request,'method','')) not in ('GET','HEAD'):
        return error_reply(405,'METHOD_NOT_ALLOWED')
    url=urlsplit(str(request.url))
    return error_reply(400 if url.query or any(request.headers.get(key) for key in ('range','if-match','if-unmodified-since','x-public-fragment')) else 404,
                       'PUBLIC_DATA_REQUEST_INVALID')


def successful_data(request,response):
    return (data_target(request) is not None and response.status_code in (200,304)
            and response.headers.get('X-Teacher-Data-OK')=='1' and 'set-cookie' not in response.headers
            and (response.status_code==304 or response.headers.get('content-type','').lower().startswith('application/json')))


def _encode(model):
    return json.dumps(model,ensure_ascii=False,separators=(',',':'),allow_nan=False)


async def generate(request,r):
    target=data_target(request)
    if target is None:return invalid_request(request)
    lang,table=target
    from .public_read_model import build, ModelLimits, ModelUnavailable, SCHEMA_VERSION
    try:
        model=await build(r,table,lang)
        # Trust the internal field whitelist, but never cache incomplete/wrong output.
        if (not isinstance(model,dict) or model.get('complete') is not True
                or model.get('schema_version')!=SCHEMA_VERSION or model.get('module')!=table
                or model.get('lang')!=lang or model.get('model_key')!=table+'-public-index-'+lang
                or type(model.get('total')) is not int or not isinstance(model.get('items'),list)
                or model['total']!=len(model['items']) or not 0<=model['total']<=ModelLimits().max_rows
                or not isinstance(model.get('revision'),str) or not 1<=len(model['revision'])<=128
                or not isinstance(model.get('facets'),list) or not isinstance(model.get('groups'),list)
                or not isinstance(model.get('semantics'),dict)):
            raise ModelUnavailable('model_invalid')
        text=_encode(model)
        length=len(text.encode())
        if length>ModelLimits().max_json_bytes:raise ModelUnavailable('byte_limit')
        # Weak validation excludes operational metadata; data changes remain visible.
        semantic={key:value for key,value in model.items() if key not in ('generated_at','stats')}
        etag='W/"'+hashlib.sha256(json.dumps(semantic,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()).hexdigest()+'"'
        headers=dict(data_headers(), **{'Content-Type':'application/json; charset=utf-8',
                                       'Content-Length':str(length),'X-Teacher-Data-OK':'1',
                                       'X-Public-Revision':str(model.get('revision','')),'ETag':etag,
                                       'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'})
        from .public_cache_tags import data_tags
        headers['Cache-Tag']=data_tags(table)
        from .public_http_cache import matches_etag
        condition=','.join(request.headers.getlist('if-none-match')) if hasattr(request.headers,'getlist') else request.headers.get('if-none-match')
        if matches_etag(condition,etag):
            headers.pop('Content-Type');headers.pop('Content-Length')
            return DataReply('',304,headers,True)
        return DataReply(text,200,headers,True)
    except ModelUnavailable as exc:
        logging.getLogger(__name__).warning('PublicData unavailable module=%s lang=%s reason=%s',table,lang,exc.reason)
        return error_reply(503,'PUBLIC_MODEL_UNAVAILABLE')
    except Exception:
        logging.getLogger(__name__).exception('PublicData generation failed module=%s lang=%s',table,lang)
        return error_reply(503,'PUBLIC_DATA_UNAVAILABLE')


def install(app,factory):
    from fastapi import Request
    from fastapi.responses import Response
    @app.api_route('/api/public/data/{lang}/{table}',methods=['GET','HEAD'])
    async def public_data(request:Request,lang:str,table:str):
        if data_target(request) is None:result=invalid_request(request)
        else:result=await generate(request,factory(request))
        request.state.public_data_success=result.cacheable
        body=None if request.method=='HEAD' or result.status==304 else result.text
        return Response(content=body,status_code=result.status,headers=result.headers)
