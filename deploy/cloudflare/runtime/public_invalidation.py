"""Internal commit relay and per-entrypoint cache control. No HTTP maintenance route."""
import asyncio,base64,json
from backend.app.native.public_cache_tags import HEADER,Plan,validate_payload,COMMON,MODULES,module_tag


def encode(plan):return base64.urlsafe_b64encode(json.dumps(plan.payload(),separators=(',',':')).encode()).decode().rstrip('=')

def decode(value):
    if not isinstance(value,str) or not 1<=len(value)<=8192:raise ValueError('Invalid commit header')
    return validate_payload(json.loads(base64.b64decode(value+'='*((-len(value))%4),altchars=b'-_',validate=True)))

def copy_response(response):
    from js import Response
    return Response.new(response.body,getattr(response,'js_object',response))

def with_commit(response,plan):
    if not plan:return response
    response=copy_response(response);response.headers.set(HEADER,encode(plan));return response

async def update(ctx,payload,*,data=False):
    # Custom RPC bypasses response caching and runs in the owning cache entrypoint.
    if hasattr(payload,'to_py'):payload=payload.to_py()
    if isinstance(payload,str):
        if len(payload)>8192:raise ValueError('Invalid cache plan')
        payload=json.loads(payload)
    plan=validate_payload(payload)
    if data:
        allowed={module_tag(t) for t in MODULES}|{'public-translations','public-media'}
        plan.invalidate.intersection_update(allowed);plan.purge.intersection_update(allowed)
    outcomes=[]
    for mode,tags in plan.payload().items():
        if not tags:continue
        from pyodide.ffi import to_js
        from js import Object
        options=to_js({'tags':tags},dict_converter=Object.fromEntries)
        result=await getattr(ctx.cache,mode)(options)
        if hasattr(result,'to_py'):result=result.to_py()
        accepted=result.get('success') is True if isinstance(result,dict) else getattr(result,'success',False) is True
        outcomes.append(accepted)
    return all(outcomes)

async def relay(response,ctx):
    headers=getattr(response,'headers',None)
    value=headers.get(HEADER) if headers is not None else None
    if value is None:return response
    response=copy_response(response);response.headers.delete(HEADER)
    try:
        plan=decode(str(value));payload=json.dumps(plan.payload(),separators=(',',':'))
        jobs=[ctx.exports.PublicPage.update_public_cache(payload)]
        data_tags={module_tag(t) for t in MODULES}|{'public-translations','public-media'}
        data_plan=Plan(invalidate=plan.invalidate & data_tags,purge=plan.purge & data_tags)
        if data_plan:jobs.append(ctx.exports.PublicData.update_public_cache(json.dumps(data_plan.payload(),separators=(',',':'))))
        results=await asyncio.wait_for(asyncio.gather(*jobs,return_exceptions=True),3)
        success=all(v is True for v in results)
    except Exception:success=False
    # A failed notification must never turn an already committed save into a retryable write.
    response.headers.set('X-Teacher-Cache-Update','accepted' if success else 'pending')
    if not success:
        from worker_runtime.diagnostics import emit
        emit('PUBLIC-CACHE-NOTIFY','FAILED',code='PUBLIC_CACHE_UPDATE_PENDING')
    return response
