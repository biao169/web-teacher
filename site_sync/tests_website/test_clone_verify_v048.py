"""SQLite + D1 contract tests; actual local workerd D1 query plans tested in .mjs."""
import asyncio,json,builtins
from types import SimpleNamespace
from unittest.mock import patch
import pytest
from site_sync.tests_website import test_integration as fixture
from site_sync.tests.test_database import Binding
from site_sync.adapters.d1 import D1
from site_sync.integration.host import runtime,grant_id
from site_sync.integration.clone import key,prefix,prefix_range,SCHEMA
from site_sync.core.selection import selected_tables,meta_record
from site_sync.admin.service import Admin,Actor
from site_sync.core import adaptive
run=asyncio.run
class JsException(Exception):
    def __init__(self):
        super().__init__('D1_ERROR: database is locked')
        self.js_error=SimpleNamespace(name='Error',message='D1_ERROR: database is locked; secret=hidden-value',stack='Error private\n at query (d1-api.js:42:8)')

@pytest.fixture
def setup():
    f=fixture.IntegrationTests();f.setUp()
    try:
        rt=runtime(f.target);raw=rt.db;db=D1(Binding(raw));rt.db=rt.repo.db=rt.adapter.db=db
        now=[100];rt.engine.clock=lambda:now[0];rt.engine.step_timeout=25
        task=run(rt.repo.create(peer_id='peer',grant_id=grant_id(f.target.p),scope=['restore_profiles'],operation_id='verify048',now=100,mode='manual',auto_confirm=True,auto_delete=True))
        uid=task['task_id'];selection=json.loads(task['scope_json']);tables=selected_tables(selection)
        assert tables[0]=='media_assets'
        info={'schema':SCHEMA,'tables':[{'name':t,'n':3 if t=='media_assets' else 0,'stamp':''} for t in tables]}
        state={'phase':'verify_tables','table':0,'after':''};statekey='sync:clone-state:'+uid
        run(db.batch([("UPDATE sync_tasks SET phase='apply',progress_seq=21 WHERE task_id=?",(uid,)),('INSERT INTO service_meta VALUES(?,?)',(statekey,json.dumps(state))),('INSERT INTO service_meta VALUES(?,?)',(key(uid,meta_record(selection)),json.dumps({'row':info}))),*[('INSERT INTO service_meta VALUES(?,?)',(key(uid,'media_assets:'+str(i)),'{}')) for i in range(3)]]))
        yield f,rt,raw,now,uid,statekey
    finally:f.tearDown()

def state(db,k):return json.loads(run(db.query('SELECT value FROM service_meta WHERE key=?',(k,)))[0]['value'])

def test_large_meta_index_and_checkpoint_progress(setup):
    f,rt,raw,now,uid,k=setup
    run(raw.batch([("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<40000) INSERT INTO service_meta SELECT 'unrelated:'||x,'{}' FROM n",())]))
    base=prefix(uid)+'media_assets:'
    old=run(raw.query('EXPLAIN QUERY PLAN SELECT count(*) n FROM service_meta WHERE key LIKE ?',(base+'%',)))
    new=run(raw.query('EXPLAIN QUERY PLAN SELECT count(*) n FROM service_meta WHERE key >= ? AND key < ?',prefix_range(base)))
    assert any('SCAN' in x['detail'] for x in old)
    assert all('SCAN' not in x['detail'] for x in new)
    assert any('SEARCH' in x['detail'] and 'key>?' in x['detail'] for x in new)
    run(rt.engine.tick());assert state(rt.db,k)['table']==1
    assert run(rt.repo.read(uid))['progress_seq']==22

@pytest.mark.parametrize('point',['load','count','save'])
def test_js_exception_preserves_exact_substep_checkpoint_and_message(setup,point):
    f,rt,raw,now,uid,k=setup;query=raw.query;batch=raw.batch
    async def failquery(sql,args=()):
        if (point=='load' and sql.startswith('SELECT substr(value,1,16385)')) or (point=='count' and sql.startswith('SELECT count(*) n FROM service_meta')):raise JsException()
        return await query(sql,args)
    async def failbatch(statements):
        if point=='save' and any(sql=='UPDATE service_meta SET value=? WHERE key=?' and args[-1]==k for sql,args in statements):raise JsException()
        return await batch(statements)
    with patch.object(raw,'query',failquery),patch.object(raw,'batch',failbatch):run(rt.engine.tick())
    event=json.loads(run(rt.db.query("SELECT detail FROM sync_events WHERE task_id=? AND kind='error' ORDER BY event_id DESC LIMIT 1",(uid,)))[0]['detail'])
    d=event['diagnostic'];c=d['context'];engine=d['causes'][0]['d1']
    assert c['sub_stage']=='clone-verify-table-'+{'load':'load-inventory','count':'count','save':'save-checkpoint'}[point]
    assert c['task_id']==uid and len(c['request_id'])==32 and c['table']=='media_assets'
    assert c['checkpoint_before']==c['checkpoint_after']=={'phase':'verify_tables','table':0,'after':''}
    assert 'database is locked' in engine['message'] and 'hidden-value' not in json.dumps(event)
    assert engine['operation']==('batch' if point=='save' else 'query')
    assert engine['native_frames'][0]['file']=='d1-api.js'
    assert state(rt.db,k)['table']==0 and run(rt.repo.read(uid))['progress_seq']==21
    now[0]=run(rt.repo.read(uid))['next_run_at'];run(rt.engine.tick())
    assert state(rt.db,k)['table']==1

