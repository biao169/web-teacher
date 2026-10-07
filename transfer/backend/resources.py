"""Admission before reading payloads; one shared budget, no waiting request queue."""
import asyncio,json,os
CHUNK=1048576

class Capacity:
    def __init__(self,slots=4,budget=16*CHUNK,idle=30):
        if not 1<=slots<=8 or not 4*CHUNK<=budget<=64*CHUNK or not 1<=idle<=120:raise ValueError('Invalid transfer resource budget')
        self.limit=min(slots,budget//(4*CHUNK));self.idle=idle;self.active=0;self.peak=0
    @classmethod
    def from_env(cls):
        return cls(int(os.environ.get('TRANSFER_IO_CONCURRENCY',4)),int(os.environ.get('TRANSFER_BUFFER_MIB',16))*CHUNK,int(os.environ.get('TRANSFER_IO_IDLE_SECONDS',30)))

class BoundedIO:
    """ASGI gate holds its slot through streaming completion and releases on cancellation."""
    def __init__(self,app,capacity):self.app,self.capacity=app,capacity
    async def __call__(self,scope,receive,send):
        path=scope.get('path','')
        bulk=scope['type']=='http' and ('/s/' in path or path.endswith('/chunk'))
        if not bulk:return await self.app(scope,receive,send)
        pool=self.capacity
        if pool.active>=pool.limit:
            body=json.dumps({'error':'快传繁忙，请稍后重试；主站仍可访问'},ensure_ascii=False).encode()
            await send({'type':'http.response.start','status':503,'headers':[(b'content-type',b'application/json; charset=utf-8'),(b'retry-after',b'2'),(b'cache-control',b'no-store')]})
            return await send({'type':'http.response.body','body':body})
        pool.active+=1;pool.peak=max(pool.peak,pool.active);started=False
        async def read():return await asyncio.wait_for(receive(),pool.idle)
        async def write(message):
            nonlocal started
            await asyncio.wait_for(send(message),pool.idle)
            if message['type']=='http.response.start':started=True
        try:await self.app(scope,read,write)
        except TimeoutError:
            if started:raise # Transport closes an incomplete response; never report success.
            body=b'{"error":"Transfer input timed out"}'
            await send({'type':'http.response.start','status':408,'headers':[(b'content-type',b'application/json')]})
            await send({'type':'http.response.body','body':body})
        finally:pool.active-=1

async def read_chunk(request):
    """Limit the body and total receive time; slow trickles cannot hold a slot forever."""
    from backend.app.native.catalog import Error
    length=request.headers.get('content-length')
    if length is not None and (not length.isascii() or not length.isdigit() or int(length)>CHUNK):raise Error('分块过大或长度无效',413)
    data=bytearray();iterator=request.stream().__aiter__();deadline=asyncio.get_running_loop().time()+120
    try:
        while True:
            remaining=deadline-asyncio.get_running_loop().time()
            if remaining<=0:raise TimeoutError()
            try:part=await asyncio.wait_for(iterator.__anext__(),remaining)
            except StopAsyncIteration:break
            if len(data)+len(part)>CHUNK:raise Error('分块过大',413)
            data.extend(part)
    except TimeoutError:raise Error('分块接收超时，请核对检查点后重试',408) from None
    return bytes(data)

from backend.app.native.storage import LocalStore

class DurableStore(LocalStore):
    """Reuse atomic local writes, flushing a transfer chunk before metadata acknowledgement."""
    async def put(self,key,data):
        await super().put(key,data)
        path=self.path(key)
        with path.open('r+b') as file:os.fsync(file.fileno())
        if os.name!='nt':
            fd=os.open(path.parent,os.O_RDONLY)
            try:os.fsync(fd)
            finally:os.close(fd)

    async def delete(self,key):
        # Cleanup must not traverse even an in-root link into another task.
        from backend.app.native.media_inventory_store import LocalInventory
        LocalInventory(self).path(key).unlink(missing_ok=True)

    async def prune_task(self,id,limit=8):
        """Remove only generated stale chunks/temp files in one terminated task folder."""
        import re,stat
        from backend.app.native.catalog import Error
        from backend.app.native.media_inventory_store import LocalInventory
        if not re.fullmatch('[a-f0-9]{32}',id):raise Error('无效任务目录')
        inventory=LocalInventory(self);folder=inventory.path(id)
        removed=0
        try:
            with os.scandir(folder) as entries:
                for entry in entries:
                    if removed>=limit:return {'done':False,'removed':removed}
                    if not re.fullmatch(r'[a-f0-9]{32}\.part(?:\.[a-f0-9]{16}\.tmp)?',entry.name):raise Error('任务目录包含非快传生成文件，自动清理已停止',409)
                    path=inventory.path(id+'/'+entry.name)
                    if not stat.S_ISREG(path.stat().st_mode):raise Error('任务目录包含特殊对象，自动清理已停止',409)
                    path.unlink(missing_ok=True);removed+=1
            folder.rmdir()
        except FileNotFoundError:pass
        return {'done':True,'removed':removed}
