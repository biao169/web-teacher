"""Missing active settings, anonymous cache freshness, resource limits and identity isolation."""
from pathlib import Path
from contextlib import closing
import pytest
from fastapi.testclient import TestClient
from backend.app.config import Settings,PROJECT_ROOT
from backend.app.native.runtime import local
from backend.app.native.web import create_app
from backend.app.native.demo import seed
from backend.app.native.public_cache import PublicSQL,PublicReadCache
from backend.app.resource_budget import CacheBudget,MIB
from backend.app.security.http import AuthConfig
from backend.app.web.rendering import Renderer
from test_accounts_regression import fixture,run
from test_public_home_step2 import add
from test_translation_regression import source,cache as translation

@pytest.mark.parametrize('demo',[False,True])
def test_fresh_without_active_site_settings_all_public_routes(tmp_path,demo):
    r=local(Settings(tmp_path));r.config=AuthConfig.from_origin('http://127.0.0.1:8765')
    if demo:run(seed(r.sql))
    with TestClient(create_app(lambda _:r,PROJECT_ROOT),base_url=r.config.origin) as client:
        for lang in ('en','zh'):
            for table in ('','profiles','students','projects','publications','patents','courses','news','contact'):
                response=client.get('/'+lang+('/'+table if table else ''))
                assert response.status_code==200,(lang,table,response.text[:100])
        assert client.get('/').url.path=='/en'
        assert run(r.sql.query('SELECT count(*) n FROM site_settings'))[0]['n']==0 # Read fallback never writes configuration.


def test_inactive_settings_and_cached_anonymous_identity_isolation(fixture):
    client,r=fixture;token=client.cookies.get(r.config.name('session'))
    add(r,'projects','Cache public project',principal='PRIVATE_CACHE_PI',amount='987')
    run(r.sql.batch([('UPDATE site_settings SET is_active=0',())]))
    client.cookies.clear()
    for _ in range(2):
        response=client.get('/en/projects');assert response.status_code==200 and 'PRIVATE_CACHE_PI' not in response.text
    assert r.sql.public_cache.hits>0
    client.cookies.set(r.config.name('session'),token)
    hits=r.sql.public_cache.hits
    assert 'PRIVATE_CACHE_PI' in client.get('/en/projects').text
    assert r.sql.public_cache.hits==hits # Authenticated page queries bypass shared cache.
    client.cookies.clear()
    assert 'PRIVATE_CACHE_PI' not in client.get('/en/projects').text


def test_translation_visibility_and_navigation_change_invalidate_cache(fixture):
    client,r=fixture;client.cookies.clear()
    row=source(r,'courses','name','缓存课程');translated=translation(r,'courses',row,'name','CachedCourse')
    from backend.app.native.navigation import build_public_path
    rule=build_public_path('courses',[{'field':'name','operator':'contains','value':'缓存'}])
    nav=run(r.content.save('navigation_items',r.p,{'title':'Cache nav','url_name':'cache-course','location':'header','kind':'route','path':rule,'visibility':'public','enabled':1}))
    for _ in range(2):assert 'CachedCourse' in client.get('/en/n/cache-course').text
    run(r.sql.batch([("UPDATE translation_cache SET translated_text='FreshCourse' WHERE uid=?",(translated['uid'],))]))
    page=client.get('/en/n/cache-course').text
    assert 'FreshCourse' in page and 'CachedCourse' not in page
    run(r.sql.batch([("UPDATE courses SET visibility='hidden' WHERE uid=?",(row['uid'],))]))
    assert 'FreshCourse' not in client.get('/en/n/cache-course').text
    run(r.sql.batch([('UPDATE navigation_items SET enabled=0 WHERE uid=?',(nav,))]))
    assert client.get('/en/n/cache-course').status_code==404


