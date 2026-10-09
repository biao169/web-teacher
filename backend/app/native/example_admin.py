"""Small authenticated example center; no automatic job, remote call or startup hook."""
from fastapi import Request
from .examples import Examples
from .catalog import Error

def install(app,resources,csrf,render):
    """Use shared layout and permission/CSRF handling on local and Worker deployments."""
    from .web_common import payload
    @app.get('/admin/examples')
    async def page(request:Request):
        r=await resources(request);view=await Examples(r).status()
        return await render(r,'admin/native-examples.html','data_tools',title='示例中心',examples=view)
    @app.get('/api/admin/examples/status')
    async def status(request:Request):return await Examples(await resources(request)).status()
    @app.post('/api/admin/examples/step')
    async def step(request:Request):
        r=await resources(request);data=await payload(request,4096);csrf(request,r,data)
        if set(data)-{'_csrf','group','index'}:raise Error('示例操作包含未知字段')
        return await Examples(r).step(data.get('group'),data.get('index'))
