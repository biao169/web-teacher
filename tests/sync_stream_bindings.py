"""In-memory bindings for native stream adapter contracts, not Cloudflare CPU tests."""
import asyncio,hashlib
from types import SimpleNamespace

class Writable:
 def __init__(self):self.queue=asyncio.Queue();self.closed=False
 async def write(self,data):await self.queue.put(bytes(data))
 async def close(self):self.closed=True;await self.queue.put(None)
 async def abort(self):
  if not self.closed:self.closed=True;await self.queue.put(RuntimeError('aborted'))
 def getWriter(self):return self
 def releaseLock(self):pass

class Readable:
 def __init__(self,writable,size):self.writable=writable;self.size=size
 async def consume(self):
  result=bytearray()
  while True:
   part=await self.writable.queue.get()
   if part is None:break
   if isinstance(part,Exception):raise part
   result.extend(part)
   if len(result)>self.size:raise ValueError('fixed stream overflow')
  if len(result)!=self.size:raise ValueError('fixed stream underflow')
  return bytes(result)

class Body:
 def __init__(self,data):self.data=data
 async def pipeTo(self,target,options=None):
  await target.write(self.data)
  if not options or not options.get('preventClose'):await target.close()
 async def cancel(self):pass

class Digest:
 def __init__(self,algorithm):assert algorithm=='SHA-256';self.hash=hashlib.sha256();self.closed=False
 async def write(self,data):self.hash.update(data)
 async def close(self):self.closed=True
 @property
 def digest(self):
  async def value():assert self.closed;return self.hash.digest()
  return value()

def install(js):
 def fixed(size):
  writer=Writable();return SimpleNamespace(writable=writer,readable=Readable(writer,size))
 js.FixedLengthStream=SimpleNamespace(new=fixed)
 js.crypto=SimpleNamespace(DigestStream=SimpleNamespace(new=Digest))
