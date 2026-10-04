"""Durable checkpoint and task exclusion tests; no remote cloud resources."""
import asyncio
import pytest
from tests.test_site_sync_v121 import pair
from tests.test_site_sync_v123 import enable
from backend.app.native import site_sync as core,site_sync_tasks as tasks,site_sync_schedule as schedule
from backend.app.native import site_sync_work as work
from backend.app.native.catalog import Error
run=asyncio.run

def start(api):return api('start',{'direction':'pull','scopes':['students']})['uid']

def test_shared_policy_is_persisted_and_used_for_pages(pair):
 api,_,ra,rb,*_=pair
 uid=start(api);s=run(tasks.get(ra.sql,uid))['state']
 assert s['policy']==work.policy() and s['preview_format']==work.TASK_FORMAT
 assert s['policy']['content_rows']==5 and s['policy']['request_interval_ms']==1000
 for i in range(9):run(rb.sql.batch([('INSERT INTO students(uid,name) VALUES(?,?)',(f'low-{i}','student'))]))
 for r in (ra,rb):
  page=run(core.page(r.sql,'students'))
  assert len(page['rows'])<=5
 assert api('test')['policy']==s['policy']


def test_failed_page_keeps_cursor_and_retry_records_completion(pair,monkeypatch):
 api,_,ra,*_=pair;uid=start(api);original=core.revision_page
 async def failed(*a):raise Error('连接暂时失败',502,'sync_timeout')
 monkeypatch.setattr(core,'revision_page',failed)
 assert api('advance',{'uid':uid},ok=False).status_code==502
 s=run(tasks.get(ra.sql,uid))['state']
 assert s['table_index']==0 and s['work']['status']=='paused' and s['work']['completed_steps']==0
 assert s['work']['error_code']=='sync_timeout'
 monkeypatch.setattr(core,'revision_page',original)
 result=api('advance',{'uid':uid});s=run(tasks.get(ra.sql,uid))['state']
 assert s['table_index']==1 and s['work']['attempt']==2
 assert s['work']['completed_steps']==1 and s['work']['status']=='saved' and 'error' not in s['work']
 assert result['work']==api('get',{'uid':uid})['work']


def test_browser_and_background_cannot_advance_same_task_together(pair,monkeypatch):
 api,_,ra,*_=pair;uid=start(api);original=core.revision_page
 enable(api);r=run(schedule.context(ra,run(schedule.load(ra.sql))))
 async def exercise():
  entered=asyncio.Event();release=asyncio.Event()
  async def slow(*args):entered.set();await release.wait();return await original(*args)
  monkeypatch.setattr(core,'revision_page',slow)
  first=asyncio.create_task(tasks.advance(r,uid));await asyncio.wait_for(entered.wait(),2)
  try:
   with pytest.raises(Error):await tasks.advance(r,uid)
  finally:release.set();await first
 run(exercise())
 s=run(tasks.get(ra.sql,uid))['state']
 assert s['table_index']==1 and s['work']['attempt']==1 and s['work']['completed_steps']==1
 assert not run(ra.sql.query('SELECT uid FROM admin_mutation_guards WHERE uid=?',(work.lock_key(uid),)))


def test_interrupted_attempt_keeps_last_start_and_can_continue(pair,monkeypatch):
 api,_,ra,*_=pair;uid=start(api);original=core.revision_page
 enable(api);r=run(schedule.context(ra,run(schedule.load(ra.sql))))
 async def interrupted(*args):raise asyncio.CancelledError()
 monkeypatch.setattr(core,'revision_page',interrupted)
 with pytest.raises(asyncio.CancelledError):run(tasks.advance(r,uid))
 s=run(tasks.get(ra.sql,uid))['state']
 assert s['work']['status']=='running' and s['table_index']==0
 monkeypatch.setattr(core,'revision_page',original)
 api('advance',{'uid':uid})
 assert run(tasks.get(ra.sql,uid))['state']['table_index']==1


def test_scheduler_retains_failed_preview_instead_of_restarting(pair,monkeypatch):
 from backend.app.native import site_sync_preview as brief
 api,_,ra,*_=pair;enable(api,True,['students']);run(schedule.tick(ra))
 uid=run(schedule.load(ra.sql,schedule.STATE))['preview_uid'];original=brief.page
 async def failed(*a):raise Error('temporary timeout',502,'sync_timeout')
 monkeypatch.setattr(brief,'page',failed)
 assert run(schedule.tick(ra))['status']=='paused'
 assert run(schedule.load(ra.sql,schedule.STATE))['preview_uid']==uid
 monkeypatch.setattr(brief,'page',original)
 api('advance',{'uid':uid})
 assert run(tasks.get(ra.sql,uid))['state']['work']['status']=='saved'
