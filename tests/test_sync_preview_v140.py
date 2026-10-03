"""Actual signed routes + SQLite: bounded metadata preview and preparation handoff."""
import asyncio,json
import pytest
from tests.test_site_sync_v121 import pair,finish,seed_media
from backend.app.native import site_sync as core,site_sync_tasks as tasks,site_sync_preview as brief
from backend.app.native.data_tools import encoded
run=asyncio.run

def preview(api,scopes,direction='pull'):
    job=api('start',{'direction':direction,'scopes':scopes,'preview_mode':'brief'})
    for _ in range(500):
        result=api('advance',{'uid':job['uid']})
        if result['status']=='ready':return result
    pytest.fail('Candidate preview did not finish')

def pages(api,uid,**filters):
    after=['',''];items=[]
    while True:
        part=api('get',{'uid':uid,'after':after,**filters})
        assert len(part['items'])<=20
        items+=part['items'];after=part['next']
        if after is None:return items

def test_brief_never_reads_body_or_full_compares_and_publishes_small_state(pair,monkeypatch):
    api,_,ra,rb,*_=pair
    run(rb.sql.batch([("INSERT INTO news(uid,title,slug,content) VALUES('large','Large','large',?)",('x'*250000,))]))
    def forbidden(*args,**kwargs):pytest.fail('Full content comparison reached brief preview')
    monkeypatch.setattr(core,'canonical',forbidden)
    monkeypatch.setattr(core,'reference_inputs',forbidden)
    calls=[]
    for db in (ra.sql,rb.sql):
        original=db.query
        async def track(sql,args=(),original=original):
            calls.append(sql);return await original(sql,args)
        monkeypatch.setattr(db,'query',track)
    result=preview(api,['news']);uid=result['uid']
    assert result['lightweight'] and any(x['uid']=='large' for x in pages(api,uid))
    state=run(tasks.get(ra.sql,uid))['state']
    assert 'items' not in state and len(encoded(state))<6000
    reads=[q for q in calls if 'FROM "news"' in q]
    assert reads and all('substr(' in q and 'LIMIT 21' in q and 'content' not in q and 'SELECT *' not in q for q in reads)
    payloads=run(ra.sql.query('SELECT payload FROM sync_task_items WHERE task_uid=?',(uid,)))
    assert max(len(x['payload']) for x in payloads)<2000
    assert not any('OFFSET' in q or 'json_group_array' in q for q in calls)

@pytest.mark.parametrize('direction',['pull','push'])
def test_candidates_include_equal_records_but_never_delete_missing_media(pair,direction):
    api,_,ra,rb,*_=pair
    for r in (ra,rb):run(r.sql.batch([("INSERT INTO students(uid,name) VALUES('same','Same')",())]))
    target=ra if direction=='pull' else rb
    seed_media(target,'f'*32,'kept.jpg',b'keep')
    result=preview(api,['students','media_assets'],direction)
    items=pages(api,result['uid']);same=next(x for x in items if x['uid']=='same')
    assert same['action']=='update' and same['candidate'] and same['fields']==[]
    assert not any(x['table']=='media_assets' and x['action']=='delete' for x in items)
    assert run(target.media_store.get('kept.jpg'))==b'keep'

def test_pagination_filters_and_selection_persist_across_pages(pair):
    api,_,ra,rb,*_=pair
    for start in range(0,45,20):
        run(rb.sql.batch([('INSERT INTO students(uid,name) VALUES(?,?)',(f'page{i:03}',f'Candidate {i:03}')) for i in range(start,min(start+20,45))]))
    uid=preview(api,['students'])['uid']
    items=pages(api,uid,search='Candidate',action='add')
    assert len(items)==45 and len({x['id'] for x in items})==45
    ids=[items[0]['id'],items[-1]['id']]
    assert api('select',{'uid':uid,'ids':ids})['selected']==ids
    assert api('get',{'uid':uid})['selection']['selected']==ids
    assert api('get',{'uid':uid,'search':'does not exist'})['items']==[]
    assert api('select',{'uid':uid,'ids':['students:missing']},ok=False).status_code==422
    assert api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'},ok=False).status_code==409
    assert api('proposal-send',{'uid':uid},ok=False).status_code==409

def test_prepare_is_idempotent_preserves_choices_and_requires_confirmation(pair):
    api,_,ra,rb,*_=pair
    before=run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))
    result=preview(api,['students']);uid=result['uid']
    chosen=next(x['id'] for x in pages(api,uid) if x['action']=='add')
    api('select',{'uid':uid,'ids':[chosen]})
    child=api('prepare-preview',{'uid':uid})['uid']
    assert api('prepare-preview',{'uid':uid})['uid']==child
    assert api('select',{'uid':uid,'ids':[]},ok=False).status_code==409
    for _ in range(600):
        result=api('advance',{'uid':child})
        if result['status']=='ready':break
    else:pytest.fail('Preparation did not finish')
    assert result['selection']['selected']==[chosen]
    assert 'execution' not in result
    assert run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))==before
    assert result['prepared'] and result['incremental']
    assert api('select',{'uid':child,'ids':[]},ok=False).status_code==409
    assert api('advance',{'uid':child})['selection']['selected']==[chosen]
    api('pull-begin',{'uid':child,'confirmation':'从对端同步到本站'});finish(api,child)
    assert len(run(ra.sql.query('SELECT uid FROM students')))==len(before)+1

def test_brief_restart_keeps_light_mode_without_inheriting_selection(pair):
    api,_,ra,rb,*_=pair
    result=preview(api,['students']);uid=result['uid']
    api('select',{'uid':uid,'ids':[result['items'][0]['id']]})
    child=api('restart',{'uid':uid})['uid']
    s=run(tasks.get(ra.sql,child))['state']
    assert s['lightweight'] and s['phase']=='brief' and not s['selection']['selected']

def test_preview_capability_required_before_task_creation(pair,monkeypatch):
    api,_,ra,rb,*_=pair
    original=tasks.hello
    async def old_peer(*args,**kwargs):
        value=await original(*args,**kwargs);value.pop('brief_preview',None);return value
    monkeypatch.setattr(tasks,'hello',old_peer)
    result=api('start',{'direction':'pull','scopes':['students'],'preview_mode':'brief'},ok=False)
    assert result.status_code==409 and '140' in result.text
    assert not run(ra.sql.query('SELECT uid FROM sync_tasks'))
