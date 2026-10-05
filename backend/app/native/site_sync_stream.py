"""Native local/R2 streaming operations; Python never holds a whole media file."""
import asyncio,hashlib,os
from .catalog import Error
from .storage import key_path
from .media_inventory_store import inventory,js_options,file_version,digest

async def checksum(store,key,size):
    if hasattr(store,'root'):
        h=hashlib.sha256();count=0
        with inventory(store).path(key).open('rb') as stream:
            while data:=stream.read(65536):h.update(data);count+=len(data)
        if count!=size:raise Error('文件长度变化，未提交',409)
        return h.hexdigest()
    import js
    obj=await store.bucket.get(store.prefix+key_path(key))
    if obj is None or int(obj.size)!=size:raise Error('文件缺失或长度变化',409)
    target=js.crypto.DigestStream.new('SHA-256')
    await obj.body.pipeTo(target)
    return bytes(js.Uint8Array.new(await target.digest).to_py()).hex()

def discard_temp(store,key):
    if hasattr(store,'root'):
        dest=inventory(store).path(key)
        dest.with_name(dest.name+'.sync-compose.tmp').unlink(missing_ok=True)

async def compose(source,target,parts,key,*,exclusive=False,versions=None):
    """A bounded list of native streams; each part includes its exact expected size."""
    key_path(key);size=sum(n for _,n in parts)
    if versions is not None:
        if len(versions)!=len(parts):raise Error('合并来源版本参数无效',409)
        for (src,expected),version in zip(parts,versions):
            head=await inventory(source).head(src)
            if not head or head['size']!=expected or head['version']!=version:raise Error('合并来源发生变化',409,'sync_conflict')
    if hasattr(source,'root') and hasattr(target,'root'):
        store=inventory(target);dest=store.path(key);dest.parent.mkdir(parents=True,exist_ok=True)
        temp=dest.with_name(dest.name+'.sync-compose.tmp')
        discard_temp(target,key)
        try:
            with temp.open('xb') as out:
                for part_index,(src,expected) in enumerate(parts):
                    count=0
                    with inventory(source).path(src).open('rb') as stream:
                        if versions is not None and file_version(os.fstat(stream.fileno()))!=versions[part_index]:raise Error('合并来源发生变化',409,'sync_conflict')
                        while data:=stream.read(65536):
                            count+=len(data)
                            if count>expected:raise Error('暂存分片长度不符',409)
                            out.write(data)
                        if versions is not None and file_version(os.fstat(stream.fileno()))!=versions[part_index]:raise Error('合并来源发生变化',409,'sync_conflict')
                    if count!=expected:raise Error('暂存分片不完整',409)
                out.flush();os.fsync(out.fileno())
            if exclusive:
                try:os.link(temp,dest)
                except FileExistsError:raise Error('目标文件已存在，请重试核对',409) from None
            else:os.replace(temp,dest)
        finally:temp.unlink(missing_ok=True)
        return await inventory(target).head(key)
    if hasattr(source,'root') or hasattr(target,'root'):raise Error('同步存储类型组合不受支持')
    import js
    bridge=js.FixedLengthStream.new(size)
    async def feed():
        for part_index,(src,expected) in enumerate(parts):
            obj=await source.bucket.get(source.prefix+key_path(src))
            if obj is None or int(obj.size)!=expected:raise Error('暂存分片缺失或长度不符',409)
            if versions is not None and digest(str(obj.version))!=versions[part_index]:
                await obj.body.cancel()
                raise Error('合并来源发生变化',409,'sync_conflict')
            await obj.body.pipeTo(bridge.writable,js_options({'preventClose':True}))
        writer=bridge.writable.getWriter()
        try:await writer.close()
        finally:writer.releaseLock()
    async def upload():
        if exclusive:return await target.bucket.put(target.prefix+key,bridge.readable,js_options({'onlyIf':{'etagDoesNotMatch':'*'}}))
        return await target.bucket.put(target.prefix+key,bridge.readable)
    producer=asyncio.create_task(feed());consumer=asyncio.create_task(upload())
    try:
        done,_=await asyncio.wait((producer,consumer),return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            result=task.result()
            if task is consumer and result is None:raise Error('目标文件已存在，请重试核对',409)
        results=await asyncio.gather(producer,consumer)
        if results[1] is None:raise Error('目标文件已存在，请重试核对',409)
    finally:
        for task in (producer,consumer):
            if not task.done():task.cancel()
        await asyncio.gather(producer,consumer,return_exceptions=True)
        # Any rejected stream is confined to this operation, never retained across requests.
        try:await bridge.writable.abort()
        except Exception:pass

    result=results[1]
    return {'key':key,'size':int(result.size),'version':digest(str(result.version))}
