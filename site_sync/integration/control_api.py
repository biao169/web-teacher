"""Host session and CSRF protected recovery control."""
from fastapi import Request
from fastapi.responses import JSONResponse
from backend.app.native.data_tools import authorize
from backend.app.native.catalog import Error
from . import control

def install(app,resources,csrf):
    from backend.app.native.web_common import payload
    @app.api_route('/api/admin/site-sync/control',methods=['GET','POST'])
    async def handle(request:Request):
        r=await resources(request);authorize(r,'edit')
        if not r.p.get('is_system'):raise Error('仅系统管理员可操作站点同步开关',403)
        if request.method=='POST':
            if request.headers.get('content-type','').split(';')[0]!='application/json':raise Error('需要JSON请求',415)
            data=await payload(request,1024);csrf(request,r,data)
            if set(data)!={'paused'} or type(data['paused'])!=bool:raise Error('需要布尔值paused',400)
            result=await control.save(r,data['paused'])
        else:result=await control.status(r)
        return JSONResponse(result,headers={'Cache-Control':'no-store'})
