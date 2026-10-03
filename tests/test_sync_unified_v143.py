"""One-record approvals and scheduled pulls; no global snapshot or revision scans."""
import asyncio
from pathlib import Path
import pytest
from tests.test_site_sync_v121 import pair,seed_media,finish
from tests.test_site_sync_v122 import peers,approve
from tests.test_sync_incremental_v141 import prepare
from tests.test_site_sync_v123 import enable,drive
from backend.app.native import site_sync as core,site_sync_tasks as tasks,site_sync_schedule as schedule,site_sync_transport as transport
from backend.app.native.catalog import Error
run=asyncio.run

def no_global(monkeypatch):
    def forbidden(*a,**kw):pytest.fail('Global snapshot/version scan reached unified path')
    for name in ('page','revision','revision_page','canonical'):monkeypatch.setattr(core,name,forbidden)
    monkeypatch.setattr(tasks,'check_step',forbidden)

def test_requested_review_and_subset_only(peers,monkeypatch):
    api,b,_,review,ra,rb,*_=peers
    no_global(monkeypatch)
    uid,_=prepare(api,['students'],lambda x:x['action']=='add','push')
    sent=api('proposal-send',{'uid':uid})['outgoing']
    run(ra.sql.batch([("INSERT INTO news(uid,title,slug,content) VALUES('unrelated','Long','unrelated',?)",('x'*300000,))]))
    job=review(sent['request_id']);assert job['incremental'] and job['prepared']
    ident=job['items'][0]['id'];chosen=b('select',{'uid':job['uid'],'ids':[ident]})
    assert chosen['selected']==[ident]
    before=len(run(rb.sql.query('SELECT uid FROM students')))
    approve(b,job['uid'])
    assert len(run(rb.sql.query('SELECT uid FROM students')))==before+1
    saved=run(tasks.get(rb.sql,job['uid']))['state']
    assert saved['execution']['applied']==1 and saved['work']['elapsed_ms']>=0
    assert 'items' not in saved

def test_approval_dependency_selection_and_filtered_media(peers,monkeypatch):
    api,b,_,review,ra,rb,*_=peers;no_global(monkeypatch)
    raw=Path('tests/fixtures/media/sample.jpg').read_bytes()
    seed_media(ra,'a'*32,'new.jpg',raw)
    run(ra.sql.batch([("INSERT INTO profiles(uid,name,avatar_key) VALUES('person','Teacher','new.jpg')",())]))
    uid,_=prepare(api,['profiles'],lambda x:x['uid']=='person','push')
    sent=api('proposal-send',{'uid':uid})['outgoing'];job=review(sent['request_id'])
    chosen=b('select',{'uid':job['uid'],'ids':['profiles:person']})
    assert chosen['automatic']==['media_assets:'+'a'*32]
    # Choosing only the media must not execute the prepared-but-unselected teacher.
    b('select',{'uid':job['uid'],'ids':['media_assets:'+'a'*32]})
    approve(b,job['uid'])
    assert not run(rb.sql.query("SELECT uid FROM profiles WHERE uid='person'"))
    assert run(rb.media_store.get('new.jpg'))==raw

def test_missing_requested_media_and_record_noop(peers,monkeypatch):
    api,b,_,review,ra,rb,*_=peers;no_global(monkeypatch)
    raw=Path('tests/fixtures/media/sample.jpg').read_bytes();asset='d'*32
    seed_media(ra,asset,'gone.jpg',raw);seed_media(rb,asset,'gone.jpg',raw)
    run(ra.sql.batch([("INSERT INTO students(uid,name) VALUES('gone','Gone')",())]))
    uid,_=prepare(api,['students','media_assets'],lambda x:x['uid'] in ('gone',asset),'push')
    sent=api('proposal-send',{'uid':uid})['outgoing']
    run(ra.sql.batch([('DELETE FROM media_assets WHERE uid=?',(asset,)),("DELETE FROM students WHERE uid='gone'",())]));run(ra.media_store.delete('gone.jpg'))
    job=review(sent['request_id']);assert job['items']==[] and job['approval']['skipped']==2
    result=approve(b,job['uid']);assert result['execution']['phase']=='done'
    assert run(rb.media_store.get('gone.jpg'))==raw
    assert run(rb.sql.query('SELECT uid FROM media_assets WHERE uid=?',(asset,)))

def test_scheduler_uses_incremental_and_one_write_per_tick(pair,monkeypatch):
    api,_,ra,rb,*_=pair;no_global(monkeypatch);enable(api,True)
    prior=0;seen=False
    for _ in range(400):
        result=run(schedule.tick(ra));assert result.get('status')!='paused',result
        count=len(run(ra.sql.query("SELECT uid FROM operation_logs WHERE action LIKE 'sync_record_%'")))
        assert count-prior<=1;prior=count
        state=run(schedule.load(ra.sql,schedule.STATE))
        if state.get('preview_uid'):
            job=run(tasks.get(ra.sql,state['preview_uid']))
            if job['state'].get('incremental'):seen=True
        if state.get('last_finished'):break
    else:pytest.fail('Schedule did not complete')
    assert seen and prior==6
    assert run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))==run(rb.sql.query('SELECT uid FROM students ORDER BY uid'))

def test_scheduled_read_failure_keeps_same_preparation(pair,monkeypatch):
    api,_,ra,rb,_,_,network=pair;no_global(monkeypatch);enable(api,True)
    for _ in range(100):
        run(schedule.tick(ra));s=run(schedule.load(ra.sql,schedule.STATE))
        job=run(tasks.get(ra.sql,s['preview_uid']))
        if job['state'].get('incremental'):break
    uid=job['uid'];failed=False
    async def broken(kind,url,data):
        nonlocal failed
        if data['payload']['op']=='record' and not failed:
            failed=True;raise Error('network failed',502,'sync_network')
        return await network(kind,url,data)
    monkeypatch.setattr(transport,'post',broken)
    assert run(schedule.tick(ra))['status']=='paused'
    assert run(schedule.load(ra.sql,schedule.STATE))['preview_uid']==uid
    api('resume',{'uid':uid})
    s=run(schedule.load(ra.sql,schedule.STATE));s.pop('retry_after',None)
    run(ra.sql.batch([schedule.put(schedule.STATE,s)]));drive(ra)
    assert run(tasks.get(ra.sql,uid))['state']['execution']['phase']=='done'

def test_target_context_uses_single_query_without_body(pair,monkeypatch):
    from backend.app.native.site_sync_incremental import record
    _,_,ra,*_=pair
    run(ra.sql.batch([("INSERT INTO news(uid,title,slug,content) VALUES('large','Title','large',?)",('x'*300000,))]))
    calls=[];query=ra.sql.query
    async def count(sql,args=()):calls.append(sql);return await query(sql,args)
    monkeypatch.setattr(ra.sql,'query',count)
    value=run(record(ra.sql,'news','large',context=True))
    assert value['uid']=='large' and len(calls)==1
    assert 'content' not in value['row'] and 'content' not in calls[0]
