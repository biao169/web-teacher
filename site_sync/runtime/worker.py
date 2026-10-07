"""Python Worker entry; scheduled/service-binding wake, health-only public HTTP."""
import json
from workers import WorkerEntrypoint,Response
from site_sync.adapters.d1 import D1
from site_sync.adapters.worker_peer import WorkerPeer
from site_sync.adapters.worker_media import WorkerMedia
from .bridge import NativeBridge
from .service import Runtime,load_factory

class Default(WorkerEntrypoint):
    async def runtime(self):
        db=D1(self.env.DB)
        raw=getattr(self.env,'WEBSITE_ADAPTER_CONFIG','{}')
        if len(raw)>8192:raise ValueError('Adapter config too large')
        adapter=load_factory(self.env.WEBSITE_ADAPTER)(db,json.loads(raw))
        async def peer(task):
            rows=await db.query('SELECT origin,secret_ref FROM sync_peers WHERE peer_id=?',(task['peer_id'],))
            return WorkerPeer(NativeBridge(self.env.NATIVE,db,rows[0]))
        return Runtime(db,adapter,peer,lambda repo:WorkerMedia(repo,NativeBridge(self.env.NATIVE,db)),platform='worker',history_days=int(getattr(self.env,'SYNC_HISTORY_DAYS','90')))
    async def run_once(self):
        if getattr(self.env,'SYNC_ENABLED','0')!='1':return {'action':'disabled'}
        runtime=await self.runtime()
        return await runtime.tick()
    async def scheduled(self,controller,env=None,ctx=None):
        result=await self.run_once()
        # No payloads, URLs, secrets or per-chunk debug traces.
        if result['action'] not in ('idle','disabled'):print(json.dumps(result))
    async def tick(self):
        # Private service-binding RPC for an authenticated admin host. Not fetch.
        return json.dumps(await self.run_once())
    async def fetch(self,request):
        from urllib.parse import urlsplit
        if request.method!='GET' or urlsplit(request.url).path!='/health':return Response('Not found',status=404)
        try:
            runtime=await self.runtime();await runtime.check()
            return Response(json.dumps({'ready':True,'sync_enabled':getattr(self.env,'SYNC_ENABLED','0')=='1'}),headers={'content-type':'application/json','cache-control':'no-store'})
        except Exception:
            return Response('{"ready":false}',status=503,headers={'content-type':'application/json','cache-control':'no-store'})
