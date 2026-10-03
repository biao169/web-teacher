"""Selected reads, one-record commits, dependency ordering, and response-loss recovery."""
import asyncio
from pathlib import Path
import pytest
from tests.test_site_sync_v121 import pair,finish,seed_media
from tests.test_sync_preview_v140 import preview,pages
from backend.app.native import site_sync as core,site_sync_tasks as tasks
from backend.app.native.catalog import Error
run=asyncio.run

def prepare(api,scopes,selector=lambda x:True,direction='pull'):
    candidate=preview(api,scopes,direction);uid=candidate['uid']
    ids=[v['id'] for v in pages(api,uid) if selector(v)]
    api('select',{'uid':uid,'ids':ids});child=api('prepare-preview',{'uid':uid})['uid']
    for _ in range(1000):
        result=api('advance',{'uid':child})
        if result['status']=='ready':return child,result
    pytest.fail('Selected preparation did not finish')

def begin(api,uid):return api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'})

def test_selected_only_no_snapshot_or_revision_and_unrelated_edits_allowed(pair,monkeypatch):
    api,_,ra,rb,*_=pair
    for i in range(4):run(rb.sql.batch([('INSERT INTO news(uid,title,slug,content) VALUES(?,?,?,?)',(f'large{i}','Large',f'large{i}','x'*250000))]))
    def forbidden(*args,**kwargs):pytest.fail('Global snapshot/version/full comparison reached selected path')
    for name in ('revision','revision_page','page','canonical'):monkeypatch.setattr(core,name,forbidden)
    before=run(ra.sql.query('SELECT uid FROM students'));reads=[];original=rb.sql.query
    async def track(sql,args=()):reads.append(sql);return await original(sql,args)
    monkeypatch.setattr(rb.sql,'query',track)
    uid,result=prepare(api,['students'],lambda x:x['action']=='add')
    assert result['prepared'] and result['incremental']
    state=run(tasks.get(ra.sql,uid))['state'];assert 'items' not in state and len(state['selection']['selected'])==3
    assert not any('FROM "news"' in sql for sql in reads)
    run(rb.sql.batch([("INSERT INTO projects(uid,name) VALUES('unrelated','Unrelated')",())]))
    begin(api,uid);result=finish(api,uid)
    assert result['execution']['applied']==3 and len(run(ra.sql.query('SELECT uid FROM students')))==len(before)+3

def test_write_ack_loss_retries_without_duplicate_audit_or_timestamp(pair,monkeypatch):
    api,_,ra,rb,*_=pair
    uid,_=prepare(api,['students'],lambda x:x['action']=='add');begin(api,uid)
    original=ra.sql.batch;lost=False
    async def batch(statements):
        nonlocal lost
        result=await original(statements)
        if not lost and any(sql.startswith('INSERT INTO "students"') for sql,_ in statements):
            lost=True;raise Error('reply lost',502,'sync_network')
        return result
    monkeypatch.setattr(ra.sql,'batch',batch)
    for _ in range(100):
        response=api('pull-tick',{'uid':uid},ok=False,drain=False)
        if response.status_code!=200:break
    assert lost and response.status_code==502
    saved=run(tasks.get(ra.sql,uid))['state']['execution'];assert saved['applied']==1
    key=saved['write_after'];stamp=run(ra.sql.query('SELECT updated_at FROM students WHERE uid=?',(key,)))[0]['updated_at']
    finish(api,uid)
    assert run(ra.sql.query('SELECT updated_at FROM students WHERE uid=?',(key,)))[0]['updated_at']==stamp
    audits=run(ra.sql.query("SELECT uid FROM operation_logs WHERE action='sync_record_add' AND target_uid=?",(key,)))
    assert len(audits)==1

def test_reference_updates_precede_deletion_no_implicit_set_null(pair):
    api,_,ra,rb,*_=pair
    run(ra.sql.batch([("INSERT INTO projects(uid,name) VALUES('gone','Old')",()),("INSERT INTO news(uid,title,slug,related_project_uid) VALUES('link','Old','linked','gone')",())]))
    run(rb.sql.batch([("INSERT INTO news(uid,title,slug) VALUES('link','New','linked')",())]))
    uid,result=prepare(api,['projects'],lambda x:x['uid']=='gone')
    assert 'news:link' in result['selection']['automatic']
    begin(api,uid);finish(api,uid)
    assert not run(ra.sql.query("SELECT uid FROM projects WHERE uid='gone'"))
    row=run(ra.sql.query("SELECT title,related_project_uid FROM news WHERE uid='link'"))[0]
    assert row=={'title':'New','related_project_uid':None}
    audit=run(ra.sql.query("SELECT action FROM operation_logs WHERE target_uid IN ('link','gone') AND action LIKE 'sync_record_%' ORDER BY id"))
    assert [v['action'] for v in audit]==['sync_record_update','sync_record_delete']

def test_partial_cancel_preserves_committed_records_and_can_restart(pair):
    api,_,ra,rb,*_=pair
    before=len(run(ra.sql.query('SELECT uid FROM students')))
    uid,_=prepare(api,['students'],lambda x:x['action']=='add');begin(api,uid)
    for _ in range(100):
        p=api('pull-tick',{'uid':uid},drain=False)
        if p['execution']['applied']==1:break
    api('pull-cancel',{'uid':uid});finish(api,uid)
    assert len(run(ra.sql.query('SELECT uid FROM students')))==before+1
    fresh=api('restart',{'uid':uid});assert fresh['uid']!=uid
    state=run(tasks.get(ra.sql,fresh['uid']))['state']
    assert state['lightweight'] and not state.get('incremental') and not state['selection']['selected']

