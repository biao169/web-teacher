"""Pull integration with real isolated databases/files and signed HTTP peer routes."""
import asyncio,hashlib,json,re
from pathlib import Path
import pytest
from backend.app.native import site_sync as core,site_sync_transport as transport
from backend.app.native.catalog import Error
from tests.list_fixture import client_at

run=asyncio.run

@pytest.fixture
def pair(tmp_path,monkeypatch):
 a,ra=client_at(tmp_path/'a');b,rb=client_at(tmp_path/'b')
 def headers(c):
  text=c.get('/admin/data-tools/sync').text
  return {'Accept':'application/json','Origin':str(c.base_url).rstrip('/'),'X-CSRF-Token':re.search('id="site-sync" data-csrf="([^"]+)"',text)[1]}
 ha,hb=headers(a),headers(b)
 def api(op,data=None,client=a,h=ha,ok=True,drain=True):
  # Historical execution tests exercise the retained detailed preparation path.
  if op=='start':data={'preview_mode':'detailed',**(data or {})}
  v=client.post('/api/admin/site-sync/'+op,headers=h,json=data or {})
  # Model the UI's sequential checking requests; drain=False tests individual budgets.
  if drain and op in ('proposal-send','pull-tick','pull-begin','proposal-approve'):
   for _ in range(800):
    if v.status_code!=200:break
    result=v.json()
    if result.get('checking'):next_op=op
    elif result.get('execution',{}).get('phase') in ('prepare-rows','validate-rows','verify-commit'):next_op='pull-tick'
    else:break
    v=client.post('/api/admin/site-sync/'+next_op,headers=h,json=data if result.get('checking') else {'uid':data['uid']})
   else:pytest.fail('Verification did not finish')
  if ok:assert v.status_code==200,v.text
  return v.json() if ok else v
 for c,h,url in ((a,ha,'https://b.example.org'),(b,hb,'https://a.example.org')):
  api('save',{'origin':url,'secret':'s'*64,'enabled':True},c,h)
 async def network(kind,url,data):
  v=(b if url=='https://b.example.org' else a).post('/api/site-sync/peer',headers={'Accept':'application/json'},json=data)
  if v.status_code!=200:raise Error(v.json()['error'],v.status_code)
  return transport.response_json(v.status_code,v.content,dict(v.headers))
 monkeypatch.setattr(transport,'post',network)
 def preview(scopes,selector=lambda x:True,direction='pull'):
  job=api('start',{'direction':direction,'scopes':scopes})
  for _ in range(600):
   result=api('advance',{'uid':job['uid']})
   if result['status']=='ready':break
  else:pytest.fail('Preview did not finish')
  ids=[i['id'] for i in result['items'] if i['in_scope'] and selector(i)]
  api('select',{'uid':job['uid'],'ids':ids});return job['uid']
 yield api,preview,ra,rb,a,b,network
 a.close();b.close()

def finish(api,uid,max_ticks=800):
 for _ in range(max_ticks):
  p=api('pull-tick',{'uid':uid})
  if p['execution']['phase'] in ('done','cancelled'):return p
 pytest.fail('Task did not finish')

def seed_media(r,uid,key,data):
 run(r.media_store.put(key,data))
 run(r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status,checksum) VALUES(?,?,?,?,?,?,?,?)',(uid,key,key,'image/jpeg',len(data),r.kind,'active',hashlib.sha256(data).hexdigest()))]))

