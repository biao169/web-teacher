"""Manual grants survive logout and resource loss without recurring policy."""
import asyncio,json
import pytest
from backend.app.native import site_sync_manual as manual,site_sync_schedule as schedule,site_sync_tasks as tasks,site_sync_gate as gate
from backend.app.native.catalog import now,Error
from tests.test_site_sync_v121 import pair
from tests.test_site_sync_v122 import peers
run=asyncio.run

def saved(r,uid):return run(schedule.load(r.sql,manual.PREFIX+uid))
def task_state(r,uid):return run(tasks.get(r.sql,uid))['state']
def drive(r,uid,until=None):
 for _ in range(1000):
  result=run(schedule.tick(r,prune_history=False))
  assert result.get('status')!='paused',result
  value=saved(r,uid)
  if until(value) if until else not value.get('enabled'):return value
 pytest.fail('manual continuation did not reach target')

def test_read_without_recurring_policy_stops_for_confirmation_after_logout(pair):
 api,_,r,*_=pair
 uid=api('start',{'background':True,'direction':'pull','scopes':['students']})['uid']
 assert saved(r,uid)['mode']=='read' and run(gate.probe(r.sql))=={}
 run(r.sql.batch([("UPDATE auth_sessions SET revoked_at=?,revoke_reason='logout'",(now(),))]))
 value=drive(r,uid)
 assert value['finished'] and '人工' in value['message']
 assert task_state(r,uid).get('execution') is None
 assert len(run(r.sql.query('SELECT uid FROM students')))==3
 assert not run(schedule.load(r.sql)).get('enabled')


def test_confirmed_pull_resumes_after_logout_without_schedule(pair):
 api,preview,r,*_=pair
 uid=preview(['students'],lambda x:x['action']=='add')
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站','background':True},drain=False)
 run(r.sql.batch([("UPDATE auth_sessions SET revoked_at=?,revoke_reason='logout'",(now(),))]))
 value=drive(r,uid)
 assert value['finished'] and task_state(r,uid)['execution']['phase']=='done'
 assert len(run(r.sql.query('SELECT uid FROM students')))==6
 count=len(run(r.sql.query('SELECT uid FROM sync_tasks')))
 assert run(schedule.tick(r,prune_history=False))=={'skipped':'disabled'}
 assert len(run(r.sql.query('SELECT uid FROM sync_tasks')))==count


def test_wrong_confirmation_cannot_create_write_grant(pair):
 api,preview,r,*_=pair;uid=preview(['students'],lambda x:x['action']=='add')
 result=api('pull-begin',{'uid':uid,'confirmation':'wrong','background':True},ok=False)
 assert result.status_code==422 and not saved(r,uid)


def test_prepare_child_is_atomically_registered_for_read_only(pair):
 api,_,r,*_=pair
 uid=api('start',{'background':True,'preview_mode':'brief','direction':'pull','scopes':['students']})['uid']
 drive(r,uid)
 rows=api('get',{'uid':uid})['items'];api('select',{'uid':uid,'ids':[x['id'] for x in rows if x['action']=='add']})
 child=api('prepare-preview',{'uid':uid,'background':True})['uid']
 assert saved(r,child)['mode']=='read'
 drive(r,child)
 assert task_state(r,child).get('execution') is None
 assert task_state(r,child)['prepared']


def test_push_sends_once_then_waits_for_human_approval(peers,monkeypatch):
 api,b,preview,review,r,remote,*_=peers
 uid=preview(['students'],lambda x:x['action']=='add',direction='push')
 api('proposal-send',{'uid':uid,'background':True},drain=False)
 value=drive(r,uid,lambda v:v.get('mode')=='receipt')
 proposal=b('proposal-inbox')['proposal'];request=proposal['request_id']
 assert proposal['status']=='pending' and len(run(remote.sql.query('SELECT uid FROM students')))==3
 async def forbidden(*a,**kw):raise AssertionError('must not resend accepted proposal')
 monkeypatch.setattr(manual.proposals,'send',forbidden)
 value['due']='';run(r.sql.batch([manual.put(manual.PREFIX+uid,value)]))
 assert run(schedule.tick(r,prune_history=False))['status']=='ok'
 assert saved(r,uid)['receipt']['request_id']==request
 assert b('proposal-inbox')['proposal']['status']=='pending'


def test_approved_push_executes_on_receiving_site_without_schedule(peers):
 api,b,preview,review,r,remote,*_=peers
 uid=preview(['students'],lambda x:x['action']=='add',direction='push')
 api('proposal-send',{'uid':uid});proposal=b('proposal-inbox')['proposal']
 job=review(proposal['request_id'])
 b('proposal-approve',{'uid':job['uid'],'confirmation':'同意对端推送','background':True})
 drive(remote,job['uid'])
 assert len(run(remote.sql.query('SELECT uid FROM students')))==6
 assert api('proposal-status',{'uid':uid})['outgoing']['phase']=='done'


def test_pause_and_revoke_prevent_cached_background_writes(pair):
 api,_,r,*_=pair
 uid=api('start',{'direction':'pull','scopes':['students'],'background':True})['uid']
 old=saved(r,uid);context=run(schedule.context(r,old,policy_key=manual.PREFIX+uid))
 api('manual-pause',{'uid':uid})
 gid,guard=context.auth.guard(context.p,'students','delete')
 with pytest.raises(Exception):run(r.sql.batch([guard,('DELETE FROM students',())]))
 assert len(run(r.sql.query('SELECT uid FROM students')))==3
 assert run(schedule.tick(r,prune_history=False))=={'skipped':'disabled'}
 api('resume',{'uid':uid,'background':True});assert saved(r,uid)['enabled']


