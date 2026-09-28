"""媒体目录只读列举、版本核对及受控收录；支持Unicode原文件名，拒绝路径逃逸。"""
import os,stat,hashlib,json
from pathlib import Path
from .catalog import Error
from .storage import key_path

def relative_key(value,empty=False):
    """扫描键可含中文，但不能是绝对路径、空段、控制字符或父目录。"""
    if empty and value=='':return value
    if not isinstance(value,str) or not value or len(value)>1024 or value.startswith('/') or '\\' in value or ':' in value or any(ord(c)<32 for c in value) or any(p in ('','.','..') for p in value.split('/')):
        raise Error('媒体相对路径无效')
    return value

def digest(value):
    """将平台版本信息转换为固定长度比较值，不作为内容校验值。"""
    return hashlib.sha256(str(value).encode()).hexdigest()

def file_version(info):
    """共用本地文件版本格式；核对/删除仍保留严格版本检查。"""
    return digest((info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns,info.st_ctime_ns))

def js_options(value):
    """在Worker中将纯Python配置转换为普通JS对象；本地测试可替换此边界。"""
    import js
    return js.JSON.parse(json.dumps(value))

class LocalInventory:
    def __init__(self,store):
        """限定于既有存储根目录，不创建额外媒体目录。"""
        self.store=store;self.root=store.root
    def path(self,key,empty=False):
        """拒绝所有符号链接/Windows联接点，包含指向根目录内部的链接。"""
        relative_key(key,empty);p=self.root
        for part in key.split('/') if key else []:
            p=p/part
            if p.is_symlink() or (hasattr(p,'is_junction') and p.is_junction()):raise Error('跳过链接或联接点')
        if not p.resolve().is_relative_to(self.root.resolve()):raise Error('路径超出媒体目录')
        return p
    async def head(self,key):
        """读取普通文件实际大小和inode/时间版本，不读文件正文。"""
        p=self.path(key)
        try:s=p.stat()
        except FileNotFoundError:return None
        if not stat.S_ISREG(s.st_mode):raise Error('此对象不是普通文件')
        return {'key':key,'size':s.st_size,'version':file_version(s)}
    def open_reader(self,key):
        """鉴权后调用：只定位并打开一次，元信息与文件头来自同一个文件句柄。"""
        path=self.path(key)
        # 不跟随最终符号链接；非阻塞打开避免误把管道当媒体文件等待。
        flags=os.O_RDONLY|getattr(os,'O_BINARY',0)|getattr(os,'O_NOFOLLOW',0)|getattr(os,'O_NONBLOCK',0)
        fd=os.open(path,flags)
        try:handle=os.fdopen(fd,'rb')
        except BaseException:
            os.close(fd);raise
        try:
            info=os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode):raise Error('此对象不是普通媒体文件',404)
            prefix=handle.read(512);handle.seek(0)
            return handle,{'key':key,'size':info.st_size,'version':file_version(info)},prefix
        except BaseException:
            handle.close();raise
    def absolute_path(self,key):
        """仅用于已授权后台展示；不接受范围外路径，不跟随目录内链接。"""
        return str(self.path(key).resolve())
    async def read(self,key,limit):
        """对目录内Unicode文件进行有界读取，调用者负责前后版本一致性。"""
        p=self.path(key)
        if not stat.S_ISREG(p.stat().st_mode):raise Error('此对象不是普通文件')
        with p.open('rb') as handle:data=handle.read(limit+1)
        if len(data)>limit:raise Error('文件超过收录大小限制',413)
        return data
    async def read_range(self,key,offset,length,version):
        """只读取指定64KiB以内区间；文件替换或读取中变化时停止返回。"""
        if offset<0 or not 0<length<=65536:raise Error('媒体读取区间无效')
        p=self.path(key)
        try:
            with p.open('rb') as handle:
                before=os.fstat(handle.fileno())
                current=file_version(before)
                if not stat.S_ISREG(before.st_mode) or current!=version:raise Error('媒体文件已变化，请重新打开',409)
                handle.seek(offset);data=handle.read(length)
                after=os.fstat(handle.fileno())
                if file_version(after)!=version:raise Error('媒体文件已变化，请重新打开',409)
        except FileNotFoundError:raise Error('媒体文件不存在',404) from None
        if len(data)!=length:raise Error('媒体文件读取不完整',409)
        return data
    async def list_page(self,cursor=None,limit=20,prefix=''):
        """深度优先游标，每批最多访问20个目录条目；不把整棵目录树载入内存。"""
        stack=json.loads(json.dumps(cursor)) if cursor else [{'path':prefix,'offset':0}]
        rows=[];visited=0
        while stack and visited<limit:
            frame=stack[-1]
            try:
                folder=self.path(frame['path'],True)
                with os.scandir(folder) as entries:
                    # Resume an OS directory cursor without persisting handles or retaining all names.
                    for _ in range(frame['offset']):next(entries,None)
                    while visited<limit:
                        entry=next(entries,None)
                        if entry is None:stack.pop();break
                        frame['offset']+=1;visited+=1;key=(frame['path']+'/' if frame['path'] else '')+entry.name
                        try:
                            p=self.path(key)
                            if p.is_dir():
                                if len(stack)>=32:raise Error('目录超过32层，未继续深入')
                                stack.append({'path':key,'offset':0});break
                            row=await self.head(key)
                            if row:rows.append(row)
                        except (Error,OSError):rows.append({'key':key,'size':0,'version':'','error':'路径不可读取或为链接/特殊文件'})
            except FileNotFoundError:
                stack.pop();visited+=1
            except (Error,OSError):
                rows.append({'key':frame['path'],'size':0,'version':'','error':'目录不可读取'})
                stack.pop();visited+=1
        return {'objects':rows,'cursor':stack or None,'truncated':bool(stack),'visited':visited}
    async def create(self,key,data):
        """新副本只允许独占创建，碰到已有文件立即停止。"""
        p=self.path(key_path(key));p.parent.mkdir(parents=True,exist_ok=True)
        try:
            with p.open('xb') as f:f.write(data)
        except FileExistsError:raise Error('目标文件已存在，请重新预检',409) from None
    async def delete(self,key,version):
        """删除前再检查实际版本；不跟随链接，不递归删除目录。"""
        info=await self.head(key)
        if not info:return
        if info['version']!=version:raise Error('文件内容或位置已变化，请重新预检',409)
        self.path(key).unlink()

