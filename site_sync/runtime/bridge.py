"""Service-binding RPC uses bounded binary bodies and small JSON control replies; media stays native."""
import json

class NativeError(Exception):
    def __init__(self,kind):super().__init__('Native operation failed');self.kind=kind

class NativeBridge:
    def __init__(self,binding,db,peer=None):self.binding,self.db,self.peer=binding,db,peer
    async def call(self,name,value):
        from site_sync.core.trace import current
        trace=current();value=dict(value,trace={k:trace[k] for k in ('request_id','task_id','stage','attempt_id') if k in trace})
        raw=json.dumps(value,separators=(',',':'))
        if len(raw.encode())>16384:raise ValueError('Native control bound')
        from backend.app.ports.operations import stage
        try:
            with stage('sync-native-rpc',rpc_method=name):
                result=await getattr(self.binding,name)(raw)
        except Exception as exc:
            # Platform termination/1101/1102 may escape RPC without a JSON reply.
            # Reconcile from durable receipts and apply resource backoff/shrinking.
            error=NativeError('resource');error.code='SYNC_RPC_FAILED';error.component='local-native';error.release='0.16.043'
            raise error from exc
        if name=='read' and not isinstance(result,str):
            request=value.get('request') or {}
            limit=request.get('length') if request.get('kind')=='slice' else 8192
            if type(limit)!=int or not 0<=limit<=4*1024*1024:raise ValueError('Native read request bound')
            if isinstance(result,(bytes,bytearray,memoryview)):
                size=result.nbytes if isinstance(result,memoryview) else len(result)
                if size>limit:raise ValueError('Native binary body bound')
                return bytes(result)
            # Check the JS buffer before crossing into Python; to_bytes copies
            # once instead of to_py(memoryview) followed by another bytes copy.
            size=getattr(result,'byteLength',None)
            if type(size)!=int or not 0<=size<=limit or not callable(getattr(result,'to_bytes',None)):
                raise ValueError('Invalid native binary reply')
            data=result.to_bytes()
            if not isinstance(data,bytes) or len(data)!=size:raise ValueError('Native binary length changed')
            return data
        if not isinstance(result,str) or len(result)>16384:raise ValueError('Native response bound')
        data=json.loads(result)
        if not isinstance(data,dict):raise ValueError('Invalid native control reply')
        if not data.get('ok'):
            error=NativeError(data.get('kind','temporary'))
            for key in ('http_status','platform_code','ray_id','stage','error_type','reason','code','request_id','peer_request_id','peer_component','peer_stage','peer_release','component','release','native_frames'):setattr(error,key,data.get(key))
            raise error
        if name=='read':
            error=NativeError('temporary');error.code='SYNC_NATIVE_PROTOCOL';error.component='local-native'
            raise error
        return data['value']
    async def read(self,request):
        return await self.call('read',{'peer':self.peer,'request':request})
    async def step(self,f,item,parts):
        peers=await self.db.query('SELECT p.origin,p.secret_ref FROM sync_peers p JOIN sync_tasks t ON t.peer_id=p.peer_id WHERE t.task_id=?',(f['task_id'],))
        return await self.call('step',{'peer':peers[0],'file':f,'item':{'task_id':f['task_id'],'module':item['module'],'record_id':item['record_id'],'source_version':item['source_version'],'snapshot_hash':json.loads(item.get('manifest_json') or '{}').get('snapshot_hash')}})
    async def discard(self,f):return await self.call('discard',{'file':f})
