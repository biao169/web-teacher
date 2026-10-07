"""Worker HTTP adapter; imports only inside the Worker call."""
import asyncio,json
from backend.app.native.metadata_http import validate_request,MAX_BYTES,TIMEOUT
class CrossrefTransport:
 async def get(self,url,headers=None):
  """从本适配器的数据源读取指定对象或记录。"""
  from js import fetch,AbortController,Object
  from pyodide.ffi import to_js
  headers=validate_request(url,headers)
  controller=AbortController.new()
  async def fetch_bounded():
   """用流式读取限制学术查询响应体大小。"""
   options=to_js({'redirect':'error','headers':headers},dict_converter=Object.fromEntries)
   options.signal=controller.signal
   response=await fetch(url,options)
   if response.status!=200:return int(response.status),{}
   reader=response.body.getReader();parts=[];size=0
   try:
    while True:
     part=await reader.read()
     if part.done:break
     chunk=bytes(part.value.to_py());size+=len(chunk)
     if size>MAX_BYTES:raise ValueError('Provider response too large')
     parts.append(chunk)
   finally:await reader.cancel()
   return 200,json.loads(b''.join(parts))
  try:return await asyncio.wait_for(fetch_bounded(),TIMEOUT)
  finally:controller.abort()
