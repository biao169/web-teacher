"""Adaptive media sizes, checkpoint compatibility and bounded transport."""
import asyncio,json
from types import SimpleNamespace
import pytest
from tests.test_sync_platform_v131 import pair,local_pair
from tests import test_sync_binary_v142 as binary
from backend.app.native import site_sync_media as media,site_sync_transport as wire,site_sync_apply as apply
from backend.app.native.catalog import Error
run=asyncio.run

@pytest.mark.parametrize('legacy',[False,True])
def test_adaptive_transfer_and_lost_ack(pair,monkeypatch,legacy):
 api,_,a,b,_,_,network=pair
 original=media.serve
 async def old(r,data):
  if legacy and data['op'].startswith('media-range'):assert 'chunk_bytes' not in data
  result=await original(r,data)
  if legacy:
   result.pop('adaptive_ranges',None);result.pop('preferred_chunk_bytes',None)
  return result
 monkeypatch.setattr(media,'serve',old)
 sizes=[]
 async def observe(kind,url,data):
  result=await network(kind,url,data)
  if data['payload']['op']=='media-range-binary':
   sizes.append((data['payload'].get('chunk_bytes',65536),len(result.raw)))
  return result
 binary.test_multichunk_resume_and_legacy_fallback((*pair[:-1],observe),monkeypatch,False)
 expected=65536 if legacy else 4096
 assert sizes and all(width==expected and n<=expected for width,n in sizes)
 rows=run(a.sql.query('SELECT state FROM sync_tasks'))
 executed=[json.loads(v['state']) for v in rows if 'execution' in json.loads(v['state'])]
 assert executed[-1]['execution']['media'][0]['chunk_bytes']==expected

@pytest.mark.parametrize('local,peer,want',[('local',65536,65536),('local',16384,16384),('r2',65536,16384),('r2',16384,16384)])
def test_negotiation(local,peer,want):
 assert media.negotiate(SimpleNamespace(kind=local),{'adaptive_ranges':1,'preferred_chunk_bytes':peer})==want
 assert media.negotiate(SimpleNamespace(kind=local),{})==65536

@pytest.mark.parametrize('bad',[None,True,0,2048,32768,131072,'16384'])
def test_invalid_width(bad):
 with pytest.raises(Error):media.chunk_size(bad)

@pytest.mark.parametrize('width',[4096,8192,16384,65536])
def test_merge_keys_and_cleanup_resume(width):
 assert media.merged_key('t',0,width,0,width)=='site-sync/t/0/0.bin'
 assert media.merged_key('t',0,width*4,0,width)==f'site-sync/t/0/merge-{width*4}-0.bin'
 deleted=[]
 async def delete(key):deleted.append(key)
 r=SimpleNamespace(cache_store=SimpleNamespace(delete=delete))
 task={'uid':'t','state':{'execution':{'cleanup_offset':0}}}
 item={'size':width*5+1,'chunk_bytes':width}
 for _ in range(20):
  before=len(deleted);done=run(media.cleanup_step(r,task,0,item,1));assert len(deleted)-before==1
  task=json.loads(json.dumps(task))
  if done:break
 assert done and len(deleted)==9 and len(set(deleted))==9


def test_existing_legacy_checkpoint_uses_64k(monkeypatch):
 requests=[]
 async def fetch(r,task,data):
  requests.append(data)
  return {'uid':'m','offset':65536,'version':'v','raw':b'x'*65536}
 async def put(*args):pass
 async def persist(*args):pass
 monkeypatch.setattr(apply,'fetch',fetch);monkeypatch.setattr(apply,'persist',persist)
 r=SimpleNamespace(kind='r2',cache_store=SimpleNamespace(put=put))
 task={'uid':'t','state':{'execution':{'file_index':0,'offset':65536,'bytes':65536,'media':[{'uid':'m','version':'v','binary_ranges':True,'record_version':'r','size':131072}]}}}
 run(apply.download(r,task))
 assert 'chunk_bytes' not in requests[0] and task['state']['execution']['offset']==131072


def test_transport_uses_negotiated_frame_ceiling(monkeypatch):
 seen=[]
 async def worker(url,raw,limit):seen.append(limit);return {}
 monkeypatch.setattr(wire,'_worker',worker)
 run(wire.post('r2','https://peer.example',{'payload':{'op':'media-range-binary','chunk_bytes':16384}}))
 assert seen==[8+wire.FRAME_HEADER_LIMIT+16384]


def test_four_kib_transfer_lost_ack_merge_and_cleanup(pair,monkeypatch):
 from backend.app.native.site_sync_limits import budget
 original=apply.negotiate;seen=[]
 def small(r,head):
  with budget(r,{'resource_level':2}):return original(r,head)
 monkeypatch.setattr(apply,'negotiate',small)
 network=pair[-1]
 async def record(kind,url,data):
  result=await network(kind,url,data)
  if data['payload']['op']=='media-range-binary':seen.append(data['payload']['chunk_bytes'])
  return result
 binary.test_multichunk_resume_and_legacy_fallback((*pair[:-1],record),monkeypatch,False)
 assert seen and set(seen)=={4096}
