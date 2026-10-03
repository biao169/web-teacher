"""Read-only peer previews, dependency closure and additive initialization."""
import asyncio,json,sqlite3
from types import SimpleNamespace
import pytest
from backend.app.native import site_sync as core,site_sync_tasks as tasks,site_sync_transport as transport
from backend.app.native.database import Database,SCHEMA
from backend.app.native.catalog import Error
from backend.app.native.schema_upgrade import migrate
from backend.app.native.data_tools import BUSINESS

def run(v):return asyncio.run(v)
def empty():return {t:{} for t in core.SCOPES}

def authenticated(db):
 from backend.app.native.auth import Auth
 from backend.app.security.passwords import Passwords
 from backend.app.adapters.sqlite.passwords import LocalKDF
 auth=Auth(db,Passwords(LocalKDF()))
 run(auth.bootstrap('sync-test','Synthetic-test-only-137'))
 token=run(auth.login('sync-test','Synthetic-test-only-137','test'))
 return SimpleNamespace(sql=db,kind='local',auth=auth,p=run(auth.principal(token)))

def test_media_replacement_dependencies():
 a,b=empty(),empty()
 b['media_assets']['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']={'uid':'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','object_key':'a.jpg','storage_kind':'local'}
 a['media_assets']['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']={'uid':'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','object_key':'b.jpg','storage_kind':'r2'}
 b['profiles']['p']={'uid':'p','name':'教师','avatar_key':'a.jpg'}
 a['profiles']['p']={'uid':'p','name':'教师','avatar_key':'b.jpg'}
 b['news']['n']={'uid':'n','title':'News','content':'<img src="/media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">','content_format':'html'}
 a['news']['n']={'uid':'n','title':'News','content':'<img src="/media/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb">','content_format':'html'}
 result=core.select(core.compare(a,b,['profiles','news']),['profiles:p','news:n'])
 assert set(result['selected'])=={'media_assets:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','profiles:p','news:n'}
 assert not result['blocked']
 a['profiles']['p']['avatar_key']='a.jpg';a['profiles']['p']['name']='Changed'
 result=core.select(core.compare(a,b,['profiles','news']),['profiles:p','news:n'])
 assert result['blocked']

def test_canonical_fields():
 a,b=empty(),empty()
 a['media_assets']['m']={'uid':'m','object_key':'x','storage_kind':'local','updated_at':'1'}
 b['media_assets']['m']={'uid':'m','object_key':'x','storage_kind':'r2','updated_at':'2'}
 a['site_settings']['@settings']={'uid':'s1','site_name':'A'}
 b['site_settings']['@settings']={'uid':'s2','site_name':'A'}
 assert core.compare(a,b,core.SCOPES)==[]
 assert 'sync_peers' not in BUSINESS
 assert not {'deepl_api_key','translation_providers'}&set(core.columns('global_settings'))

def test_auth_and_origin():
 secret='a'*64;v=transport.envelope(secret,{'op':'hello'})
 assert transport.verify(secret,v)=={'op':'hello'}
 v['payload']['op']='write'
 with pytest.raises(Error):transport.verify(secret,v)
 for url in ('http://example.org','https://127.0.0.1','https://10.1.1.1','https://localhost','https://a.local','https://example.org/path','https://a:b@example.org','https://example.org:8443'):
  with pytest.raises(Error):transport.origin(url)
 assert transport.origin('https://EXAMPLE.org/')=='https://example.org'

