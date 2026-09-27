"""Local disk admission and resumable expiry maintenance; no new tables or user grants."""
import asyncio,errno,json,shutil,time
from backend.app.native.catalog import Error
from .accounting import milliseconds as ms,assertion
from .native import Transfers
from .management import Management

SAFE=9007199254740991
DEFAULT_FREE=64*1024*1024
PENDING="""SELECT coalesce(sum(max(0,CAST(s.reserved_bytes AS INTEGER)-coalesce(json_extract(r.point,'$.bytes'),0))),0) n
 FROM temporary_shares s JOIN recovery_tasks r ON r.id=s.id
 WHERE s.state IN ('uploading','paused') AND s.expires_at>?"""
ELIGIBLE="s.state!='deleted' AND (s.expires_at<=? OR s.state='revoked')"

class DiskBudget:
    def __init__(self,root,disk_usage=shutil.disk_usage):
        self.root=root;self.disk_usage=disk_usage;self.lock=asyncio.Lock()
    async def run(self,operation):
        async with self.lock:
            task=asyncio.create_task(operation())
            try:return await asyncio.shield(task)
            except asyncio.CancelledError:
                try:await task
                finally:raise
    async def snapshot(self,sql,settings):
        try:disk=self.disk_usage(self.root)
        except OSError:raise Error('无法读取快传磁盘容量，暂不接受缓存上传',503) from None
        pending=int((await sql.query(PENDING,(ms(),)))[0]['n'])
        floor=int(settings.get('temporaryFreeBytes',DEFAULT_FREE))
        return {'disk_free_bytes':disk.free,'disk_total_bytes':disk.total,'pending_upload_bytes':pending,
                'disk_reserve_bytes':floor,'disk_available_bytes':max(0,disk.free-floor-pending)}
    async def check(self,sql,settings,additional=0):
        value=await self.snapshot(sql,settings)
        if value['disk_free_bytes']<value['pending_upload_bytes']+value['disk_reserve_bytes']+additional:
            raise Error('快传磁盘可用空间不足（含未完成上传预留与安全余量），请清理缓存或取消未完成任务后重试',507)
    async def write(self,service,id,key,data,settings):
        await self.check(service.sql,settings)
        try:await service.store.put(key,data)
        except OSError as exc:
            # Atomic put may have succeeded before fsync failed. Never leave this key
            # advertised as a confirmed chunk. Deletion errors remain inspectable orphans.
            try:await service.store.delete(key)
            except OSError:pass
            if exc.errno in (errno.ENOSPC,errno.EDQUOT):raise Error('磁盘或文件系统额度不足，本块未确认；释放空间后可继续',507) from None
            raise Error('缓存文件写入失败，本块未确认，请检查磁盘权限或设备状态后继续',503) from None

class ExpiredService(Transfers):
    """Private worker capability, never constructed by an HTTP identity parameter."""
    async def task(self,id,p):
        rows=await self.sql.query('SELECT s.* FROM temporary_shares s WHERE s.id=? AND '+ELIGIBLE,(id,ms()))
        if not rows:raise Error('任务未到期且未撤销，自动清理拒绝处理',409)
        return rows[0]

class ExpiryCleanup(Management):
    def __init__(self,service,id):super().__init__(service,{'uid':'system:transfer-expiry'});self.id=id
    async def require(self):await self.s.task(self.id,self.p)
    def guard(self):return assertion('EXISTS(SELECT 1 FROM temporary_shares s WHERE s.id=? AND '+ELIGIBLE+')',(self.id,ms()))

class Maintenance:
    def __init__(self,sql,store):
        self.sql=sql;self.service=ExpiredService(sql,store,indexed=True);self.lock=asyncio.Lock();self.stopped=asyncio.Event()
        self.status={'running':False,'last_run':None,'removed_chunks':0,'completed_tasks':0,'failed_tasks':0,'error':''}
    async def tick(self,batches=32):
        async with self.lock:
            removed=completed=failed=0;at=ms();rows=[]
            for _ in range(batches):
                rows=await self.sql.query("SELECT s.id FROM temporary_shares s JOIN recovery_tasks r ON r.id=s.id WHERE "+ELIGIBLE+" AND coalesce(json_extract(r.extra,'$.cleanup_until'),0)<=? AND (coalesce(json_extract(r.extra,'$.cleanup_error'),'')='' OR coalesce(json_extract(r.extra,'$.cleanup_requested'),0)<=?) ORDER BY coalesce(json_extract(r.extra,'$.cleanup_requested'),0),s.created_at,s.id LIMIT 1",(ms(),ms(),ms()-60000))
                if not rows:break
                try:
                    result=await ExpiryCleanup(self.service,rows[0]['id']).purge(rows[0]['id']);removed+=result['removed'];completed+=int(result['done'])
                except Exception:
                    failed+=1
                    # purge persists its per-task failure state/lease. Don't store paths,
                    # credentials, or exception details in a global/public status.
                    self.status['error']='部分到期任务清理失败，将按检查点重试；请查看任务列表的清理失败状态。'
                await asyncio.sleep(0)
            self.status.update(last_run=at,removed_chunks=removed,completed_tasks=completed,failed_tasks=failed)
            if not failed:self.status['error']=''
            return {'removed_chunks':removed,'completed_tasks':completed,'failed_tasks':failed,'more':bool(rows) and removed>0}
    async def run(self):
        self.status['running']=True
        try:
            while not self.stopped.is_set():
                delay=60
                try:
                    rows=await self.sql.query('SELECT document FROM tool_settings WHERE id=1')
                    if rows:
                        settings=json.loads(rows[0]['document'])
                        if settings.get('temporaryAutoCleanup',True):
                            result=await self.tick();delay=1 if result['more'] else min(60,int(settings.get('temporaryCleanupMinutes',15))*60) if result['failed_tasks'] else int(settings.get('temporaryCleanupMinutes',15))*60
                        else:delay=30
                except Exception:self.status['error']='自动清理检查失败，稍后重试；原文件和检查点保留。'
                try:await asyncio.wait_for(self.stopped.wait(),delay)
                except TimeoutError:pass
        finally:self.status['running']=False
