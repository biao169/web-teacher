"""Execution budgets, native stream composition and checkpoint failure boundaries."""
import asyncio,copy,hashlib,json,sys
from types import SimpleNamespace,ModuleType
from pathlib import Path
import pytest
from backend.app.native import site_sync_media as media,site_sync_stream as stream,site_sync_tasks as tasks,data_restore
from backend.app.native.catalog import Error
from backend.app.native.storage import LocalStore,R2Store
from tests.test_sync_platform_v131 import Bucket
from tests.sync_stream_bindings import install
from tests.test_site_sync_v121 import pair,finish
run=asyncio.run

def test_restore_still_normalizes_and_rejects_duplicate_rows(pair):
 api,preview,base,_,client,*_=pair
 from backend.app.native.auth import Auth
 ra=copy.copy(base);ra.auth=Auth(ra.sql,ra.passwords)
 ra.p=run(ra.auth.principal(client.cookies.get(ra.config.name('session'))))
 from backend.app.native.data_tools import FORMAT
 row=run(ra.sql.query('SELECT * FROM students LIMIT 1'))[0]
 source={k:v for k,v in row.items() if k!='id'};source['name']='Restore check'
 plan=run(data_restore.prepare(ra,{'format':FORMAT,'tables':{'students':[source]}},['students'],'merge'))
 assert not plan['errors'] and plan['rows']['students'][0]['name']=='Restore check'
 assert run(ra.sql.query('SELECT name FROM students WHERE uid=?',(row['uid'],)))[0]['name']==row['name']
 duplicate=run(data_restore.prepare(ra,{'format':FORMAT,'tables':{'students':[source,source]}},['students'],'merge'))
 assert duplicate['error_count']>0

@pytest.fixture(params=['local','r2'])
def stores(tmp_path,monkeypatch,request):
 if request.param=='local':return LocalStore(tmp_path/'cache'),LocalStore(tmp_path/'media')
 js=ModuleType('js');js.JSON=SimpleNamespace(parse=json.loads)
 class Bytes(bytes):
  def to_py(self):return bytes(self)
 js.Uint8Array=SimpleNamespace(new=Bytes);install(js)
 ffi=ModuleType('pyodide.ffi');ffi.to_js=lambda x:x
 monkeypatch.setitem(sys.modules,'js',js);monkeypatch.setitem(sys.modules,'pyodide.ffi',ffi)
 bucket=Bucket();return R2Store(bucket,'cache/'),R2Store(bucket,'media/')


def staged(stores):
 cache,target=stores;r=SimpleNamespace(cache_store=cache,media_store=target)
 raw=b'%PDF-'+bytes(range(256))*5400
 item={'size':len(raw),'key':'large.pdf','mime_type':'application/pdf','source_checksum':hashlib.sha256(raw).hexdigest()}
 task={'uid':'test-task','state':{'execution':{'media':[item],'file_index':0,'offset':len(raw),'cleanup_offset':0}}}
 for offset in range(0,len(raw),media.CHUNK):run(cache.put(media.chunk_key(task['uid'],0,offset),raw[offset:offset+media.CHUNK]))
 return r,task,item,raw


def test_streamed_merge_and_bounded_cleanup(stores,monkeypatch):
 r,task,item,raw=staged(stores);groups=[];original=stream.compose
 async def compose(source,target,parts,key,**kwargs):groups.append(len(parts));return await original(source,target,parts,key,**kwargs)
 monkeypatch.setattr(stream,'compose',compose)
 for _ in range(30):
  run(media.finalize_step(r,task,0,item))
  if item.get('assembled_version'):break
 else:pytest.fail('merge did not finish')
 assert item['sha256']==hashlib.sha256(raw).hexdigest() and max(groups)<=4
 assert run(r.media_store.get('large.pdf')) is None
 removed=[];delete=r.cache_store.delete
 async def tracked(key):removed.append(key);await delete(key)
 monkeypatch.setattr(r.cache_store,'delete',tracked)
 for _ in range(50):
  before=len(removed);done=run(media.cleanup_step(r,task,0,item,4));assert len(removed)-before<=4
  if done:break
 assert done and len(removed)==len(set(removed))


def test_lost_merge_ack_resumes_and_bad_digest_never_publishes(stores,monkeypatch):
 r,task,item,raw=staged(stores);saved=copy.deepcopy(item);original=stream.compose
 async def lost(*a,**kw):await original(*a,**kw);raise Error('lost acknowledgement',502)
 monkeypatch.setattr(stream,'compose',lost)
 with pytest.raises(Error):run(media.finalize_step(r,task,0,item))
 item.clear();item.update(saved);monkeypatch.setattr(stream,'compose',original)
 for _ in range(30):
  run(media.finalize_step(r,task,0,item))
  if item.get('assembled_version'):break
 assert item['sha256']==hashlib.sha256(raw).hexdigest()
 item.pop('assembled_version');item['source_checksum']='0'*64
 with pytest.raises(Error,match='摘要'):run(media.finalize_step(r,task,0,item))
 assert run(r.media_store.get(item['key'])) is None


def test_conditional_stream_write_keeps_existing_file(stores):
 cache,target=stores
 run(cache.put('a.bin',b'aaa'));run(target.put('same.bin',b'existing'))
 with pytest.raises(Error):run(stream.compose(cache,target,[('a.bin',3)],'same.bin',exclusive=True))
 assert run(target.get('same.bin'))==b'existing'


def test_missing_stream_part_never_publishes_partial_target(stores):
 cache,target=stores;run(cache.put('a.bin',b'aaa'))
 with pytest.raises((Error,FileNotFoundError,RuntimeError)):
  run(stream.compose(cache,target,[('a.bin',3),('missing.bin',3)],'new.bin',exclusive=True))
 assert run(target.get('new.bin')) is None


def test_preparation_uses_no_full_restore_and_late_change_rolls_back(pair,monkeypatch):
 api,preview,ra,rb,*_=pair;uid=preview(['students'],lambda x:x['action']=='add')
 async def forbidden(*a,**kw):raise AssertionError('full restore scan forbidden')
 monkeypatch.setattr(data_restore,'prepare',forbidden);monkeypatch.setattr(data_restore,'snapshot',forbidden)
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'})
 saved=[]
 for _ in range(800):
  result=api('pull-tick',{'uid':uid},drain=False)
  value=run(tasks.get(ra.sql,uid))['state']['execution']
  if value.get('prepared'):saved.append(value['prepared']['row_index'])
  if result['execution']['phase']=='commit':break
 else:pytest.fail('commit not reached')
 assert max(b-a for a,b in zip(saved,saved[1:]))<=1
 before=run(ra.sql.query('SELECT uid FROM students'))
 run(ra.sql.batch([("INSERT INTO students(uid,name) VALUES('late-change','Late')",())]))
 response=api('pull-tick',{'uid':uid},ok=False,drain=False)
 assert response.status_code==409
 assert len(run(ra.sql.query('SELECT uid FROM students')))==len(before)+1
 assert not api('get',{'uid':uid})['execution']['committed']
 api('pull-cancel',{'uid':uid});finish(api,uid)
