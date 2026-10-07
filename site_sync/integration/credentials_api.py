"""Session-authorized credential endpoints. Never cache responses or echo input."""
from fastapi import Request
from fastapi.responses import JSONResponse
from backend.app.native.catalog import Error
from . import credentials
from site_sync.core.authority import AuthorizationError

PREFIX='/api/admin/site-sync/credentials'
HEADERS={'Cache-Control':'no-store, private','Pragma':'no-cache','Expires':'0','X-Content-Type-Options':'nosniff'}


def install(app,resources,csrf):
    from backend.app.native.web import payload

    @app.middleware('http')
    async def credential_headers(request,call_next):
        response=await call_next(request)
        if request.url.path==PREFIX or request.url.path.startswith(PREFIX+'/'):
            response.headers.update(HEADERS)
        return response

    async def handle(request,action):
        try:
            r=await resources(request)
            credentials.authorize_management(r)
            if action!='status':
                if request.headers.get('content-type','').split(';')[0]!='application/json':
                    raise Error('请使用JSON请求',415)
                data=await payload(request,1024)
                csrf(request,r,data)
                allowed={'key','_csrf'} if action=='save' else {'_csrf'}
                if set(data)-allowed:raise Error('请求包含不支持的字段',400)
            if action=='status':result=await credentials.status(r)
            elif action=='save':result=await credentials.save(r,data.get('key'))
            else:result=await credentials.reveal(r)
            # All runtime consumers now resolve the same site-local credential.
            result['runtime_integration']='active'
            return JSONResponse(result,headers=HEADERS)
        except Error as exc:
            return JSONResponse({'error':exc.message,'code':exc.code or 'request_failed'},status_code=exc.status,headers=HEADERS)
        except ValueError:
            return JSONResponse({'error':'同步密钥或请求格式无效','code':'invalid_input'},status_code=400,headers=HEADERS)
        except AuthorizationError:
            return JSONResponse({'error':'同步密钥未配置或配置无效','code':'credential_unavailable'},status_code=409,headers=HEADERS)
        except Exception:
            # Driver exceptions may carry bound SQL parameters, including the key.
            return JSONResponse({'error':'密钥操作未完成，请刷新后检查状态再重试','code':'credential_operation_failed'},status_code=503,headers=HEADERS)

    @app.get(PREFIX)
    async def status(request:Request):return await handle(request,'status')
    @app.post(PREFIX)
    async def save(request:Request):return await handle(request,'save')
    @app.post(PREFIX+'/reveal')
    async def reveal(request:Request):return await handle(request,'reveal')
