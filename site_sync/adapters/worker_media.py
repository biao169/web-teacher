"""Bridge supplied by the Worker host. JS owns fetch/R2 streams end-to-end.
bridge.step(file_dict,item_dict,parts) and discard(file_dict) marshal metadata
only; convert JsProxy results with to_py before returning from the host bridge.
"""
from site_sync.core.authority import ConflictError,ResourceError,AuthorizationError,CredentialRetryError
from .transfer import MediaReceipts


class WorkerMedia:
    kind='r2'
    part_bytes=5*1024*1024
    def __init__(self,repo,bridge):self.repo,self.bridge,self.receipts=repo,bridge,MediaReceipts(repo)
    async def step(self,ctx,item,f,peer):
        await self.repo.db.batch([self.repo.assertion(ctx.task,ctx.clock(),write=True)])
        parts=[]  # Native service loads bounded R2 receipts directly from D1.
        try:r=await self.bridge.step(f,item,parts)
        except Exception as e:
            kind=getattr(e,'kind',None)
            if kind=='credential':raise CredentialRetryError('Peer authentication unavailable') from e
            if kind=='resource':raise ResourceError('Worker peer resource pressure') from e
            if kind=='authorization':raise AuthorizationError('Worker peer denied') from e
            if kind=='conflict':raise ConflictError('Worker source changed') from e
            raise
        if r['kind']=='reset-upload':
            # Only the expired file loses its unavailable remote part receipts.
            # Keep task/item/body progress, approval and all other files intact.
            await self.repo.db.batch([self.repo.assertion(ctx.task,ctx.clock(),write=True,extra="t.phase='transfer' AND EXISTS(SELECT 1 FROM sync_files WHERE task_id=t.task_id AND file_id=? AND upload_id=? AND status IN ('pending','transferring'))",args=(f['file_id'],f['upload_id'])),
              ('DELETE FROM sync_file_parts WHERE task_id=? AND file_id=?',(f['task_id'],f['file_id'])),
              ("UPDATE sync_files SET upload_id=NULL,committed_bytes=0,status='pending' WHERE task_id=? AND file_id=?",(f['task_id'],f['file_id']))])
            raise ResourceError('Expired multipart session reset; retry pending')
        elif r['kind']=='upload':
            if not isinstance(r['upload_id'],str) or not 0<len(r['upload_id'])<=2048:raise ConflictError('Invalid upload receipt')
            # Creating an upload is NOT durable transferred-byte progress.
            await self.repo.db.batch([self.repo.assertion(ctx.task,ctx.clock(),write=True,extra="t.phase='transfer'"),
              ('UPDATE sync_files SET upload_id=? WHERE task_id=? AND file_id=? AND upload_id IS NULL',(r['upload_id'],f['task_id'],f['file_id']))])
        elif r['kind']=='part':await self.receipts.part(ctx,f,r['offset'],r['length'],r['etag'])
        elif r['kind']=='uploaded':await self.receipts.uploaded(ctx,f)
        else:raise ConflictError('Unknown native bridge result')
    async def discard(self,f):await self.bridge.discard(f)
