"""Optional isolated public READ-ONLY source Worker for scalar mapped modules."""
import json
from workers import WorkerEntrypoint,Response
from site_sync.adapters.d1 import D1
from site_sync.runtime.mapping import MappedWebsite
from site_sync.transport.protocol import PATH,MAX_REQUEST,encode,manifest,verify_request,response_headers
from site_sync.core.authority import AuthorizationError,ConflictError

class Default(WorkerEntrypoint):
    async def fetch(self,request):
        from urllib.parse import urlsplit
        if request.method!='POST' or urlsplit(request.url).path!=PATH or getattr(self.env,'SYNC_PEER_ENABLED','0')!='1':return Response('Not found',status=404)
        reader=None
        try:
            if not request.body:raise ValueError('No body')
            reader=request.body.getReader();chunks=[];size=0
            while True:
                result=await reader.read()
                if result.done:break
                size+=result.value.byteLength
                if size>MAX_REQUEST:raise ValueError('Control bound')
                chunks.append(bytes(result.value.to_py()))
            raw=b''.join(chunks)
            key=bytes.fromhex(self.env.PAIR_KEY)
            headers={name:request.headers.get(name) or '' for name in ('x-sync-time','x-sync-nonce','x-sync-signature')}
            nonce=verify_request(key,headers,raw);q=json.loads(raw)
            config=json.loads(self.env.EXPORT_MAPPING)
            source=MappedWebsite(D1(self.env.DB),config)
            kind=q['kind']
            if kind=='candidates':
                if q.get('version')!='catalog-v1':raise ValueError('Catalog version')
                data=encode(await source.source_candidates(q));meta={'version':'catalog-v1'}
                if len(data)>8192:raise ValueError('Candidate bound')
            elif kind=='manifest':
                data=encode(manifest(await source.source_read(q),q['version']));meta={'version':q['version']}
            elif kind=='slice':
                if type(q.get('offset'))!=int or q['offset']<0 or type(q.get('length'))!=int or not 0<q['length']<=65536:raise ValueError('Slice bound')
                data=await source.source_read(q)
                if len(data)!=q['length']:raise ConflictError('Changed range')
                meta={'version':q['version'],'offset':q['offset']}
            else:raise ValueError('Unsupported source operation')
            return Response(data,headers=response_headers(key,nonce,200,meta,data))
        except AuthorizationError:return Response('Forbidden',status=403)
        except (ValueError,KeyError,TypeError,ConflictError):return Response('Conflict',status=409)
        finally:
            if reader is not None:
                await reader.cancel();reader.releaseLock()
