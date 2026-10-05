"""Long-field wire protocol, durable append and compatibility over signed HTTP."""
import asyncio,json
from types import SimpleNamespace
import pytest
from tests.test_site_sync_v121 import pair,finish
from tests.test_sync_preview_v140 import preview,pages
from tests.test_sync_incremental_v141 import begin
from backend.app.native import site_sync_tasks as tasks,site_sync_transport as transport,site_sync_fields as fields,site_sync_work as work
from backend.app.native.site_sync_analysis import get
from backend.app.native.catalog import Error
run=asyncio.run


def child(pair,text,*,direction='pull'):
    api,_,ra,rb,*_=pair
    source=rb if direction=='pull' else ra
    run(source.sql.batch([("INSERT INTO news(uid,title,slug,content,content_format) VALUES('long','Long','long',?,'html')",(text,))]))
    candidate=preview(api,['news'],direction)
    api('select',{'uid':candidate['uid'],'ids':['news:long']})
    return api('prepare-preview',{'uid':candidate['uid']})['uid']


def complete(pair,uid):
    api=pair[0]
    for _ in range(600):
        value=api('advance',{'uid':uid})
        if value['status']=='ready':return value
    pytest.fail('long fields did not finish')


def reader(r,uid):return run(tasks.get(r.sql,uid))['state'].get('current',{}).get('field_reader')


def test_unicode_fragments_signed_bounded_and_durable(pair,monkeypatch):
    api,_,ra,rb,*_=pair;text='<p>'+('中🙂"\\\n'*900)+'</p>';uid=child(pair,text)
    requested=[];network=transport.post
    async def track(kind,url,message):
        payload=message['payload']
        if payload['op'] in ('record-field','record-fields','record'):requested.append(payload)
        return await network(kind,url,message)
    monkeypatch.setattr(transport,'post',track)
    api('advance',{'uid':uid})
    assert reader(ra,uid)['offset']==0
    before=run(work.position(ra.sql,uid))['checkpoint']
    api('advance',{'uid':uid})
    state=reader(ra,uid)
    assert 0<state['offset']<=2048
    assert run(work.position(ra.sql,uid))['checkpoint']!=before
    monitor=api('monitor')['jobs'];job=next(j for j in monitor if j['uid']==uid)
    assert job['field_name']=='content' and job['field_offset']==state['offset'] and 'text' not in job
    complete(pair,uid)
    assert run(get(ra.sql,uid,'remote','news','long'))['content']==text
    assert not run(ra.sql.query("SELECT payload FROM sync_task_items WHERE task_uid=? AND module LIKE '@field-%'",(uid,)))
    assert all(p['op']!='record' for p in requested)
    offsets=[p['offset'] for p in requested if p['op']=='record-field']
    assert offsets==sorted(set(offsets)) and len(offsets)>2
    begin(api,uid);finish(api,uid)
    assert run(ra.sql.query("SELECT content FROM news WHERE uid='long'"))


