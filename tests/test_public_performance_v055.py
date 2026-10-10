import asyncio
from unittest.mock import patch
from types import SimpleNamespace
import pytest
from backend.app.public_performance import PublicPerformance as P
from backend.app.native.public_revision import revision,revision_write
from test_accounts_regression import fixture
from test_linux_manager_v76 import managed,update_args
run=asyncio.run

def test_defaults_and_custom():
 assert P.from_env({})==P(1800,2)
 assert P.from_env({'TEACHER_PUBLIC_CACHE_TTL_SECONDS':'0','TEACHER_PUBLIC_STREAM_CONCURRENCY':'4'})==P(0,4)
@pytest.mark.parametrize('key,value',[('TEACHER_PUBLIC_CACHE_TTL_SECONDS','abc'),('TEACHER_PUBLIC_CACHE_TTL_SECONDS','86401'),('TEACHER_PUBLIC_STREAM_CONCURRENCY','20'),('TEACHER_PUBLIC_STREAM_CONCURRENCY','')])
def test_invalid(key,value):
 with pytest.raises(ValueError,match=key):P.from_env({key:value})

def test_revision_business_only_and_rollback(fixture):
 c,r=fixture;before=run(revision(r.sql))
 run(r.sql.batch([("INSERT INTO service_meta(key,value) VALUES ('test','1')",())]));assert run(revision(r.sql))==before
 run(r.sql.batch([('UPDATE profiles SET name=name',())]));assert run(revision(r.sql))!=before
 before=run(revision(r.sql))
 with pytest.raises(Exception):run(r.sql.batch([('UPDATE profiles SET name=name',()),('INSERT INTO nonexistent VALUES (1)',())]))
 assert run(revision(r.sql))==before
 assert revision_write([('UPDATE sync_tasks SET status=?',('waiting',))]) is None

def test_headers_revision_and_identity(fixture):
 c,r=fixture
 assert c.get('/en').headers['cache-control']=='private, no-cache'
 c.cookies.clear();page=c.get('/en');assert page.status_code==200
 assert page.headers['cache-control']=='public, max-age=300'
 assert 'data-stream-state="pending"' in page.text
 rev=page.headers['x-public-revision']
 fragment=c.get('/en/projects?home=1&page=1&_rev='+rev,headers={'X-Public-Fragment':'1'})
 assert fragment.headers['cache-control']=='public, max-age=1800'
 assert 'X-Public-Fragment' in fragment.headers['vary']
 stale=c.get('/en/projects?home=1&page=1&_rev=old',headers={'X-Public-Fragment':'1'})
 assert stale.headers['cache-control']=='private, no-cache'
 r.public_performance=P(0,1,0)
 assert c.get('/en').headers['cache-control']=='no-store'
 assert c.get('/api/public/cache-revision').headers['cache-control']=='no-store'

def test_linux_generate_preserves_performance(managed):
 m,events,args=managed
 path=m.l.config/'teacher-site.env'
 with path.open('a') as f:f.write('TEACHER_PUBLIC_CACHE_TTL_SECONDS=3600\nTEACHER_PUBLIC_STREAM_CONCURRENCY=1\nTEACHER_PUBLIC_CACHE_MB=8\n')
 import hashlib
 unit=m.l.unit.read_text().replace('--workers 1','--workers 1 --port 8003');m.l.unit.write_text(unit)
 state=m.load();state['owned_files'][str(m.l.unit)]=hashlib.sha256(unit.encode()).hexdigest();m.save(state)
 (m.l.config/'generated/nginx-location.conf').write_text('proxy_pass http://127.0.0.1:8003;')
 m.update(update_args(scope='config'))
 m.configure(allowed_origins='https://teacher.example.org,https://extra.example.org')
 m.generate(m.l.current,m.load())
 for expected in ('TEACHER_PUBLIC_CACHE_TTL_SECONDS=3600','TEACHER_PUBLIC_STREAM_CONCURRENCY=1','TEACHER_PUBLIC_CACHE_MB=8'):assert expected in path.read_text()

def test_worker_cache_hit_revision_ttl_and_fail_open(monkeypatch):
 import sys,json
 from backend.app.native.public_cache import WorkerPublicSQL
 class Headers(dict):
  def set(self,k,v):self[k.lower()]=v
 class Response:
  def __init__(self,text):self.value=text;self.headers=Headers()
  @classmethod
  def new(cls,text):return cls(text)
  async def text(self):return self.value
 class Cache:
  def __init__(self):self.values={};self.fail=False
  async def match(self,key):
   if self.fail:raise RuntimeError('cache unavailable')
   return self.values.get(key)
  async def put(self,key,value):self.values[key]=value
 cache=Cache()
 async def opened(name):return cache
 monkeypatch.setitem(sys.modules,'js',SimpleNamespace(caches=SimpleNamespace(open=opened),Response=Response))
 class SQL:
  def __init__(self):self.calls=0
  async def query(self,*args):self.calls+=1;return [{'name':'public'}]
 sql=SQL();first=WorkerPublicSQL(sql,'https://example.test','1',1800)
 run(first.query('SELECT name FROM profiles'));run(first.query('SELECT name FROM profiles'));assert sql.calls==1
 assert next(iter(cache.values.values())).headers['cache-control']=='public, max-age=1800'
 run(WorkerPublicSQL(sql,'https://example.test','2',1800).query('SELECT name FROM profiles'));assert sql.calls==2
 cache.values.clear() # Simulate platform expiry/eviction.
 run(first.query('SELECT name FROM profiles'));assert sql.calls==3
 cache.fail=True;run(first.query('SELECT name FROM profiles'));assert sql.calls==4
 run(WorkerPublicSQL(sql,'https://example.test','1',0).query('SELECT name FROM profiles'));assert sql.calls==5
