"""Worker translation I/O uses the same request policy and bounded JSON decoding as local."""
import asyncio
from backend.app.native.translation_http import validate_request,decode_response,MAX_BYTES

class TranslationTransport:
    def __init__(self,hosts=()):
        """Store the deployment-approved custom hosts, independent of request form input."""
        self.hosts=hosts
    async def send(self,request,timeout):
        """Fetch with an abort signal, redirect refusal and a bounded stream; never log bodies."""
        from js import fetch,AbortController,Object
        from pyodide.ffi import to_js
        headers=validate_request(request,self.hosts);controller=AbortController.new()
        async def bounded():
            """Convert only successful bounded responses to ordinary Python JSON values."""
            options=to_js({'method':request['method'],'headers':headers,'redirect':'error',**({'body':request['body'].decode()} if request.get('body') is not None else {})},dict_converter=Object.fromEntries);options.signal=controller.signal
            response=await fetch(request['url'],options)
            if response.status!=200:return int(response.status),{}
            reader=response.body.getReader();chunks=[];size=0
            try:
                while True:
                    part=await reader.read()
                    if part.done:break
                    chunk=bytes(part.value.to_py());size+=len(chunk)
                    if size>MAX_BYTES:raise ValueError('Translation response too large')
                    chunks.append(chunk)
                return 200,decode_response(b''.join(chunks))
            finally:await reader.cancel()
        try:return await asyncio.wait_for(bounded(),timeout)
        finally:controller.abort()
