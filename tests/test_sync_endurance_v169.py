"""Accelerated long-running recovery with real signed routes and D1/R2 doubles.

Only persisted waiting deadlines are advanced; business cursors, counters and
authorization remain untouched. This is not a live Cloudflare limit test.
"""
import asyncio,json
from collections import Counter
from datetime import datetime
from pathlib import Path
import pytest
from backend.app.native import site_sync_tasks as tasks,site_sync_work as work,site_sync_transport as transport
from backend.app.native import site_sync_schedule as schedule,site_sync_manual as manual,site_sync_gate as gate
from backend.app.native.catalog import Error,now
from tests.test_sync_platform_v131 import pair,local_pair
from tests.test_site_sync_v121 import seed_media
from tests.test_site_sync_v122 import peers

run=asyncio.run
PAST='2000-01-01T00:00:00.000Z'
class Terminated(BaseException):pass

def state(r,uid):return run(tasks.get(r.sql,uid))['state']
def grant(r,uid):return run(gate.load(r.sql,manual.PREFIX+uid))

class RecoveryRun:
 def __init__(self,monkeypatch):
  self.enabled=False;self.uid=None;self.label='';self.events=[];self.wait_seconds=0;self.ticks=0
  self.used=False;self.limits=Counter();original=tasks.persist
  async def persist(sql,task,*args,**kwargs):
   watching=self.enabled and task['uid']==self.uid and not self.used
   before=await work.position(sql,task['uid']) if watching else None
   result=await original(sql,task,*args,**kwargs)
   if watching:
    after=await work.position(sql,task['uid']);phase=after['execution_phase'] or after['phase']
    key=(self.uid,self.label,phase)
    if before['checkpoint']!=after['checkpoint'] and self.limits[key]<40:
     self.limits[key]+=1;self.used=True
     code=('1101','1102','terminated')[len(self.events)%3]
     self.events.append({'uid':self.uid,'label':self.label,'phase':phase,'code':code})
     if code=='terminated':raise Terminated()
     raise Error('injected Worker resource interruption',503,code)
   return result
  monkeypatch.setattr(tasks,'persist',persist)

 def expire_wait(self,r,uid):
  s=state(r,uid);v=grant(r,uid);w=s.get('work',{})
  deadlines=[w.get(k) for k in ('retry_after','recover_after','pace_after')]+[v.get('due')]
  seconds=[(datetime.fromisoformat(t)-datetime.fromisoformat(now())).total_seconds() for t in deadlines if t]
  self.wait_seconds+=max([0,*seconds])
  run(r.sql.batch([
   ("UPDATE sync_tasks SET state=json_set(state,'$.work.retry_after',?,'$.work.recover_after',?,'$.work.pace_after',?) WHERE uid=?",(PAST,PAST,PAST,uid)),
   ("UPDATE service_meta SET value=json_set(value,'$.due',?) WHERE key=?",(PAST,manual.PREFIX+uid)),
  ]))

 def drive(self,r,uid,label,until=None):
  self.uid=uid;self.label=label
  for _ in range(4000):
   v=grant(r,uid)
   if until(v) if until else not v.get('enabled'):
    if not until:assert v.get('finished'),v
    return v
   s=state(r,uid);w=s.get('work',{})
   assert not (w.get('status')=='paused' and w.get('retryable') is False),(label,w)
   if w.get('status')=='paused' and w.get('last_outcome')=='progress_after_error':assert w['retry_count']==0,w
   # Check actual gating before moving time forward, without replaying business work.
   if len(self.events)<4 and w.get('status') in ('running','paused'):
    assert run(gate.probe(r.sql)).get('skipped')
    before=run(work.position(r.sql,uid));run(schedule.tick(r,prune_history=False))
    assert run(work.position(r.sql,uid))==before
   self.expire_wait(r,uid);self.used=False;self.enabled=True
   try:run(schedule.tick(r,prune_history=False))
   except Terminated:pass
   finally:self.enabled=False
   self.ticks+=1
  pytest.fail(f'endurance did not finish: {label}, {state(r,uid)}')

def candidates(api,r,h,direction,scopes):
 uid=api('start',{'preview_mode':'brief','direction':direction,'scopes':scopes,'background':True})['uid']
 h.drive(r,uid,'preview')
 items=[];after=['','']
 while after is not None:
  page=api('get',{'uid':uid,'after':after});items+=page['items'];after=page.get('next')
 selected=[x['id'] for x in items if x['action']=='add']
 api('select',{'uid':uid,'ids':selected})
 child=api('prepare-preview',{'uid':uid,'background':True})['uid']
 h.drive(r,child,'prepare')
 assert not state(r,child).get('execution')
 return uid,child,selected