def test_changed_selection_invalidates_confirmation(pair):
 api,preview,r,*_=pair;uid=preview(['students'],lambda x:x['action']=='add')
 # Register a confirmed action but do not run its business operation yet.
 from tests.test_site_sync_v123 import enable
 enable(api)
 foreground=run(schedule.context(r,run(schedule.load(r.sql))))
 run(manual.enroll(foreground,uid,'pull'))
 run(r.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.selection.selected',json('[]')) WHERE uid=?",(uid,))]))
 result=run(schedule.tick(r,prune_history=False))
 assert result['status']=='paused' and not saved(r,uid)['enabled']
 assert api('resume',{'uid':uid,'background':True},ok=False).status_code==409
 assert not saved(r,uid)['enabled']
 assert task_state(r,uid).get('execution') is None

@pytest.mark.parametrize('forced',[False,True])
def test_manual_worker_interrupt_recovers_from_progress(pair,monkeypatch,forced):
 from backend.app.native import site_sync_work as work
 api,_,r,*_=pair
 uid=api('start',{'direction':'pull','scopes':['students'],'background':True})['uid']
 original=tasks.advance
 class Terminated(BaseException):pass
 @work.step('advance')
 async def interrupted(resource,task_uid):
  await resource.sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.count',1) WHERE uid=?",(task_uid,))])
  if forced:raise Terminated()
  raise Error('Worker limit',503,'1102')
 monkeypatch.setattr(tasks,'advance',interrupted)
 if forced:
  with pytest.raises(Terminated):run(schedule.tick(r,prune_history=False))
 else:assert run(schedule.tick(r,prune_history=False))['status']=='paused'
 state=task_state(r,uid)
 assert state['count']==1
 assert run(gate.probe(r.sql)).get('skipped')=='interval'
 def due():
  value=saved(r,uid);value['due']=''
  run(r.sql.batch([manual.put(manual.PREFIX+uid,value),("UPDATE sync_tasks SET state=json_set(state,'$.work.retry_after','2000-01-01T00:00:00Z','$.work.recover_after','2000-01-01T00:00:00Z') WHERE uid=?",(uid,))]))
 due()
 if forced:
  assert run(schedule.tick(r,prune_history=False))['status']=='ok'
  assert task_state(r,uid)['work']['retry_count']==0
  due()
 monkeypatch.setattr(tasks,'advance',original)
 assert drive(r,uid)['finished']
 assert task_state(r,uid)['work']['failures_with_progress']==1


def test_pause_parent_also_pauses_preparation_child(pair):
 api,_,r,*_=pair
 uid=api('start',{'background':True,'preview_mode':'brief','direction':'pull','scopes':['students']})['uid']
 drive(r,uid);rows=api('get',{'uid':uid})['items']
 api('select',{'uid':uid,'ids':[x['id'] for x in rows if x['action']=='add']})
 child=api('prepare-preview',{'uid':uid,'background':True})['uid']
 api('manual-pause',{'uid':uid})
 assert not saved(r,child)['enabled'] and saved(r,child)['paused_by_user']


def test_role_revocation_stops_manual_grant(pair):
 api,_,r,*_=pair
 uid=api('start',{'background':True,'direction':'pull','scopes':['students']})['uid']
 owner=saved(r,uid)['owner']
 run(r.sql.batch([('UPDATE auth_roles SET is_active=0 WHERE uid=?',(owner['role_uid'],))]))
 assert run(schedule.tick(r,prune_history=False))['status']=='paused'
 assert not saved(r,uid)['enabled']
 assert task_state(r,uid).get('execution') is None


def test_creation_response_loss_keeps_task_and_grant_together(pair,monkeypatch):
 api,_,r,*_=pair
 original=r.sql.batch
 class Terminated(BaseException):pass
 lost=False
 async def commit_then_lose(statements):
  nonlocal lost
  result=await original(statements)
  if not lost and any('INSERT INTO sync_tasks(' in sql for sql,args in statements):
   lost=True;raise Terminated()
  return result
 monkeypatch.setattr(r.sql,'batch',commit_then_lose)
 with pytest.raises((Terminated,BaseExceptionGroup)) as raised:api('start',{'direction':'pull','scopes':['students'],'background':True})
 if isinstance(raised.value,BaseExceptionGroup):assert raised.value.subgroup(Terminated) is not None
 monkeypatch.setattr(r.sql,'batch',original)
 rows=run(r.sql.query('SELECT uid FROM sync_tasks'));assert len(rows)==1
 uid=rows[0]['uid'];assert saved(r,uid)['enabled']
 assert drive(r,uid)['finished']


def test_cancel_grant_only_cleans_up_even_after_permanent_pause(pair):
 api,preview,r,*_=pair
 uid=preview(['students'],lambda x:x['action']=='add')
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站','background':True})
 value=saved(r,uid);value.update(mode='cancel',due='')
 run(r.sql.batch([manual.put(manual.PREFIX+uid,value),("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?)) WHERE uid=?",(json.dumps({'operation':'execute','status':'paused','retryable':False}),uid))]))
 drive(r,uid)
 assert task_state(r,uid)['execution']['phase']=='cancelled'
 assert len(run(r.sql.query('SELECT uid FROM students')))==3