def test_sql_results_are_copied_and_external_writes_invalidate(tmp_path):
    r=local(Settings(tmp_path));sql=PublicSQL(r.sql)
    run(r.sql.batch([("INSERT INTO projects(uid,name,visibility) VALUES ('cache','Original','public')",())]))
    query="SELECT uid,name FROM projects WHERE visibility='public'"
    first=run(sql.query(query));first[0]['name']='MUTATED'
    assert run(sql.query(query))[0]['name']=='Original' and r.sql.public_cache.hits==1
    with closing(r.sql.connect()) as connection,connection:
        connection.execute("UPDATE projects SET name='External change' WHERE uid='cache'")
    assert run(sql.query(query))[0]['name']=='External change'
    # No held DB connection: replacement/reset remains supported on Windows too.
    r.sql.initialize(reset=True)
    assert run(sql.query(query))==[]


def test_memory_budget_shrinks_expires_and_can_be_disabled():
    clock=[0];memory=[(8*1024*MIB,4*1024*MIB)]
    budget=CacheBudget(probe=lambda:memory[0],clock=lambda:clock[0],environ={})
    cached=PublicReadCache(budget,clock=lambda:clock[0]);rev=('r',)
    assert budget.limits()==(32*MIB,256)
    cached.get(b'a',rev);cached.put(b'a',rev,[{'v':'initial'}],5)
    assert cached.get(b'a',rev)==[{'v':'initial'}]
    clock[0]=6;assert cached.get(b'a',rev) is None
    cached.put(b'a',rev,[{'v':'again'}],5)
    memory[0]=(256*MIB,32*MIB);clock[0]=16
    assert cached.get(b'a',rev) is None and cached.used==0 and budget.limits()==(0,32)
    disabled=CacheBudget(environ={'TEACHER_PUBLIC_CACHE_MB':'0'})
    assert disabled.limits()[0]==0
    small=CacheBudget(probe=lambda:(512*MIB,256*MIB),environ={'WEB_CONCURRENCY':'2'})
    assert small.limits()==(MIB,96)


def test_lru_limits_large_result_and_time_dependent_ttl(tmp_path):
    r=local(Settings(tmp_path));clock=[0];budget=CacheBudget(probe=lambda:(256*MIB,128*MIB),clock=lambda:clock[0],environ={})
    cached=PublicReadCache(budget,clock=lambda:clock[0]);r.sql.public_cache=cached;sql=PublicSQL(r.sql)
    # Clock-dependent SQL expires in one second, independent of a database mutation.
    statement="SELECT strftime('%s','now') AS clock"
    run(sql.query(statement));run(sql.query(statement));assert cached.hits==1
    clock[0]=2;run(sql.query(statement));assert cached.misses==2
    rev=r.sql.cache_revision()
    for i in range(50):cached.put(str(i).encode(),rev,[{'text':'x'*60000}],5)
    assert cached.used<=budget.limits()[0] and len(cached.entries)<50
    cached.put(b'oversized',rev,[{'text':'x'*300000}],5)
    assert b'oversized' not in cached.entries
    cached.put(b'many',rev,[{}]*501,5);assert b'many' not in cached.entries


def test_renderer_adapts_without_losing_template_behavior():
    renderer=Renderer.bundled({'simple.html':'Hello {{ person }}'})
    class Budget:
        size=32
        def limits(self):return 0,self.size
    budget=Budget();renderer.budget=budget
    assert renderer.render('simple.html',person='one')=='Hello one'
    budget.size=96
    assert renderer.render('simple.html',person='two')=='Hello two' and renderer.env.cache.capacity==96
    budget.size=32
    assert renderer.render('simple.html',person='three')=='Hello three' and renderer.env.cache.capacity==32


def test_nested_linux_service_memory_limit_is_respected(monkeypatch):
    from backend.app.resource_budget import memory_snapshot
    import os
    if os.name=='nt':pytest.skip('Linux cgroup probe')
    files={'/proc/meminfo':'MemTotal: 8388608 kB\nMemAvailable: 4194304 kB',
           '/proc/self/cgroup':'0::/system.slice/tweb.service',
           '/sys/fs/cgroup/system.slice/tweb.service/memory.max':str(512*MIB),
           '/sys/fs/cgroup/system.slice/tweb.service/memory.current':str(320*MIB)}
    def read(path,*args,**kwargs):
        if str(path) not in files:raise FileNotFoundError(str(path))
        return files[str(path)]
    monkeypatch.setattr(Path,'read_text',read)
    assert memory_snapshot()==(512*MIB,192*MIB)