def test_lost_append_receipt_resumes_after_saved_offset(pair,monkeypatch):
    api,_,ra,*_=pair;uid=child(pair,'<p>'+'x'*6000+'</p>')
    api('advance',{'uid':uid});original=ra.sql.batch;lost=False
    async def batch(statements):
        nonlocal lost
        result=await original(statements)
        if not lost and any("json_extract(payload,'$.text')||?" in sql for sql,args in statements):
            lost=True;raise Error('lost',502,'sync_network')
        return result
    monkeypatch.setattr(ra.sql,'batch',batch)
    assert api('advance',{'uid':uid},ok=False).status_code==502
    offset=reader(ra,uid)['offset'];assert offset>0
    state=run(tasks.get(ra.sql,uid))['state'];assert state['work']['failures_with_progress']>=1
    assert api('advance',{'uid':uid},ok=False).status_code==429
    run(ra.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work.retry_after','2000-01-01T00:00:00.000Z') WHERE uid=?",(uid,))]))
    complete(pair,uid)
    assert run(get(ra.sql,uid,'remote','news','long'))['content']=='<p>'+'x'*6000+'</p>'


@pytest.mark.parametrize('mutation',['stamp','delete'])
def test_source_change_never_publishes_partial_record(pair,mutation):
    api,_,ra,rb,*_=pair;uid=child(pair,'x'*6000)
    api('advance',{'uid':uid});api('advance',{'uid':uid})
    sql="UPDATE news SET content='new',updated_at='2030-01-01T00:00:00.000Z' WHERE uid='long'" if mutation=='stamp' else "DELETE FROM news WHERE uid='long'"
    run(rb.sql.batch([(sql,())]))
    assert api('advance',{'uid':uid},ok=False).status_code==409
    assert run(get(ra.sql,uid,'remote','news','long')) is None
    assert not run(ra.sql.query("SELECT uid FROM news WHERE uid='long'"))


@pytest.mark.parametrize('damage',['digest','offset','length'])
def test_signed_but_invalid_fragment_does_not_advance(pair,monkeypatch,damage):
    api,_,ra,*_=pair;uid=child(pair,'x'*6000);api('advance',{'uid':uid})
    network=transport.post
    async def corrupt(kind,url,message):
        result=await network(kind,url,message)
        if message['payload']['op']=='record-field':
            value=transport.verify('s'*64,result)
            if damage=='digest':value['sha256']='0'*64
            elif damage=='offset':value['offset']+=1
            else:value['text']+='unexpected'
            return transport.envelope('s'*64,value)
        return result
    monkeypatch.setattr(transport,'post',corrupt)
    assert api('advance',{'uid':uid},ok=False).status_code==409
    assert reader(ra,uid)['offset']==0
    assert run(get(ra.sql,uid,'remote',fields.TEXT+'news','long'))=={'text':''}


def test_worker_pressure_changes_width_without_losing_offset(pair):
    api,_,ra,rb,*_=pair;uid=child(pair,'x'*6000);api('advance',{'uid':uid})
    # Exercise the production reader with a worker resource and the saved cursor.
    ra.kind='r2'
    task=run(tasks.get(ra.sql,uid));run(fields.read_step(ra,task,'remote','news','long'))
    assert reader(ra,uid)['offset']==512
    task=run(tasks.get(ra.sql,uid));task['state']['work']['resource_level']=2
    run(fields.read_step(ra,task,'remote','news','long'))
    assert reader(ra,uid)['offset']==640
    ra.kind='local';complete(pair,uid)
    assert run(get(ra.sql,uid,'remote','news','long'))['content']=='x'*6000


def test_legacy_peer_falls_back_without_unknown_operations(pair,monkeypatch):
    network=transport.post;ops=[]
    async def old(kind,url,message):
        op=message['payload']['op'];ops.append(op)
        assert op not in ('record-fields','record-field')
        result=await network(kind,url,message)
        if op=='hello':
            value=transport.verify('s'*64,result);value.pop('field_chunks',None)
            result=transport.envelope('s'*64,value)
        return result
    monkeypatch.setattr(transport,'post',old)
    uid=child(pair,'x'*6000);complete(pair,uid)
    assert 'record' in ops
    assert run(tasks.get(pair[2].sql,uid))['state']['field_chunks']==0


def test_existing_task_negotiates_once_then_resumes(pair):
    api,_,ra,*_=pair;uid=child(pair,'x'*6000)
    run(ra.sql.batch([("UPDATE sync_tasks SET state=json_remove(state,'$.field_chunks') WHERE uid=?",(uid,))]))
    api('advance',{'uid':uid});assert reader(ra,uid) is None
    assert run(tasks.get(ra.sql,uid))['state']['field_chunks']==1
    complete(pair,uid)
    assert run(get(ra.sql,uid,'remote','news','long'))['content']=='x'*6000


def test_local_source_push_uses_same_protocol_without_remote_writes(pair):
    uid=child(pair,'x'*6000,direction='push');complete(pair,uid)
    assert run(get(pair[2].sql,uid,'local','news','long'))['content']=='x'*6000
    assert not run(pair[3].sql.query("SELECT uid FROM news WHERE uid='long'"))


def test_null_controls_and_json_text_remain_exact(pair):
    api,_,ra,rb,*_=pair
    # JSON string contents are opaque: do not split/parse embedded user JSON.
    text=('中\x00🙂\\"\r\n'+json.dumps({'a':[1,None,'x']}))*80
    uid=child(pair,text);api('advance',{'uid':uid})
    for _ in range(100):
        task=run(tasks.get(ra.sql,uid));value=run(fields.read_step(ra,task,'remote','news','long'))
        if value is not None:break
    assert value['row']['content']==text


def test_stale_append_rolls_back_instead_of_duplicating_text(pair):
    api,_,ra,*_=pair;uid=child(pair,'x'*6000);api('advance',{'uid':uid})
    stale=run(tasks.get(ra.sql,uid));api('advance',{'uid':uid})
    before=run(get(ra.sql,uid,'remote',fields.TEXT+'news','long'))
    with pytest.raises(Exception):run(fields.read_step(ra,stale,'remote','news','long'))
    assert run(get(ra.sql,uid,'remote',fields.TEXT+'news','long'))==before
    complete(pair,uid)
    assert run(get(ra.sql,uid,'remote','news','long'))['content']=='x'*6000


@pytest.mark.parametrize('params',[{'offset':-1},{'chars':2049},{'chars':True},{'field':'epo_ops_client_secret'},{'field':'content" FROM auth_users --'}])
def test_invalid_fragment_parameters_rejected(pair,params):
    rb=pair[3]
    run(rb.sql.batch([("INSERT INTO news(uid,title,slug,content) VALUES('long','Long','long',?)",('x'*1000,))]))
    head=run(fields.manifest(rb.sql,'news','long'))
    data={'table':'news','key':'long','field':'content','offset':0,'chars':512,'stamp':head['stamp'],**params}
    with pytest.raises(Error):run(fields.fragment(rb,data))


def test_corrupt_staging_is_not_published(pair):
    api,_,ra,*_=pair;uid=child(pair,'x'*500);api('advance',{'uid':uid});api('advance',{'uid':uid})
    assert reader(ra,uid)['stage']=='field-save'
    run(ra.sql.batch([("UPDATE sync_task_items SET payload=? WHERE task_uid=? AND module=?",('{"text":"invalid"}',uid,fields.TEXT+'news'))]))
    response=api('advance',{'uid':uid},ok=False)
    assert response.status_code==409
    assert run(get(ra.sql,uid,'remote','news','long')) is None


def test_remote_1102_retries_local_receiver_with_smaller_fragments(pair,monkeypatch):
    api,_,ra,*_=pair;uid=child(pair,'x'*6000);api('advance',{'uid':uid});network=transport.post
    failed=False;requested=[]
    async def interrupt(kind,url,message):
        nonlocal failed
        if message['payload']['op']=='record-field':
            requested.append(message['payload']['chars'])
            if not failed:
                failed=True;raise Error('remote CPU limit',502,'1102')
        return await network(kind,url,message)
    monkeypatch.setattr(transport,'post',interrupt)
    assert api('advance',{'uid':uid},ok=False).status_code==502
    assert reader(ra,uid)['offset']==0
    run(ra.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work.retry_after','2000-01-01T00:00:00.000Z') WHERE uid=?",(uid,))]))
    api('advance',{'uid':uid})
    assert requested==[2048,256] and reader(ra,uid)['offset']==256
    complete(pair,uid)
    assert run(get(ra.sql,uid,'remote','news','long'))['content']=='x'*6000


def test_manifest_keeps_unicode_identity_inline(pair):
    r=pair[3];uid='中🙂'*60
    run(r.sql.batch([('INSERT INTO news(uid,title,slug,content) VALUES(?,?,?,?)',(uid,'Long','unicode-id','x'*600))]))
    value=run(fields.manifest(r.sql,'news',uid));fields.validate_manifest(value,'news',uid)
    assert value['row']['uid']==uid and all(f['name']!='uid' for f in value['fields'])


def test_field_wire_response_limit_is_small(monkeypatch):
    seen=[]
    async def fetch(url,raw,limit):seen.append(limit);return {}
    monkeypatch.setattr(transport,'_worker',fetch)
    for op in ('record-fields','record-field'):
        run(transport.post('r2','https://b.example.org',{'payload':{'op':op}}))
    assert seen==[32768,32768]


from tests.test_site_sync_v122 import peers,approve

def test_push_approval_reads_long_fields_before_explicit_consent(pair,peers):
    api,api_b,_,review,ra,rb,*_=peers
    text='<p>'+'正文🙂'*700+'</p>'
    uid=child(pair,text,direction='push');complete(pair,uid)
    sent=api('proposal-send',{'uid':uid})['outgoing']
    assert not run(rb.sql.query("SELECT uid FROM news WHERE uid='long'"))
    reviewed=review(sent['request_id']);incoming=reviewed['uid']
    assert run(tasks.get(rb.sql,incoming))['state']['field_chunks']==1
    assert run(get(rb.sql,incoming,'remote','news','long'))['content']==text
    assert not run(rb.sql.query("SELECT uid FROM news WHERE uid='long'"))
    approve(api_b,incoming)
    assert run(rb.sql.query("SELECT content FROM news WHERE uid='long'"))[0]['content']==text
