"""Local/R2 media and cache stores use independent configured locations, without SQL helper tables."""
import os,re,json,secrets
from pathlib import Path
from .catalog import Error

def key_path(key):
    """Object keys are relative ASCII paths, never user-supplied filesystem addresses."""
    if not isinstance(key,str) or not re.fullmatch(r'[A-Za-z0-9_/-]+(?:\.[A-Za-z0-9]+)?',key) or '..' in key or key.startswith('/') or len(key)>512:raise Error('无效对象地址')
    return key
class LocalStore:
    def __init__(self,root):"""保存构造参数和适配器，供此对象后续操作复用。""";self.root=Path(root);self.root.mkdir(parents=True,exist_ok=True)
    def path(self,key):
        """Reject symlink escape in every path component."""
        p=self.root/key_path(key)
        if not p.resolve().is_relative_to(self.root.resolve()):raise Error('无效对象地址')
        return p
    async def put(self,key,data):
        """Atomic replace within the configured store; files are private to the OS owner."""
        p=self.path(key);p.parent.mkdir(parents=True,exist_ok=True);temp=p.with_name(p.name+'.'+secrets.token_hex(8)+'.tmp')
        try:
            fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'wb') as f:f.write(data)
            os.replace(temp,p)
        finally:temp.unlink(missing_ok=True)
    async def get(self,key,max_bytes=None):
        """读取对象；可选上限最多读取限制加一字节，避免错误登记导致无界预览。"""
        p=self.path(key)
        if not p.is_file():return None
        with p.open('rb') as handle:data=handle.read() if max_bytes is None else handle.read(max_bytes+1)
        if max_bytes is not None and len(data)>max_bytes:raise Error('文件正文超过读取上限',413)
        return data
    async def delete(self,key):"""删除指定存储键对应的对象，忽略已不存在的对象。""";self.path(key).unlink(missing_ok=True)
class R2Store:
    def __init__(self,bucket,prefix):"""保存构造参数和适配器，供此对象后续操作复用。""";self.bucket=bucket;self.prefix=prefix
    async def put(self,key,data):
        """Bounded whole-object upload; authoritative metadata is committed after R2 succeeds."""
        import js
        from pyodide.ffi import to_js
        view=to_js(data)
        try:value=js.Uint8Array.new(view)
        finally:
            if hasattr(view,'destroy'):view.destroy()
        await self.bucket.put(self.prefix+key_path(key),value)
    async def get(self,key,max_bytes=None):
        """先核对R2返回的实际字节大小，可选上限在读取对象正文前生效。"""
        import js
        obj=await self.bucket.get(self.prefix+key_path(key))
        if obj is None:return None
        if max_bytes is not None and obj.size>max_bytes:raise Error('文件正文超过读取上限',413)
        return bytes(js.Uint8Array.new(await obj.arrayBuffer()).to_py())
    async def delete(self,key):"""删除指定存储键对应的对象，忽略已不存在的对象。""";await self.bucket.delete(self.prefix+key_path(key))