def test_same_checkpoint_quarantine_status_read_and_manual_recovery(setup):
    f,rt,raw,now,uid,k=setup;query=raw.query
    async def fail(sql,args=()):
        if sql.startswith('SELECT count(*) n FROM service_meta'):raise JsException()
        return await query(sql,args)
    with patch.object(raw,'query',fail):
        for i in range(7):
            run(rt.engine.tick());row=run(rt.repo.read(uid));a=run(adaptive.read(rt.db,uid))
            assert a['same_checkpoint_errors']==i+1 and a['quarantined']==(i>=5)
            if i>=5:assert row['next_run_at']-now[0]>=1800
            now[0]=row['next_run_at']
        actor=Actor(f.target.p['uid'],grant_id(f.target.p));admin=Admin(rt.repo,lambda:now[0])
        from site_sync.admin.asgi import AdminASGI
        from starlette.testclient import TestClient
        async def auth(scope):return actor
        async def csrf(scope,actor):return True
        original=builtins.__import__
        def guard(name,*args,**kwargs):
            if name=='site_sync.integration.clone':raise AssertionError('monitor imports executor code')
            return original(name,*args,**kwargs)
        with patch('builtins.__import__',guard):
            response=TestClient(AdminASGI(admin,auth,csrf)).get('/admin/site-sync/api/status')
            assert response.status_code==200 and response.json()['items'][0]['quarantined']==1
            assert run(admin.detail(actor,uid))['clone']['table']=='media_assets'
    assert row['progress_seq']==21 and state(rt.db,k)['table']==0
    run(rt.repo.pause(uid,actor.grant_id,now[0]));run(rt.repo.resume(uid,actor.grant_id,now[0]))
    assert not run(adaptive.read(rt.db,uid))['quarantined']
    run(rt.engine.tick());assert state(rt.db,k)['table']==1
    assert run(rt.repo.read(uid))['progress_seq']==22

def test_inventory_parse_and_count_mismatch_are_not_database_exceptions(setup):
    f,rt,raw,now,uid,k=setup
    row=run(rt.repo.read(uid));metakey=key(uid,meta_record(json.loads(row['scope_json'])))
    run(rt.db.batch([('UPDATE service_meta SET value=? WHERE key=?',('{bad',metakey))]))
    run(rt.engine.tick())
    d=json.loads(run(rt.db.query("SELECT detail FROM sync_events WHERE task_id=? AND kind='error' ORDER BY event_id DESC LIMIT 1",(uid,)))[0]['detail'])['diagnostic']
    assert d['error']=='JSONDecodeError' and d['context']['sub_stage']=='clone-verify-table-parse-inventory'
    assert state(rt.db,k)['table']==0

@pytest.mark.parametrize('bad',['missing','negative','mismatch'])
def test_inventory_contract_failure_has_precise_stage(setup,bad):
    f,rt,raw,now,uid,k=setup;row=run(rt.repo.read(uid));metakey=key(uid,meta_record(json.loads(row['scope_json'])))
    if bad=='missing':run(rt.db.batch([('DELETE FROM service_meta WHERE key=?',(metakey,))]))
    else:
        info=state(rt.db,metakey);info['row']['tables'][0]['n']=-1 if bad=='negative' else 4
        run(rt.db.batch([('UPDATE service_meta SET value=? WHERE key=?',(json.dumps(info),metakey))]))
    run(rt.engine.tick())
    d=json.loads(run(rt.db.query("SELECT detail FROM sync_events WHERE task_id=? AND kind='error' ORDER BY event_id DESC LIMIT 1",(uid,)))[0]['detail'])['diagnostic']
    assert d['error']=='ConflictError'
    assert d['context']['sub_stage']=='clone-verify-table-'+{'missing':'load-inventory','negative':'parse-inventory','mismatch':'compare'}[bad]
    if bad=='mismatch':assert (d['context']['expected_count'],d['context']['actual_count'])==(4,3)
    assert state(rt.db,k)['table']==0

def test_progress_clears_quarantine_and_apply_pressure_keeps_slice(setup):
    f,rt,raw,now,uid,k=setup
    run(rt.db.batch([('INSERT INTO service_meta VALUES(?,?)',(adaptive.PREFIX+uid,json.dumps(dict(adaptive.empty(),same_checkpoint_errors=7,failure_fingerprint='f'*64,quarantined=True))))]))
    run(rt.engine.tick());assert not run(adaptive.read(rt.db,uid))['quarantined']
    row=run(rt.repo.read(uid));now[0]=row['next_run_at'];claimed=run(rt.repo.claim(now[0]))
    run(rt.repo.finish(claimed,now[0],error='ResourceError',resource=True,diagnostic={'error_category':'resource','causes':[{'platform_code':1102}]}))
    assert run(rt.repo.read(uid))['slice_bytes']==row['slice_bytes']
