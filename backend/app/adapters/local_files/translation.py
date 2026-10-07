"""Bounded local translation I/O; provider payloads are built by the shared service."""
import asyncio,time
from urllib.request import Request,build_opener
from urllib.error import HTTPError,URLError
from .scholarly import NoRedirect
from backend.app.native.translation_http import validate_request,decode_response,MAX_BYTES

class TranslationTransport:
    def __init__(self,hosts=()):
        """Keep the deployment-approved custom hosts outside editable provider payloads."""
        self.hosts=hosts
    async def send(self,request,timeout):
        """Run blocking HTTPS outside the event loop with per-call and socket time budgets."""
        return await asyncio.to_thread(self._send,request,timeout)
    def _send(self,request,timeout):
        """Read limited chunks without following redirects or returning upstream error bodies."""
        headers=validate_request(request,self.hosts);deadline=time.monotonic()+timeout
        try:
            with build_opener(NoRedirect).open(Request(request['url'],data=request.get('body'),method=request['method'],headers=headers),timeout=min(8,timeout)) as response:
                chunks=[];size=0
                while True:
                    if time.monotonic()>=deadline:raise TimeoutError()
                    chunk=response.read1(min(16384,MAX_BYTES+1-size))
                    if not chunk:break
                    size+=len(chunk)
                    if size>MAX_BYTES:raise ValueError('Translation response too large')
                    chunks.append(chunk)
                return response.status,decode_response(b''.join(chunks))
        except HTTPError as exc:
            exc.close();return exc.code,{}
        except URLError as exc:
            if isinstance(exc.reason,TimeoutError):raise TimeoutError() from None
            raise
