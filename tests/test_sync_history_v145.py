"""Bounded history retention and deletion; business data and active work are protected."""
import asyncio,json
import pytest
from tests.test_site_sync_v121 import pair
from backend.app.native import site_sync_history as history,site_sync_schedule as schedule
from backend.app.native.catalog import now,Error
run=asyncio.run

def seed(r,uid,state=None,age=0,items=0):
    state={'preview_format':8,**(state or {})}
    statements=[('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',(uid,'ready',json.dumps(state),now(seconds=-age)))]
    statements += [('INSERT INTO sync_task_items(task_uid,side,module,record_uid,payload) VALUES(?,?,?,?,?)',(uid,'local','@candidate:students',str(i),'{}')) for i in range(items)]
    for offset in range(0,len(statements),20):run(r.sql.batch(statements[offset:offset+20]))

def exists(r,uid):return bool(run(r.sql.query('SELECT uid FROM sync_tasks WHERE uid=?',(uid,))))

def test_count_and_age_retention(pair):
    _,_,r,*_=pair
    for i in range(13):seed(r,str(i),age=1000-i)
    for _ in range(4):run(history.prune(r.sql))
    assert len(run(r.sql.query('SELECT uid FROM sync_tasks')))==10
    assert not exists(r,'0') and exists(r,'12')
    run(r.sql.batch([('UPDATE sync_tasks SET created_at=? WHERE uid=?',(now(seconds=-8*86400),'12'))]))
    run(history.prune(r.sql));assert not exists(r,'12')

def test_manual_prunes_at_most_twenty_details_and_never_business(pair):
    api,_,r,*_=pair;seed(r,'old',items=45)
    before=run(r.sql.query('SELECT uid FROM students ORDER BY uid'))
    assert api('history-delete',{'uid':'old'},ok=False).status_code==422
    value=api('history-delete',{'uid':'old','confirmed':True});assert value['more']
    assert run(r.sql.query('SELECT count(*) n FROM sync_task_items WHERE task_uid=?',('old',)))[0]['n']==25
    assert api('get',{'uid':'old'},ok=False).status_code==404
    value=api('history-delete',{'uid':'old','confirmed':True});assert value['more']
    value=api('history-delete',{'uid':'old','confirmed':True});assert value['deleted'] and not value['more']
    assert api('history-delete',{'uid':'old','confirmed':True})['deleted']
    assert run(r.sql.query('SELECT uid FROM students ORDER BY uid'))==before

@pytest.mark.parametrize('kind',['active','pending','schedule','locked'])
def test_protected_tasks_not_removed(pair,kind):
    api,_,r,*_=pair
    seed(r,'protected',{'execution':{'phase':'download'}} if kind=='active' else {},age=8*86400,items=1)
    if kind=='pending':run(r.sql.batch([("INSERT INTO service_meta(key,value) VALUES('site-sync:inbox',?)",(json.dumps({'current':{'status':'pending','review_uid':'protected'}}),))]))
    if kind=='schedule':run(r.sql.batch([("INSERT INTO service_meta(key,value) VALUES('site-sync:schedule-state',?)",(json.dumps({'preview_uid':'protected'}),))]))
    if kind=='locked':run(r.sql.batch([('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(?,?,?,?,?)',('site-sync:task:protected','data_tools','test',now(),now()))]))
    assert not run(history.prune(r.sql))['deleted']
    response=api('history-delete',{'uid':'protected','confirmed':True},ok=False)
    assert response.status_code==409 and exists(r,'protected')

def test_parent_delete_removes_child_first_with_same_budget(pair):
    api,_,r,*_=pair;seed(r,'parent',{'prepared_uid':'child'},items=1);seed(r,'child',{'parent_uid':'parent'},items=21)
    for _ in range(2):assert api('history-delete',{'uid':'parent','confirmed':True})['more']
    assert exists(r,'parent') and not exists(r,'child')
    assert api('history-delete',{'uid':'parent','confirmed':True})['deleted']

def test_cleanup_runs_when_automatic_sync_disabled(pair):
    _,_,r,*_=pair;seed(r,'old',age=8*86400,items=1)
    assert run(schedule.tick(r))=={'skipped':'disabled'}
    assert not exists(r,'old')

def test_prepared_child_survives_expired_parent_cleanup(pair):
    _,_,r,*_=pair
    seed(r,'parent',{'prepared_uid':'child'},age=8*86400,items=1)
    seed(r,'child',{'parent_uid':'parent','prepared':True},items=1)
    assert run(history.prune(r.sql))['deleted']
    assert not exists(r,'parent') and exists(r,'child')

def test_reading_child_keeps_parent_until_preparation_finishes(pair):
    _,_,r,*_=pair
    seed(r,'parent',{'prepared_uid':'child'},age=8*86400,items=1)
    seed(r,'child',{'parent_uid':'parent'},items=1)
    run(r.sql.batch([("UPDATE sync_tasks SET status='reading' WHERE uid='child'",())]))
    assert not run(history.prune(r.sql))['deleted'] and exists(r,'parent')

def test_deleting_child_hides_and_queues_obsolete_parent(pair):
    api,_,r,*_=pair;seed(r,'parent',{'prepared_uid':'child'});seed(r,'child',{'parent_uid':'parent','prepared':True})
    assert api('history-delete',{'uid':'child','confirmed':True})['deleted']
    assert not run(history.listing(r.sql))
    run(history.prune(r.sql));assert not exists(r,'parent')

def test_scheduler_parent_protects_its_prepared_child(pair):
    api,_,r,*_=pair;seed(r,'parent',{'prepared_uid':'child'});seed(r,'child',{'parent_uid':'parent','prepared':True})
    run(r.sql.batch([("INSERT INTO service_meta(key,value) VALUES('site-sync:schedule-state',?)",(json.dumps({'preview_uid':'parent'}),))]))
    assert api('history-delete',{'uid':'child','confirmed':True},ok=False).status_code==409
    assert exists(r,'child')
