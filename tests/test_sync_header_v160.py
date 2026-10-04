import asyncio
import json
from types import SimpleNamespace
import pytest
from tests.test_sync_latest_v149 import MemorySQL
from backend.app.native import site_sync_tasks as tasks, site_sync_proposals as proposals
from backend.app.native.catalog import Error


def test_header_and_ordinary_receipt_never_load_business_payload(monkeypatch):
    sql=MemorySQL()
    try:
        state={'preview_format':tasks.TASK_FORMAT,'work':{'status':'saved'},'items':[{'body':'PRIVATE'*100000}],'execution':{'phase':'download','media':[{'key':'PRIVATE'}]}}
        sql.db.execute('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',('t','ready',json.dumps(state),'2026-10-04T00:00:00.000Z'))
        async def forbidden(*a,**k):raise AssertionError('Full snapshot read')
        monkeypatch.setattr(tasks,'get',forbidden)
        result=asyncio.run(tasks.header(sql,'t'))
        assert len(json.dumps(result))<300 and 'PRIVATE' not in json.dumps(result)
        asyncio.run(proposals.update_progress(SimpleNamespace(sql=sql),{'uid':'t'}))
        assert len(sql.queries)==2 and all('SELECT *' not in q for q,_ in sql.queries)
    finally:sql.db.close()


def test_receipt_still_updates_approved_proposal():
    sql=MemorySQL()
    try:
        state={'preview_format':tasks.TASK_FORMAT,'approval':{'request_id':'request'}}
        sql.db.execute('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',('t','ready',json.dumps(state),'2026-10-04T00:00:00.000Z'))
        sql.db.execute('INSERT INTO service_meta(key,value) VALUES(?,?)',(proposals.INBOX,json.dumps({'current':{'request_id':'request'},'history':[]})))
        asyncio.run(proposals.update_progress(SimpleNamespace(sql=sql),{'uid':'t','execution':{'phase':'done','committed':True}}))
        _, inbox=asyncio.run(proposals.box(sql))
        assert inbox['current']['phase']=='done' and inbox['current']['committed'] is True
    finally:sql.db.close()


def test_scheduler_reads_only_header_before_executor(monkeypatch):
    from backend.app.native import site_sync_schedule as schedule
    sql=MemorySQL()
    try:
        state={'preview_format':tasks.TASK_FORMAT,'execution':{'phase':'download'}}
        sql.db.execute('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',('t','ready',json.dumps(state),'2026-10-04T00:00:00.000Z'))
        async def forbidden(*a,**k):raise AssertionError('Scheduler loaded full state')
        async def tick(r,uid):return {'uid':uid,'execution':{'phase':'download','committed':False}}
        monkeypatch.setattr(tasks,'get',forbidden)
        monkeypatch.setattr(schedule.apply,'tick',tick)
        current={}
        asyncio.run(schedule.step(SimpleNamespace(sql=sql),{},current))
        assert current['task_uid']=='t'
        assert all('SELECT *' not in q for q,_ in sql.queries)
    finally:sql.db.close()


@pytest.mark.parametrize('state', [{'preview_format':tasks.TASK_FORMAT,'history_deleting':1},{'preview_format':0}])
def test_header_keeps_task_validation(state):
    sql=MemorySQL()
    try:
        sql.db.execute('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',('t','ready',json.dumps(state),'2026-10-04T00:00:00.000Z'))
        with pytest.raises(Error):asyncio.run(tasks.header(sql,'t'))
        with pytest.raises(Error):asyncio.run(tasks.header(sql,'missing'))
    finally:sql.db.close()
