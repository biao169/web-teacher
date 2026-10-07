"""Metadata/record-only Python bridge; media never crosses Python/JS FFI."""
import json
from site_sync.core.authority import AuthorizationError,ConflictError,ResourceError
from site_sync.transport.protocol import manifest


class WorkerPeer:
    def __init__(self,bridge):self.bridge=bridge
    async def read(self,request):
        try:return bytes(await self.bridge.read(request))
        except Exception as exc:
            cls={'authorization':AuthorizationError,'conflict':ConflictError,'resource':ResourceError}.get(getattr(exc,'kind',None))
            if cls:raise cls('Native peer request rejected') from exc
            raise
    async def manifest(self,item):
        data=await self.read(dict(kind='manifest',task=item.get('task_id',''),module=item['module'],record=item['record_id'],version=item['source_version']))
        if len(data)>8192:raise ConflictError('Manifest exceeds bound')
        try:return manifest(json.loads(data),item['source_version'])
        except (ValueError,TypeError) as exc:raise ConflictError('Invalid manifest JSON') from exc
    async def slice(self,item,field,offset,length):
        return await self.read(dict(kind='slice',task=item.get('task_id',''),module=item['module'],record=item['record_id'],version=item['source_version'],field=field,offset=offset,length=length,snapshot_hash=json.loads(item.get('manifest_json') or '{}').get('snapshot_hash')))

    async def candidates(self,request):
        data=await self.read(request)
        if len(data)>8192:raise ConflictError('Candidate page bound')
        try:return json.loads(data)
        except ValueError as exc:raise ConflictError('Invalid candidate JSON') from exc
