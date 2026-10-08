import asyncio,json,pytest
from types import SimpleNamespace
from unittest.mock import patch
from site_sync.tests_website import test_integration as fixture
from site_sync.integration.host import runtime,grant_id
from site_sync.integration.clone import inventory,SCHEMA,key
from site_sync.core.selection import selected_tables,meta_record
from site_sync.integration.database import adapter
run=asyncio.run

@pytest.mark.parametrize('hard_termination',[False,True],ids=['lost-reply','hard-termination'])
def test_clone_verify_resumes_next_table_after_committed_reply_is_lost(hard_termination):
    class Killed(BaseException):pass
    f=fixture.IntegrationTests();f.setUp()
    try:
        r=f.target;rt=runtime(r);clock=[100]
        task=run(rt.repo.create(peer_id='peer',grant_id=grant_id(r.p),scope=['restore_profiles'],operation_id='atomic-clone',now=100,mode='manual',auto_confirm=True,auto_delete=True))
        uid=task['task_id'];selection=json.loads(task['scope_json']);chosen=selected_tables(selection)
        info=run(inventory(adapter(f.source),chosen));statekey='sync:clone-state:'+uid
        run(rt.db.batch([("UPDATE sync_tasks SET phase='apply' WHERE task_id=?",(uid,)),('INSERT INTO service_meta VALUES(?,?)',(key(uid,meta_record(selection)),json.dumps({'table':'meta','row':info,'media':[]})))]))
        checks=[];queries=[]
        class Peer:
            async def candidates(self,q):checks.append(q);return {'schema':SCHEMA,'unchanged':True}
        def state():
            rows=run(rt.db.query('SELECT value FROM service_meta WHERE key=?',(statekey,)))
            return json.loads(rows[0]['value']) if rows else None
        def tick(lose=False):
            # Rebuild runtime/adapter on every tick: recovery cannot use old memory.
            fresh=runtime(r);fresh.engine.clock=lambda:clock[0]
            async def peer(task):return Peer()
            fresh.peer_factory=peer;base=fresh.db.batch;query=fresh.db.query
            async def measured(sql,args=()):
                if sql.startswith('SELECT count(*) n FROM service_meta WHERE key LIKE'):queries.append(args[0])
                return await query(sql,args)
            async def lost(statements):
                result=await base(statements)
                if lose and any(sql.startswith('UPDATE service_meta SET value=') for sql,args in statements):
                    if hard_termination:raise Killed()
                    raise TimeoutError('committed checkpoint reply lost')
                return result
            with patch.object(fresh.db,'query',measured),patch.object(fresh.db,'batch',lost):
                if lose and hard_termination:
                    with pytest.raises(Killed):run(fresh.engine.tick())
                else:run(fresh.engine.tick())
            if lose and hard_termination:
                pending=run(fresh.repo.read(uid));clock[0]=pending['lease_until']+1
                assert run(fresh.engine.tick())['action']=='reconciled'
            row=run(fresh.repo.read(uid));clock[0]=max(clock[0]+1,row['next_run_at'])
            return row
        tick();assert state()['phase']=='verify_tables'
        for index,table in enumerate(chosen):
            before=len(queries);row=tick(lose=index==0)
            assert len(queries)-before==1
            assert queries[-1].endswith(table+':%')
            assert state()['table']==index+1
            assert row['no_progress_count']==0
            assert not checks
        tick();assert state()['phase']=='verify_source'
        tick();assert state()['phase']=='verify_admin' and len(checks)==1
        tick();assert state()['phase']=='restore' and len(checks)==1
        logs=run(rt.db.query('SELECT detail FROM sync_events WHERE task_id=? ORDER BY event_id DESC LIMIT 1',(uid,)))
        assert json.loads(logs[0]['detail'])['clone_checkpoint']['phase']=='restore'
    finally:f.tearDown()

def test_cross_table_candidate_keeps_selected_table_authority_and_one_query():
    from site_sync.integration.clone import candidates
    from site_sync.core.selection import RESTORE_SCOPES
    f=fixture.IntegrationTests();f.setUp()
    try:
        db=adapter(f.source);site=SimpleNamespace(db=db)
        q={'scope':list(RESTORE_SCOPES),'cursor':None}
        first=run(candidates(site,q));q['cursor']=first['cursor'];calls=[];base=db.query
        async def measured(sql,args=()):calls.append(sql);return await base(sql,args)
        with patch.object(db,'query',measured):page=run(candidates(site,q))
        assert len(calls)==1
        assert page['item']['module']=='restore_'+page['item']['id'].partition(':')[0]
        assert page['cursor'][1]==page['item']['module']
    finally:f.tearDown()
