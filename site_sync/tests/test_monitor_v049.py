import asyncio,json,sqlite3
from pathlib import Path
from unittest.mock import patch
import pytest
from site_sync.tests import test_admin as fixture
from site_sync.admin.asgi import AdminASGI
from site_sync.admin.monitor import query
from site_sync.adapters.d1 import D1
from site_sync.tests.test_database import Binding
from site_sync.core.trace import scope
run=asyncio.run

@pytest.fixture
def env():
    f=fixture.AdminTests();f.setUp()
    try:
        uid=f.create();f.raw.connection.execute("UPDATE sync_tasks SET status='done',phase='done',progress_seq=37,no_progress_count=0,total_errors=46,last_progress_at=1791460482,last_dispatched_at=1791460482 WHERE task_id=?",(uid,))
        f.raw.connection.execute("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO sync_events(task_id,occurred_at,kind,level,phase,status,progress_seq,next_run_at,slice_bytes,detail) SELECT ?,x,'error','error','cleanup','waiting',36,0,4096,? FROM n",(uid,json.dumps({'error':'JsException','diagnostic':{'error_category':'exception'},'clone_checkpoint':{'phase':'cleanup','table':0,'after':''}})))
        yield f,uid
    finally:f.tearDown()

def client(f):
    import httpx
    async def auth(scope):return f.actor
    async def csrf(scope,actor):return True
    app=AdminASGI(f.admin,auth,csrf)
    class Client:
        def get(self,path,**kwargs):
            async def request():
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://local.test') as c:return await c.get(path,**kwargs)
            return run(request())
    return Client()

def test_completed_summary_never_reads_history_and_has_no_n_plus_one(env):
    f,uid=env
    for n in range(24):f.now+=1;f.create(request='request-'+str(n).zfill(8))
    calls=[];original=f.db.query
    async def checked(sql,args=()):
        calls.append(sql)
        assert not any(t in sql for t in ('sync_events','sync_items','sync_files','service_meta'))
        return await original(sql,args)
    with patch.object(f.db,'query',checked):
        response=client(f).get('/admin/site-sync/api/status-summary')
        assert response.status_code==200,response.text
        first=response.json();assert len(first['items'])==20 and first['has_more']
        assert len(calls)==3 # API grant + service grant + single bounded task query.
        last=client(f).get('/admin/site-sync/api/status-summary',params={'cursor':json.dumps(first['cursor'])}).json()
    terminal=next(x for x in last['items'] if x['task_id']==uid)
    assert (terminal['progress_seq'],terminal['total_errors'],terminal['no_progress_count'])==(37,46,0)
    assert not set(terminal)&{'scope_json','diagnostic','checkpoint','clone','last_error'}
    assert not last['has_more']

def test_detail_failure_is_independent_and_summary_error_has_route_stage(env,capsys):
    f,uid=env;original=f.raw.query
    f.admin.db=f.repo.db=D1(Binding(f.raw));fault=['detail']
    class JsException(Exception):pass
    async def checked(sql,args=()):
        if fault[0]=='detail' and 'sync_events' in sql:raise JsException('D1_ERROR: database is locked')
        if fault[0]=='summary' and sql.startswith('SELECT task_id,peer_id,status,phase'):raise JsException('D1_ERROR: database is locked')
        return await original(sql,args)
    with patch.object(f.raw,'query',checked),scope(request_id='a'*32,ray_id='12345678-EWR',colo='EWR'):
        c=client(f)
        assert c.get('/admin/site-sync/api/tasks/'+uid+'/detail').status_code==503
        assert c.get('/admin/site-sync/api/status-summary').status_code==200
        fault[0]='summary';response=c.get('/admin/site-sync/api/status-summary')
        assert response.status_code==503
        d=response.json()['diagnostic'];assert d['context']['query_stage']=='load-task-summary'
        assert d['context']['route'].endswith('/status-summary') and d['context']['colo']=='EWR'
        assert d['causes'][0]['d1']['message']=='D1_ERROR: database is locked'
    assert 'load-task-summary' in capsys.readouterr().out

def test_terminal_detail_separates_old_error_and_work_checkpoint(env):
    f,uid=env
    response=client(f).get('/admin/site-sync/api/tasks/'+uid+'/detail')
    assert response.status_code==200,response.text
    state=response.json()['execution']
    assert (state['status'],state['phase'],state['progress_seq'])==('completed','completed',37)
    assert state['historical_error']['recovered'] is True
    assert state['historical_error']['progress_seq']==36
    assert state['last_work_checkpoint']=={'phase':'cleanup','table':0,'after':''}
    assert len(response.json()['diagnostic_events'])<=3

def test_summary_plans_use_indexes_and_bound_each_status(env):
    f,uid=env
    for view in ('all','active','history','running','waiting','paused'):
        sql,args=query(f.actor.grant_id,view,[1000,'f'*32],20)
        plans=list(f.raw.connection.execute('EXPLAIN QUERY PLAN '+sql,args));text='\n'.join(row[3] for row in plans)
        assert 'SCAN sync_tasks' not in text,text
        assert 'SEARCH sync_tasks USING INDEX sync_tasks_monitor' in text,text
        assert 'LIMIT ?' in sql and args[-1]==21
    with pytest.raises(ValueError):query('g','all',None,21)

def test_exact_predecessor_adds_only_monitor_indexes(tmp_path):
    from site_sync.integration.migration import monitor_predecessor,monitor_upgrade_statements,definitions
    db=sqlite3.connect(':memory:')
    for statement in monitor_predecessor().values():db.execute(statement)
    db.execute("INSERT INTO profiles(uid,name) VALUES('kept','Teacher')")
    for sql in monitor_upgrade_statements():db.execute(sql)
    assert db.execute('SELECT name FROM profiles').fetchone()[0]=='Teacher'
    actual=dict(db.execute("SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"))
    assert actual==definitions('teacher.json')
    assert len(monitor_upgrade_statements())==2
    db.close()

def test_ubuntu_initialize_adds_indexes_without_resetting_existing_database(tmp_path):
    from backend.app.native.database import Database
    from site_sync.integration.migration import MONITOR_INDEXES
    path=tmp_path/'teacher.sqlite3';db=Database(path);db.initialize()
    with db.connect() as c:
        c.execute("INSERT INTO profiles(uid,name) VALUES('preserved','Teacher')")
        for name in MONITOR_INDEXES:c.execute('DROP INDEX '+name)
    db.initialize();db.verify();db.initialize()
    with db.connect() as c:
        assert c.execute('SELECT name FROM profiles WHERE uid=?',('preserved',)).fetchone()[0]=='Teacher'
        assert c.execute('SELECT version FROM sync_schema').fetchone()[0]==4
    assert list(tmp_path.glob('*.before-*.sqlite3'))