def test_pull_keeps_advancing_through_repeated_interruptions(pair,monkeypatch):
 api,_,r,remote,*_=pair
 rows=[(f'endurance-{i:02}','Student '+str(i)) for i in range(18)]
 run(remote.sql.batch([('INSERT INTO students(uid,name) VALUES(?,?)',row) for row in rows]))
 raw=Path('tests/fixtures/media/sample.jpg').read_bytes()+b'x'*70000
 seed_media(remote,'f'*32,'endurance.jpg',raw)
 before=run(r.sql.query('SELECT uid FROM students ORDER BY uid'))
 h=RecoveryRun(monkeypatch)
 parent,uid,selected=candidates(api,r,h,'pull',['students','media_assets'])
 assert run(r.sql.query('SELECT uid FROM students ORDER BY uid'))==before
 assert sum(e['uid']==parent for e in h.events)>30
 # Consent is recorded before logout; background must not depend on this session.
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站','background':True},drain=False)
 run(r.sql.batch([("UPDATE auth_sessions SET revoked_at=?,revoke_reason='logout'",(now(),))]))
 h.drive(r,uid,'execute')
 final=state(r,uid);assert final['execution']['phase']=='done'
 assert final['work']['total_failures']>30 and final['work']['retry_count']==0
 assert final['work']['no_progress_failures']==0
 assert run(r.media_store.get('endurance.jpg'))==raw
 expected=run(remote.sql.query('SELECT uid,name FROM students ORDER BY uid'))
 actual=run(r.sql.query('SELECT uid,name FROM students WHERE uid NOT IN ('+','.join('?' for _ in before)+') ORDER BY uid',tuple(v['uid'] for v in before)))
 assert actual==expected
 audits=run(r.sql.query("SELECT target_uid,count(*) n FROM operation_logs WHERE action='sync_record_add' GROUP BY target_uid"))
 assert len(audits)==len(selected) and all(v['n']==1 for v in audits)
 assert {e['code'] for e in h.events}=={'1101','1102','terminated'}
 assert {'download','write-record','cleanup'}<={e['phase'] for e in h.events}
 assert h.wait_seconds>3600 and h.ticks>100
 if r.kind=='r2':assert final['work']['resource_level']==2
 if r.kind=='local':assert not list(r.cache_store.root.glob('site-sync/**/*.bin'))
 else:assert not any(k.startswith('cache/site-sync/') for k in r.cache_store.bucket.objects)
 assert run(schedule.tick(r,prune_history=False))=={'skipped':'disabled'}

def test_push_recovery_never_reapproves_or_resubmits_accepted_proposal(peers,monkeypatch):
 api,b,_,_,r,remote,*_=peers
 h=RecoveryRun(monkeypatch)
 _,uid,selected=candidates(api,r,h,'push',['students'])
 network=transport.post;submissions=[]
 async def lose_accepted_reply(kind,url,data):
  result=await network(kind,url,data)
  if data['payload']['op']=='proposal-submit':
   submissions.append(data['payload']['request_id'])
   if len(submissions)<=4:raise Error('accepted reply lost',503,'1102')
  return result
 monkeypatch.setattr(transport,'post',lose_accepted_reply)
 assert api('proposal-send',{'uid':uid,'background':True},drain=False,ok=False).status_code==503
 h.drive(r,uid,'send',lambda v:v.get('mode')=='receipt')
 proposal=b('proposal-inbox')['proposal'];request=proposal['request_id']
 assert len(submissions)==5 and set(submissions)=={request}
 before=run(remote.sql.query('SELECT uid,name FROM students ORDER BY uid'))
 async def no_resend(*args,**kwargs):raise AssertionError('accepted proposal must not be sent again')
 monkeypatch.setattr(manual.proposals,'send',no_resend)
 for _ in range(35):
  h.expire_wait(r,uid);assert run(schedule.tick(r,prune_history=False))['status']=='ok'
 assert b('proposal-inbox')['proposal']['status']=='pending'
 assert run(remote.sql.query('SELECT uid,name FROM students ORDER BY uid'))==before
 review=b('proposal-review',{'request_id':request,'background':True})['uid']
 h.drive(remote,review,'review')
 assert state(remote,review)['approval']['ready']
 assert run(remote.sql.query('SELECT uid,name FROM students ORDER BY uid'))==before
 b('proposal-approve',{'uid':review,'confirmation':'同意对端推送','background':True})
 h.drive(remote,review,'approved-execute')
 h.drive(r,uid,'receipt')
 assert grant(r,uid)['receipt']['phase']=='done'
 assert grant(r,uid)['receipt']['request_id']==request
 assert b('proposal-inbox')['proposal']['request_id']==request
 audits=run(remote.sql.query("SELECT target_uid,count(*) n FROM operation_logs WHERE action='sync_record_add' GROUP BY target_uid"))
 assert len(audits)==len(selected) and all(v['n']==1 for v in audits)

