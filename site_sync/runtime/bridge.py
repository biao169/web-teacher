"""Service-binding RPC transports only bounded JSON, never media streams."""
import base64
import json

class NativeError(Exception):
    def __init__(self,kind):super().__init__('Native operation failed');self.kind=kind

class NativeBridge:
    def __init__(self,binding,db,peer=None):self.binding,self.db,self.peer=binding,db,peer
    async def call(self,name,value):
        raw=json.dumps(value,separators=(',',':'))
        if len(raw.encode())>16384:raise ValueError('Native control bound')
        try:result=await getattr(self.binding,name)(raw)
        except Exception as exc:
            # Platform termination/1101/1102 may escape RPC without a JSON reply.
            # Reconcile from durable receipts and apply resource backoff/shrinking.
            raise NativeError('resource') from exc
        if not isinstance(result,str) or len(result)>5600000:raise ValueError('Native response bound')
        data=json.loads(result)
        if not data.get('ok'):
            error=NativeError(data.get('kind','temporary'))
            for key in ('http_status','platform_code','ray_id','stage','error_type','reason','code'):setattr(error,key,data.get(key))
            raise error
        return data['value']
    async def read(self,request):
        result=await self.call('read',{'peer':self.peer,'request':request})
        if len(result)>5592408:raise ValueError('Native body bound')
        return base64.b64decode(result,validate=True)
    async def step(self,f,item,parts):
        peers=await self.db.query('SELECT p.origin,p.secret_ref FROM sync_peers p JOIN sync_tasks t ON t.peer_id=p.peer_id WHERE t.task_id=?',(f['task_id'],))
        return await self.call('step',{'peer':peers[0],'file':f,'item':{'task_id':f['task_id'],'module':item['module'],'record_id':item['record_id'],'source_version':item['source_version'],'snapshot_hash':json.loads(item.get('manifest_json') or '{}').get('snapshot_hash')}})
    async def discard(self,f):return await self.call('discard',{'file':f})