def test_replacement_commit_retains_old_media(pair):
 api,preview,ra,rb,*_=pair
 raw=Path('tests/fixtures/media/sample.jpg').read_bytes();old='a'*32;new='b'*32
 seed_media(ra,old,'old.jpg',raw);seed_media(rb,new,'new.jpg',raw)
 for r,key in ((ra,'old.jpg'),(rb,'new.jpg')):
  run(r.sql.batch([("INSERT INTO profiles(uid,name,avatar_key) VALUES('shared-teacher','Teacher',?)",(key,)),("INSERT INTO news(uid,title,slug,content,content_format) VALUES('shared-news','News','shared-news',?,'html')",('<img src="/media/'+(old if r is ra else new)+'">',))]))
 before=run(core.revision(rb.sql))
 uid=preview(['profiles','news'])
 result=api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'})
 assert result['media_count']==1
 assert api('select',{'uid':uid,'ids':[]},ok=False).status_code==409
 commit_seen=False
 for _ in range(800):
  result=api('pull-tick',{'uid':uid})
  if result['execution']['committed'] and not commit_seen:
   commit_seen=True
   assert run(ra.sql.query("SELECT avatar_key FROM profiles WHERE uid='shared-teacher'"))[0]['avatar_key']=='new.jpg'
   assert run(ra.media_store.get('new.jpg'))==raw
   assert run(ra.media_store.get('old.jpg'))==raw
  if result['execution']['phase']=='done':break
 else:pytest.fail('Task did not finish')
 assert commit_seen and run(ra.media_store.get('old.jpg'))==raw
 assert run(ra.sql.query('SELECT uid FROM media_assets WHERE uid=?',(old,)))
 assert run(core.revision(rb.sql))==before
 assert api('pull-tick',{'uid':uid})['execution']['phase']=='done'
 assert len(run(ra.sql.query("SELECT uid FROM operation_logs WHERE action='sync_pull_commit' AND target_uid=?",(uid,))))==1

def test_selected_only_and_push_not_executable(pair):
 api,preview,ra,rb,*_=pair
 uid=preview(['students'],lambda i:i['action']=='add')
 before=run(ra.sql.query('SELECT uid FROM students'));finish_before=run(core.revision(rb.sql))
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'});finish(api,uid)
 assert len(run(ra.sql.query('SELECT uid FROM students')))==len(before)+3
 assert run(core.revision(rb.sql))==finish_before
 uid=preview(['students'],direction='push')
 assert api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'},ok=False).status_code==422

def test_pause_retry_cancel_and_changed_target(pair,monkeypatch):
 api,preview,ra,rb,a,b,network=pair
 raw=Path('tests/fixtures/media/sample.jpg').read_bytes();seed_media(rb,'b'*32,'new.jpg',raw)
 uid=preview(['media_assets']);api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'})
 api('pull-tick',{'uid':uid}) # head persists
 async def offline(*args):raise Error('Network offline',502)
 monkeypatch.setattr(transport,'post',offline)
 assert api('pull-tick',{'uid':uid},ok=False).status_code==502
 assert api('get',{'uid':uid})['execution']['error'].startswith('Network offline；阶段：download；数据库尚未提交')
 monkeypatch.setattr(transport,'post',network)
 for _ in range(50):
  result=api('pull-tick',{'uid':uid},drain=False)
  if result['execution']['file_index']==1:break
 else:pytest.fail('media promotion not complete')
 assert run(ra.media_store.get('new.jpg'))==raw
 run(ra.sql.batch([("INSERT INTO students(uid,name) VALUES('changed','Changed')",())]))
 assert api('pull-tick',{'uid':uid},ok=False).status_code==409
 assert run(ra.sql.query("SELECT * FROM media_assets WHERE object_key='new.jpg'"))==[]
 api('pull-cancel',{'uid':uid});finish(api,uid)
 assert run(ra.media_store.get('new.jpg')) is None
 assert run(ra.sql.query("SELECT name FROM students WHERE uid='changed'"))[0]['name']=='Changed'

def test_target_only_media_is_absent_from_preview(pair):
 api,preview,ra,rb,*_=pair
 raw=Path('tests/fixtures/media/sample.jpg').read_bytes();seed_media(ra,'a'*32,'old.jpg',raw)
 uid=preview(['media_assets'])
 from backend.app.native import site_sync_tasks as tasks
 job=run(tasks.get(ra.sql,uid))
 assert not any(x['table']=='media_assets' for x in job['state']['items'])
 assert api('select',{'uid':uid,'ids':['media_assets:'+'a'*32]},ok=False).status_code==422
 assert run(ra.media_store.get('old.jpg'))==raw
 assert run(ra.sql.query("SELECT uid FROM media_assets WHERE object_key='old.jpg'"))

