"""Durable retry bounds, explicit restart and preserved approval/commit boundaries."""
import asyncio,json
import pytest
from tests.test_site_sync_v121 import pair,finish
from tests.test_site_sync_v123 import enable
from backend.app.native import site_sync_tasks as tasks,site_sync_schedule as scheduler,site_sync_apply as apply,site_sync_work as work
from backend.app.native.catalog import Error
run=asyncio.run


def test_restart_is_atomic_idempotent_and_has_no_inherited_selection(pair):
 api,preview,ra,rb,*_=pair
 uid=preview(['students'],lambda i:i['action']=='add')
 before=run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))
 fresh=api('restart',{'uid':uid})
 assert fresh['uid']!=uid and fresh['status']=='reading'
 assert api('restart',{'uid':uid})['uid']==fresh['uid']
 old=run(tasks.get(ra.sql,uid));new=run(tasks.get(ra.sql,fresh['uid']))
 assert old['status']=='expired' and old['state']['restart_uid']==new['uid']
 assert new['state']['scopes']==['students'] and new['state']['direction']=='pull'
 assert 'execution' not in new['state'] and not new['state'].get('selection')
 assert run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))==before
 assert api('resume',{'uid':uid},ok=False).status_code==409


def test_active_execution_must_finish_cancel_before_restart(pair):
 api,preview,ra,*_=pair
 uid=preview(['students'],lambda i:i['action']=='add')
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'})
 assert api('restart',{'uid':uid},ok=False).status_code==409
 api('pull-cancel',{'uid':uid});finish(api,uid)
 fresh=api('restart',{'uid':uid})
 assert fresh['uid']!=uid
 assert len(run(ra.sql.query('SELECT uid FROM students')))==3


def test_approval_restart_cannot_inherit_consent(pair):
 api,preview,ra,*_=pair
 uid=preview(['students'])
 run(ra.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.approval',json(?)) WHERE uid=?",(json.dumps({'request_id':'a'*32,'ready':True}),uid))]))
 assert api('restart',{'uid':uid},ok=False).status_code==409
 assert not run(tasks.get(ra.sql,uid))['state'].get('restart_uid')


def test_scheduler_retries_same_step_at_most_three_times_then_manual_resume(pair,monkeypatch):
 api,preview,ra,*_=pair
 uid=preview(['students'],lambda i:i['action']=='add')
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'});enable(api)
 original=apply.download;calls=[]
 async def fail(*args):calls.append(1);raise Error('temporary network failure',502,'sync_timeout')
 monkeypatch.setattr(apply,'download',fail)
 for count in range(1,5):
  result=run(scheduler.tick(ra));assert result['status']=='paused'
  job=run(tasks.get(ra.sql,uid));w=job['state']['work']
  assert w['retry_count']==count and w['retryable']==(count<=3)
  assert not job['state']['execution']['committed']
  if count<=3:
   assert run(scheduler.tick(ra))=={'skipped':'interval'}
  # Simulate elapsed time, without sleeping or creating a new task.
  state=run(scheduler.load(ra.sql,scheduler.STATE));state.pop('retry_after',None)
  run(ra.sql.batch([scheduler.put(scheduler.STATE,state),("UPDATE sync_tasks SET state=json_set(state,'$.work.retry_after','2000-01-01T00:00:00.000Z') WHERE uid=?",(uid,))]))
 run(scheduler.tick(ra));assert len(calls)==4
 monkeypatch.setattr(apply,'download',original)
 result=api('resume',{'uid':uid})
 assert result['policy']['content_rows']==1 and result['policy']['version_rows']==5
 finish(api,uid)
 assert len(run(ra.sql.query('SELECT uid FROM students')))==6
 assert not run(tasks.get(ra.sql,uid))['state']['work'].get('retry_count')


@pytest.mark.parametrize('code',['sync_signature','sync_certificate','sync_conflict','sync_quota','sync_query_limit','sync_sql',None])
def test_permanent_errors_are_not_retryable(code):
 assert not work.retry_state(Error('review required',409,code),{})['retryable']


def test_restart_response_lost_returns_same_new_preview(pair,monkeypatch):
 api,preview,ra,*_=pair
 uid=preview(['students']);original=ra.sql.batch;lost=False
 async def interrupted(statements):
  nonlocal lost
  result=await original(statements)
  if not lost and any(sql.startswith('INSERT INTO sync_tasks(') for sql,_ in statements):
   lost=True;raise Error('response lost',502,'sync_network')
  return result
 monkeypatch.setattr(ra.sql,'batch',interrupted)
 assert api('restart',{'uid':uid},ok=False).status_code==502
 next_uid=run(tasks.get(ra.sql,uid))['state']['restart_uid']
 assert api('restart',{'uid':uid})['uid']==next_uid
 assert len(run(ra.sql.query('SELECT uid FROM sync_tasks')))==2


def test_repeated_unconfirmed_runtime_exit_stops_background_until_resume(pair,monkeypatch):
 api,preview,ra,*_=pair
 uid=preview(['students'],lambda i:i['action']=='add')
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'});enable(api)
 run(ra.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work.status','running','$.work.retry_count',3) WHERE uid=?",(uid,))]))
 result=api('pull-tick',{'uid':uid},ok=False,drain=False)
 assert result.status_code==409 and result.json()['code']=='sync_unconfirmed'
 saved=run(tasks.get(ra.sql,uid))['state']['work']
 assert saved['status']=='paused' and not saved['retryable']
 async def forbidden(*args):pytest.fail('background replayed exhausted runtime failure')
 monkeypatch.setattr(apply,'tick',forbidden)
 run(scheduler.tick(ra))
 assert run(tasks.get(ra.sql,uid))['state']['work']==saved
 api('resume',{'uid':uid})
 assert run(tasks.get(ra.sql,uid))['state']['work']['status']=='saved'
