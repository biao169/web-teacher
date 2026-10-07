"""Read-only fixed-origin HTTPS; no redirect, bounded bytes and socket timeout."""
import asyncio,json
from backend.app.native.metadata_http import validate_request,MAX_BYTES,TIMEOUT
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError,URLError
class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):"""拦截外部查询重定向，防止固定服务请求转向其他地址。""";return None
class CrossrefTransport:
 async def get(self,url,headers=None):"""从本适配器的数据源读取指定对象或记录。""";return await asyncio.to_thread(self._get,url,headers)
 def _get(self,url,headers=None):
  """从允许的学术元数据服务获取有大小和超时限制的JSON。"""
  headers=validate_request(url,headers)
  try:
   with build_opener(NoRedirect).open(Request(url,headers=headers),timeout=TIMEOUT) as response:
    body=response.read(MAX_BYTES+1)
    if len(body)>MAX_BYTES:raise ValueError('Provider response too large')
    return response.status,json.loads(body)
  except HTTPError as exc:return exc.code,{}
  except URLError as exc:
   if isinstance(exc.reason,TimeoutError):raise TimeoutError() from exc
   raise