def test_commit_ack_lost_is_not_replayed(pair,monkeypatch):
 api,preview,ra,rb,*_=pair
 uid=preview(['students'],lambda i:i['action']=='add');api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'})
 api('pull-tick',{'uid':uid})
 original=ra.sql.restore_batch
 async def lost(statements):
  await original(statements)
  raise OSError('simulated lost acknowledgement')
 monkeypatch.setattr(ra.sql,'restore_batch',lost)
 failure=api('pull-tick',{'uid':uid},ok=False)
 assert failure.status_code==500 and '服务端诊断编号' in failure.text
 assert api('get',{'uid':uid})['execution']['committed'] is True
 monkeypatch.setattr(ra.sql,'restore_batch',original)
 finish(api,uid)
 assert len(run(ra.sql.query('SELECT uid FROM students')))==6
 assert len(run(ra.sql.query("SELECT uid FROM operation_logs WHERE action='sync_pull_commit' AND target_uid=?",(uid,))))==1

def test_same_key_conflict_never_overwrites(pair):
 api,preview,ra,rb,*_=pair
 raw=Path('tests/fixtures/media/sample.jpg').read_bytes();seed_media(rb,'b'*32,'same.jpg',raw)
 run(ra.media_store.put('same.jpg',b'existing-unregistered-file'))
 uid=preview(['media_assets']);api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'})
 for _ in range(20):
  response=api('pull-tick',{'uid':uid},ok=False)
  if response.status_code!=200:break
 assert response.status_code==409
 api('pull-cancel',{'uid':uid});finish(api,uid)
 assert run(ra.media_store.get('same.jpg'))==b'existing-unregistered-file'

def test_chunk_resume_and_version_change(pair):
 api,preview,ra,rb,*_=pair
 from backend.app.native.site_sync_media import CHUNK
 raw=Path('tests/fixtures/media/sample.jpg').read_bytes()+b'\x00'*(CHUNK+123)
 seed_media(rb,'b'*32,'big.jpg',raw)
 uid=preview(['media_assets']);api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'})
 api('pull-tick',{'uid':uid});api('pull-tick',{'uid':uid})
 saved=api('get',{'uid':uid});assert saved['execution']['offset']==CHUNK
 # A file changed without changing its database timestamp is still detected by storage version.
 run(rb.media_store.put('big.jpg',raw[:-1]+b'X'))
 assert api('pull-tick',{'uid':uid},ok=False).status_code==409
 assert run(ra.media_store.get('big.jpg')) is None
 api('pull-cancel',{'uid':uid});finish(api,uid)

def test_referenced_unchanged_media_missing_locally_is_repaired(pair):
 api,preview,ra,rb,*_=pair
 raw=Path('tests/fixtures/media/sample.jpg').read_bytes();mid='b'*32
 for r in (ra,rb):seed_media(r,mid,'same.jpg',raw)
 run(ra.media_store.delete('same.jpg'))
 run(rb.sql.batch([("INSERT INTO profiles(uid,name,avatar_key) VALUES('with-media','New teacher','same.jpg')",())]))
 uid=preview(['profiles'],lambda i:i['uid']=='with-media')
 result=api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'});assert result['media_count']==1
 finish(api,uid)
 assert run(ra.media_store.get('same.jpg'))==raw
 assert run(ra.sql.query("SELECT name FROM profiles WHERE uid='with-media'"))[0]['name']=='New teacher'

def test_nonmedia_delete_is_limited_to_selected_uid(pair):
 api,preview,ra,rb,*_=pair
 old=run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))
 uid=preview(['students'],lambda i:i['action']=='delete' and i['uid']==old[0]['uid'])
 assert api('pull-begin',{'uid':uid,'confirmation':'wrong direction'},ok=False).status_code==422
 assert run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))==old
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'});finish(api,uid)
 assert run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))==old[1:]
