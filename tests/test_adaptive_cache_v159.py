"""Request isolation, SQL savings, write races and hard cache budgets."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
from collections import OrderedDict
import pytest
from backend.app.native.request_cache import RequestSQL,LIMIT,MAX_ENTRIES
from backend.app.native.public_cache import PublicReadCache
from backend.app.resource_budget import WorkerBudget
from backend.app.web.rendering import Renderer
from test_accounts_regression import fixture,run


def test_request_cache_copies_results_and_keys_arguments():
    sql=SimpleNamespace(query=AsyncMock(return_value=[{'name':'original'}]))
    cache=RequestSQL(sql)
    first=run(cache.query('SELECT name FROM site_settings WHERE uid=?',('a',)));first[0]['name']='changed'
    assert run(cache.query('SELECT name FROM site_settings WHERE uid=?',('a',)))==[{'name':'original'}]
    run(cache.query('SELECT name FROM site_settings WHERE uid=?',('b',)))
    assert sql.query.await_count==2 and cache.hits==1
    other=RequestSQL(sql);run(other.query('SELECT name FROM site_settings WHERE uid=?',('a',)))
    assert sql.query.await_count==3

@pytest.mark.parametrize('query',['SELECT * FROM auth_permissions','SELECT * FROM operation_logs','SELECT * FROM service_meta','SELECT * FROM sync_tasks','SELECT CURRENT_TIMESTAMP','SELECT random()','DELETE FROM profiles RETURNING uid'])
def test_dynamic_private_and_write_queries_bypass(query):
    sql=SimpleNamespace(query=AsyncMock(return_value=[]));cache=RequestSQL(sql)
    run(cache.query(query));run(cache.query(query))
    assert sql.query.await_count==2 and not cache.entries


def test_request_limits_and_lru():
    sql=SimpleNamespace(query=AsyncMock(return_value=[{'value':'x'*7000}]))
    cache=RequestSQL(sql)
    for i in range(100):run(cache.query('SELECT value FROM site_settings WHERE id=?',(i,)))
    assert cache.used<=LIMIT and len(cache.entries)<=MAX_ENTRIES
    sql.query.return_value=[{'value':'x'*20000}];cache.invalidate()
    run(cache.query('SELECT value FROM site_settings'));assert not cache.entries
    sql.query.return_value=[{}]*65
    run(cache.query('SELECT value FROM site_settings'));assert not cache.entries

@pytest.mark.parametrize('method',['batch','restore_batch'])
def test_writes_clear_even_on_failure(method):
    sql=SimpleNamespace(query=AsyncMock(return_value=[{'name':'old'}]),**{method:AsyncMock(side_effect=RuntimeError('write failed'))})
    cache=RequestSQL(sql);run(cache.query('SELECT name FROM site_settings'))
    with pytest.raises(RuntimeError):run(getattr(cache,method)([]))
    assert cache.used==0 and not cache.entries


def test_inflight_read_cannot_refill_after_write():
    async def scenario():
        ready=asyncio.Event();resume=asyncio.Event()
        async def read(*_):ready.set();await resume.wait();return [{'name':'old'}]
        sql=SimpleNamespace(query=read,batch=AsyncMock(return_value=[]));cache=RequestSQL(sql)
        task=asyncio.create_task(cache.query('SELECT name FROM site_settings'));await ready.wait()
        await cache.batch([]);resume.set();await task
        assert not cache.entries
    run(scenario())


def test_worker_template_budget_avoids_memory_probe(monkeypatch):
    import backend.app.resource_budget as budget
    monkeypatch.setattr(budget,'memory_snapshot',lambda:pytest.fail('worker must not probe OS memory'))
    renderer=Renderer.bundled({f'{i}.html':'Hello {{ person }}' for i in range(40)})
    assert isinstance(renderer.budget,WorkerBudget)
    for i in range(40):assert renderer.render(f'{i}.html',person='visitor')=='Hello visitor'
    assert len(renderer.env.cache)<=24


def test_local_exact_expiry_without_repeated_full_sweeps():
    clock=[0]
    class Budget:
        limit=1024*1024
        def limits(self):return self.limit,32
    budget=Budget();cache=PublicReadCache(budget,clock=lambda:clock[0])
    class Entries(OrderedDict):
        scans=0
        def items(self):self.scans+=1;return super().items()
    cache.entries=Entries();cache.get(b'key','rev');cache.put(b'key','rev',[{'v':1}],.5)
    scans=cache.entries.scans
    for _ in range(100):assert cache.get(b'key','rev')==[{'v':1}]
    assert cache.entries.scans==scans
    clock[0]=.6;assert cache.get(b'key','rev') is None
    cache.put(b'other','rev',[{'v':2}],30);budget.limit=0
    assert cache.get(b'other','rev') is None and cache.used==0


def test_real_worker_pages_reuse_queries_but_next_request_is_fresh(fixture,monkeypatch):
    import backend.app.native.request_cache as module
    c,r=fixture;r.kind='r2';c.cookies.clear();instances=[]
    class Observed(RequestSQL):
        def __init__(self,sql):super().__init__(sql);instances.append(self)
    monkeypatch.setattr(module,'RequestSQL',Observed)
    run(r.sql.batch([("INSERT INTO projects(uid,name,visibility) VALUES ('memo','Original memo title','public')",())]))
    first=c.get('/en/projects');assert first.status_code==200
    assert instances and sum(x.hits for x in instances)>0
    assert first.headers['cache-control']=='private, no-cache'
    assert 'Original memo title' in first.text
    before=len(instances)
    run(r.sql.batch([("UPDATE projects SET name='Updated memo title' WHERE uid='memo'",())]))
    second=c.get('/en/projects');assert second.status_code==200 and len(instances)>before
    assert 'Updated memo title' in second.text and 'Original memo title' not in second.text
    run(r.sql.batch([("UPDATE projects SET visibility='hidden' WHERE uid='memo'",())]))
    assert 'Updated memo title' not in c.get('/en/projects').text
    assert all(x.used<=LIMIT for x in instances)


def test_signed_in_and_admin_requests_bypass_worker_memo(fixture,monkeypatch):
    import backend.app.native.request_cache as module
    c,r=fixture;r.kind='r2'
    monkeypatch.setattr(module,'RequestSQL',lambda _:pytest.fail('authenticated or admin request cached'))
    assert c.get('/en/projects').status_code==200
    assert c.get('/admin').status_code==200


def test_disabled_local_cache_does_not_serialize(monkeypatch):
    import backend.app.native.public_cache as module
    class Budget:
        def limits(self):return 0,32
    cache=PublicReadCache(Budget());cache.revision='r'
    monkeypatch.setattr(module.json,'dumps',lambda *a,**k:pytest.fail('disabled cache serialized rows'))
    cache.put(b'k','r',[{'v':'value'}],30)
    assert cache.used==0


def test_worker_switch_bypasses_request_cache(fixture,monkeypatch):
    import backend.app.native.request_cache as module
    c,r=fixture;r.kind='r2';r.public_request_cache=False;c.cookies.clear()
    monkeypatch.setattr(module,'RequestSQL',lambda _:pytest.fail('disabled Worker cache used'))
    assert c.get('/en').status_code==200


def test_unique_business_reads_are_not_serialized():
    sql=SimpleNamespace(query=AsyncMock(return_value=[{'name':'value'}]));cache=RequestSQL(sql)
    run(cache.query('SELECT name FROM projects'));run(cache.query('SELECT name FROM projects'))
    assert sql.query.await_count==2 and cache.used==0