class R2Inventory:
    def __init__(self,store):
        """复用配置的桶绑定和媒体前缀。"""
        self.store=store;self.bucket=store.bucket;self.prefix=store.prefix
    async def head(self,key):
        """R2 head仅读取元信息，version用于识别对象替换。"""
        obj=await self.bucket.head(self.prefix+relative_key(key))
        return None if obj is None else {'key':key,'size':int(obj.size),'version':digest(str(obj.version))}
    async def read(self,key,limit):
        """先查实际大小再读取R2正文，保持平台内存上限。"""
        import js
        obj=await self.bucket.get(self.prefix+relative_key(key))
        if obj is None:raise Error('文件已不存在',409)
        if obj.size>limit:raise Error('文件超过收录大小限制',413)
        return bytes(js.Uint8Array.new(await obj.arrayBuffer()).to_py())
    async def read_range(self,key,offset,length,version):
        """向R2申请有界区间，检查上传版本和实际返回范围后才读取缓冲区。"""
        import js
        if offset<0 or not 0<length<=1048576:raise Error('媒体读取区间无效')
        obj=await self.bucket.get(self.prefix+relative_key(key),js_options({'range':{'offset':offset,'length':length}}))
        if obj is None:raise Error('媒体文件不存在',404)
        part=getattr(obj,'range',None)
        if digest(str(obj.version))!=version or part is None or int(part.offset)!=offset or int(part.length)!=length:
            if getattr(obj,'body',None):await obj.body.cancel()
            raise Error('媒体对象版本或返回区间不一致，请重新打开',409)
        data=bytes(js.Uint8Array.new(await obj.arrayBuffer()).to_py())
        if len(data)!=length:raise Error('媒体文件读取不完整',409)
        return data
    async def list_page(self,cursor=None,limit=20,prefix=''):
        """仅列举配置前缀，以truncated而非返回数量判断是否还有下一批。"""
        relative_key(prefix,True);options={'prefix':self.prefix+(prefix+'/' if prefix else ''),'limit':limit}
        if cursor:options['cursor']=cursor
        result=await self.bucket.list(js_options(options));rows=[]
        for obj in result.objects:
            full=str(obj.key)
            if not full.startswith(options['prefix']):raise Error('对象存储返回了范围外的文件',502)
            rows.append({'key':full[len(self.prefix):],'size':int(obj.size),'version':digest(str(obj.version))})
        following=str(result.cursor) if result.truncated else None
        if result.truncated and (not following or following==cursor):raise Error('对象存储游标未推进，请重试',502)
        return {'objects':rows,'cursor':following,'truncated':bool(result.truncated),'visited':len(rows)}
    async def create(self,key,data):
        """通过条件写入新对象，禁止覆盖已存在的目标。"""
        import js
        from pyodide.ffi import to_js
        view=to_js(data)
        try:value=js.Uint8Array.new(view)
        finally:
            if hasattr(view,'destroy'):view.destroy()
        result=await self.bucket.put(self.prefix+key_path(key),value,js_options({'onlyIf':{'etagDoesNotMatch':'*'}}))
        if result is None:raise Error('目标文件已存在，请重新预检',409)
    async def delete(self,key,version):
        """删除前复核版本；目录应由应用管理，R2 delete本身无条件版本参数。"""
        info=await self.head(key)
        if not info:return
        if info['version']!=version:raise Error('文件已变化，请重新预检',409)
        await self.bucket.delete(self.prefix+relative_key(key))

def inventory(store):
    """按存储适配器选择目录能力，媒体与缓存始终使用各自配置。"""
    return LocalInventory(store) if hasattr(store,'root') else R2Inventory(store)
