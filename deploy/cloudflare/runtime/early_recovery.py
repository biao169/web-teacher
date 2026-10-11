"""Static last-resort document; standard library and workers.Response only."""
HTML='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page temporarily unavailable</title><style>body{background:#f4f7fa;color:#24364a;font:16px system-ui;margin:0}main{max-width:38rem;margin:12vh auto;padding:2rem;background:white;border-radius:18px;line-height:1.8}button{padding:12px 20px;cursor:pointer}small{overflow-wrap:anywhere}</style><main data-public-recovery><h1>页面暂时未能加载 / Temporarily unavailable</h1><p data-recovery-message>正在尝试重新获取内容 / Trying fresh content.</p><p data-recovery-status>请稍候 / Please wait</p><button data-recovery-reload>重新加载 / Reload</button><p><small>REQUEST: @@TRACE@@</small></p></main><script src="/assets/public/js/public-recovery.js?v=0.16.088" defer></script></html>'''

def recover(request,exc):
    from urllib.parse import urlsplit
    import secrets,json,traceback
    from workers import Response
    path=urlsplit(str(request.url)).path
    headers=getattr(request,'headers',{})
    # Only ordinary Public document reads; preserve other entrypoint error semantics.
    if str(getattr(request,'method','GET')) not in ('GET','HEAD') or not (path=='/' or path.split('/')[1] in ('en','zh')) or headers.get('x-public-fragment')=='1' or 'application/json' in str(headers.get('accept') or ''):
        raise exc
    trace=secrets.token_hex(16)
    frames=[{'file':x.filename.rsplit('/',2)[-1],'line':x.lineno,'function':x.name} for x in traceback.extract_tb(exc.__traceback__)[-12:]]
    print(json.dumps({'stage':'PUBLIC-EARLY-ERROR','request_id':trace,'path':path,'ray_id':headers.get('cf-ray'),'error_type':type(exc).__name__,'frames':frames}),flush=True)
    return Response('' if request.method=='HEAD' else HTML.replace('@@TRACE@@',trace),status=503,headers={'content-type':'text/html; charset=utf-8','cache-control':'no-store','cloudflare-cdn-cache-control':'no-store','retry-after':'1','x-request-id':trace,'x-public-recovery':'1','x-teacher-release':'0.16.088'})