@pytest.mark.parametrize('side',['source','target'])
def test_changed_selected_record_stops_before_overwrite(pair,side):
    api,_,ra,rb,*_=pair
    for r in (ra,rb):run(r.sql.batch([("INSERT INTO students(uid,name) VALUES('shared','Before')",())]))
    uid,_=prepare(api,['students'],lambda x:x['uid']=='shared')
    db=rb.sql if side=='source' else ra.sql
    run(db.batch([("UPDATE students SET name='Concurrent',updated_at='2030-01-01T00:00:00.000Z' WHERE uid='shared'",())]))
    begin(api,uid)
    for _ in range(100):
        response=api('pull-tick',{'uid':uid},ok=False,drain=False)
        if response.status_code!=200:break
    assert response.status_code==409
    assert run(tasks.get(ra.sql,uid))['state']['execution']['applied']==0
    assert run(ra.sql.query("SELECT name FROM students WHERE uid='shared'"))[0]['name']==('Concurrent' if side=='target' else 'Before')

def replacement(pair):
    api,_,ra,rb,*_=pair
    raw=Path('tests/fixtures/media/sample.jpg').read_bytes()
    seed_media(ra,'a'*32,'old.jpg',raw);seed_media(rb,'b'*32,'new.jpg',raw)
    for r,key,media in ((ra,'old.jpg','a'*32),(rb,'new.jpg','b'*32)):
        run(r.sql.batch([("INSERT INTO profiles(uid,name,avatar_key) VALUES('teacher','Teacher',?)",(key,)),
                        ("INSERT INTO news(uid,title,slug,content,content_format) VALUES('article','Article','article',?,'html')",('<img src="/media/'+media+'">',))]))
    uid,result=prepare(api,['profiles','news'],lambda x:x['uid'] in ('teacher','article'))
    assert result['selection']['automatic']==['media_assets:'+'b'*32]
    begin(api,uid);finish(api,uid)
    assert run(ra.sql.query("SELECT avatar_key FROM profiles WHERE uid='teacher'"))[0]['avatar_key']=='new.jpg'
    assert run(ra.media_store.get('new.jpg'))==raw and run(ra.media_store.get('old.jpg'))==raw
    assert run(ra.sql.query('SELECT uid FROM media_assets WHERE uid=?',('a'*32,)))

def test_media_first_and_missing_old_media_not_deleted(pair):replacement(pair)

def test_new_inbound_reference_after_preparation_blocks_delete_atomically(pair):
    api,_,ra,rb,*_=pair
    run(ra.sql.batch([("INSERT INTO projects(uid,name) VALUES('gone','Old')",())]))
    uid,_=prepare(api,['projects'],lambda x:x['uid']=='gone')
    run(ra.sql.batch([("INSERT INTO news(uid,title,slug,related_project_uid) VALUES('late','Late','late','gone')",())]))
    begin(api,uid)
    for _ in range(100):
        response=api('pull-tick',{'uid':uid},ok=False,drain=False)
        if response.status_code!=200:break
    assert response.status_code!=200
    assert run(ra.sql.query("SELECT related_project_uid FROM news WHERE uid='late'"))[0]['related_project_uid']=='gone'
    assert run(ra.sql.query("SELECT uid FROM projects WHERE uid='gone'"))


def test_target_body_is_not_loaded_for_overwrite(pair):
    api,_,ra,rb,*_=pair
    run(ra.sql.batch([("INSERT INTO news(uid,title,slug,content) VALUES('replace','Replace','replace',?)",('x'*250000,))]))
    run(rb.sql.batch([("INSERT INTO news(uid,title,slug,content) VALUES('replace','Replace','replace','small')",())]))
    uid,_=prepare(api,['news'],lambda x:x['uid']=='replace')
    begin(api,uid);finish(api,uid)
    assert run(ra.sql.query("SELECT content FROM news WHERE uid='replace'"))[0]['content']=='small'


def test_singleton_identity_preserves_target_private_configuration(pair):
    api,_,ra,rb,*_=pair
    for r,ident,secret,registration in ((ra,'local-global','target-private',0),(rb,'remote-global','source-private',1)):
        run(r.sql.batch([('DELETE FROM global_settings',()),('INSERT INTO global_settings(uid,epo_ops_client_secret,allow_public_registration) VALUES(?,?,?)',(ident,secret,registration))]))
    uid,_=prepare(api,['global_settings'])
    begin(api,uid);finish(api,uid)
    rows=run(ra.sql.query('SELECT uid,epo_ops_client_secret,allow_public_registration FROM global_settings'))
    assert rows==[{'uid':'local-global','epo_ops_client_secret':'target-private','allow_public_registration':1}]


def test_selected_push_sends_only_proposal_without_full_revision(pair,monkeypatch):
    api,_,ra,rb,*_=pair
    from backend.app.native.site_sync_proposals import ALLOW,box
    run(rb.sql.batch([("INSERT INTO service_meta(key,value) VALUES(?,'1') ON CONFLICT(key) DO UPDATE SET value='1'",(ALLOW,))]))
    uid,result=prepare(api,['students'],lambda x:x['action']=='add','push')
    before=run(rb.sql.query('SELECT uid FROM students ORDER BY uid'))
    async def forbidden(*args,**kwargs):pytest.fail('Full revision scan during incremental proposal')
    monkeypatch.setattr(tasks,'check_step',forbidden)
    sent=api('proposal-send',{'uid':uid})
    assert sent['outgoing']['status']=='pending'
    assert run(rb.sql.query('SELECT uid FROM students ORDER BY uid'))==before
    _,inbox=run(box(rb.sql))
    assert set(inbox['current']['ids'])==set(result['selection']['selected'])
