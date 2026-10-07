"""Local background executor transport. Blocking I/O always uses a thread.
Worker uses native fetch in worker/transport.mjs, not Python socket APIs.
"""
import asyncio
import http.client
import json
import time
from urllib.parse import urlsplit
from .protocol import *
from site_sync.core.authority import ResourceError,CredentialRetryError


class HTTPPeer:
    def __init__(self,origin,secret,*,allow_loopback=False,clock=time.time,timeout=20):
        u=urlsplit(origin)
        local=allow_loopback and u.scheme=='http' and u.hostname in ('127.0.0.1','::1','localhost')
        if not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('','/') or (u.scheme!='https' and not local):
            raise ValueError('Configure an explicit HTTPS peer origin')
        self.url,self.secret,self.clock,self.timeout=u,secret,clock,timeout

    def open(self,request,*,stream=False,recovered=False):
        body=encode(request);headers=request_headers(self.secret,body,clock=self.clock)
        if stream:headers['x-sync-stream']='1'
        cls=http.client.HTTPSConnection if self.url.scheme=='https' else http.client.HTTPConnection
        connection=cls(self.url.hostname,self.url.port,timeout=self.timeout)
        try:
            connection.request('POST',PATH,body,headers)
            response=connection.getresponse();h={k.lower():v for k,v in response.getheaders()}
            if response.status==410 and stream and request.get('record_version') and request.get('snapshot_hash'):
                connection.close()
                if recovered:raise ResourceError('Snapshot not yet available')
                restored=json.loads(self.open(dict(kind='manifest',task=request.get('task',''),module=request['module'],record=request['record'],version=request['record_version'],snapshot_hash=request['snapshot_hash'])))
                if restored.get('snapshot_hash')!=request['snapshot_hash']:raise ConflictError('Snapshot changed')
                return self.open(request,stream=True,recovered=True)
            if response.status==429 or response.status>=500:
                # A platform-generated 1102 page is not authenticated peer data.
                # Treat transient platform failures as resource pressure; never
                # trust their body, advance a cursor, or follow a redirect.
                error=ResourceError('Peer transient/resource failure');error.http_status=response.status
                error.ray_id=h.get('cf-ray','')
                import re
                try:code=re.search(rb'\b110[12]\b',response.read(2048))
                except Exception:code=None
                if code:error.platform_code=int(code.group())
                raise error
            if response.status in (401,403):
                error=CredentialRetryError('Peer authentication unavailable');error.http_status=response.status
                raise error
            if response.status!=200:raise ConflictError('Peer rejected version or route')
            size=h.get('content-length','')
            limit=request['length'] if stream else MAX_CONTROL if request['kind'] in ('manifest','candidates','proposal') else request['length']
            if not size.isdecimal() or int(size)>limit or h.get('content-encoding','identity')!='identity' or 'transfer-encoding' in h:
                raise ConflictError('Invalid bounded response')
            size=int(size)
            if stream:
                meta=verify_response(self.secret,headers['x-sync-nonce'],200,h,stream=True)
                expected={'version':request['version'],'offset':request['offset'],'length':request['length'],'total':request['total']}
                if meta!=expected or size!=request['length']:raise ConflictError('Media version/range mismatch')
                return connection,response
            data=response.read(size+1)
            if len(data)!=size:raise IOError('Truncated body')
            meta=verify_response(self.secret,headers['x-sync-nonce'],200,h,data)
            if meta.get('version')!=request['version']:raise ConflictError('Source changed')
            if request['kind']=='slice' and (len(data)!=request['length'] or meta.get('offset')!=request['offset']):raise ConflictError('Slice range mismatch')
            return data
        except BaseException:
            connection.close();raise
        finally:
            if not stream:connection.close()

    async def manifest(self,item):
        data=await asyncio.to_thread(self.open,dict(kind='manifest',task=item.get('task_id',''),module=item['module'],record=item['record_id'],version=item['source_version']))
        try:return manifest(json.loads(data),item['source_version'])
        except (ValueError,TypeError) as exc:raise ConflictError('Invalid manifest JSON') from exc

    async def slice(self,item,field,offset,length):
        return await asyncio.to_thread(self.open,dict(kind='slice',task=item.get('task_id',''),module=item['module'],record=item['record_id'],version=item['source_version'],field=field,offset=offset,length=length,snapshot_hash=json.loads(item.get('manifest_json') or '{}').get('snapshot_hash')))

    def media(self,item,file,offset,length):
        # Caller consumes/ closes this stream inside its background I/O thread.
        return self.open(dict(kind='media',task=item.get('task_id',''),module=item['module'],record=item['record_id'],version=file['source_version'],record_version=item['source_version'],snapshot_hash=json.loads(item.get('manifest_json') or '{}').get('snapshot_hash'),file=file['source_file_id'],offset=offset,length=length,total=file['total_bytes']),stream=True)

    async def candidates(self,request):
        data=await asyncio.to_thread(self.open,request)
        try:return json.loads(data)
        except ValueError as exc:raise ConflictError('Invalid candidate JSON') from exc
