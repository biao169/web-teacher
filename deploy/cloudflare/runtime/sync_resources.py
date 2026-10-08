"""Request-local sync resources: no website factory, templates or login state."""
from types import SimpleNamespace
from backend.app.adapters.d1.sql import D1SQL
from worker_runtime.bridge import Environment
from site_sync.integration.peer_api import peer_read
from starlette.requests import Request
from starlette.responses import Response

async def application(scope,receive,send):
    if scope['type']=='lifespan':
        while True:
            event=await receive()
            if event['type']=='lifespan.startup':await send({'type':'lifespan.startup.complete'})
            elif event['type']=='lifespan.shutdown':
                await send({'type':'lifespan.shutdown.complete'});return
    if scope['type']!='http':return
    if scope['path']!='/sync/v1/read' or scope['method']!='POST':
        await Response(status_code=404)(scope,receive,send);return
    async def resources(request):
        bindings=Environment(scope['env'])
        return SimpleNamespace(sql=D1SQL(getattr(bindings,str(getattr(bindings,'TEACHER_DATABASE_BINDING','DB')))),kind='r2',sync_env=bindings)
    response=await peer_read(Request(scope,receive),resources)
    await response(scope,receive,send)