def test_two_site_http(tmp_path,monkeypatch):
 from tests.list_fixture import client_at
 import re
 a,ra=client_at(tmp_path/'a');b,rb=client_at(tmp_path/'b')
 def headers(client):
  page=client.get('/admin/data-tools/sync');assert page.status_code==200,page.text
  token=re.search('id="site-sync" data-csrf="([^"]+)"',page.text)[1]
  return {'Accept':'application/json','Origin':str(client.base_url).rstrip('/'),'X-CSRF-Token':token}
 ha,hb=headers(a),headers(b)
 def post(c,h,op,data):
  v=c.post('/api/admin/site-sync/'+op,headers=h,json=data)
  assert v.status_code==200,v.text
  return v.json()
 for c,h,url in ((a,ha,'https://b.example.org'),(b,hb,'https://a.example.org')):
  post(c,h,'save',{'origin':url,'secret':'a'*64,'enabled':True})
 async def network(kind,url,data):
  c=b if url=='https://b.example.org' else a
  v=c.post('/api/site-sync/peer',json=data)
  if v.status_code!=200:raise Error(v.text,v.status_code)
  return v.json()
 monkeypatch.setattr(transport,'post',network)
 before_a=run(core.revision(ra.sql));before_b=run(core.revision(rb.sql))
 post(a,ha,'test',{})
 for direction in ('pull','push'):
  job=post(a,ha,'start',{'direction':direction,'scopes':['students']})
  for _ in range(600):
   result=post(a,ha,'advance',{'uid':job['uid']})
   if result['status']=='ready':break
  else:pytest.fail('preview did not finish')
  assert {x['action'] for x in result['items'] if x['table']=='students'}=={'add','delete'}
  ids=[x['id'] for x in result['items'] if x['table']=='students']
  selection=post(a,ha,'select',{'uid':job['uid'],'ids':ids})
  assert set(selection['selected'])>=set(ids)
 assert run(core.revision(ra.sql))==before_a
 assert run(core.revision(rb.sql))==before_b
 assert a.post('/api/admin/site-sync/start',json={},headers={'Accept':'application/json'}).status_code==403
 assert a.post('/api/site-sync/peer',json={},headers={'Accept':'application/json'}).status_code==403
 assert 'a'*64 not in a.get('/admin/data-tools/sync').text
 v=transport.envelope('a'*64,{'op':'execute','schema':core.schema(),'protocol':core.PROTOCOL,'data_check':1})
 assert a.post('/api/site-sync/peer',json=v).status_code==404

def test_changed_snapshot(tmp_path,monkeypatch):
 db=Database(tmp_path/'a.db');db.initialize();remote=Database(tmp_path/'b.db');remote.initialize()
 r=authenticated(db)
 run(tasks.save(db,{'origin':'https://b.example.org','secret':'a'*64,'enabled':True}))
 async def fake(r,p,data):
  result={'site_id':'other','schema':core.schema(),'protocol':core.PROTOCOL,'data_check':1,'revision':await core.revision(remote)}
  if data['op']=='revision-page':result.update(await core.revision_page(remote,data['table'],data['after']))
  if data['op']=='page':result.update(await core.page(remote,data['table'],data['after']))
  return result
 monkeypatch.setattr(tasks,'call',fake)
 job=run(tasks.start(r,'pull',['students']))
 while run(tasks.get(db,job['uid']))['state']['phase']=='baseline':run(tasks.advance(r,job['uid']))
 run(remote.batch([("INSERT INTO students(uid,name) VALUES('new','New')",())]))
 with pytest.raises(Error,match='变化|不完整|不一致'):
  for _ in range(100):run(tasks.advance(r,job['uid']))
 assert run(tasks.get(db,job['uid']))['status']=='reading'
 assert run(db.query('SELECT * FROM students'))==[]

def test_upgrade(tmp_path):
 data=json.loads((SCHEMA/'teacher-v0.15.119.json').read_text());path=tmp_path/'site.db'
 with sqlite3.connect(path) as c:
  for obj in data['objects']:c.execute(obj['sql'])
  c.execute("INSERT INTO students(uid,name) VALUES('keep','Keep')")
 db=Database(path);assert migrate(db)['upgraded'];assert db.verify()['tables']==45
 assert run(db.query('SELECT name FROM students'))==[{'name':'Keep'}]
 assert migrate(db)['upgraded'] is False

def test_incomplete_signed_page_cannot_create_delete_preview(tmp_path,monkeypatch):
 db=Database(tmp_path/'a.db');db.initialize();remote=Database(tmp_path/'b.db');remote.initialize()
 run(remote.batch([("INSERT INTO students(uid,name) VALUES('remote-student','Remote')",())]))
 r=authenticated(db);run(tasks.save(db,{'origin':'https://b.example.org','secret':'a'*64,'enabled':True}))
 async def fake(r,p,data):
  result={'site_id':'other','schema':core.schema(),'protocol':core.PROTOCOL,'data_check':1,'revision':await core.revision(remote)}
  if data['op']=='revision-page':result.update(await core.revision_page(remote,data['table'],data['after']))
  if data['op']=='page':
   result.update(await core.page(remote,data['table'],data['after']))
   if data['table']=='students':result['rows']=[];result['next']=None
  return result
 monkeypatch.setattr(tasks,'call',fake);job=run(tasks.start(r,'pull',['students']))
 with pytest.raises(Error,match='不完整'):
  for _ in range(100):run(tasks.advance(r,job['uid']))
 assert run(tasks.get(db,job['uid']))['status']=='reading'
 assert run(db.query('SELECT * FROM students'))==[]
