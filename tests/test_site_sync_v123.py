"""Real SQLite/files, signed two-site HTTP and durable background grant acceptance."""
import asyncio,json
import pytest
from tests.test_site_sync_v121 import pair,seed_media
from tests.test_site_sync_v122 import peers
from backend.app.native import site_sync_schedule as scheduler,site_sync_tasks as tasks,site_sync as core
from backend.app.native.catalog import now,Error
run=asyncio.run

def enable(api,auto=False,scopes=None):
 current=api('schedule-status')
 return api('schedule-save',{'revision':current.get('revision'),'enabled':True,'auto_pull':auto,'interval':5,'scopes':scopes or ['students'],'confirmation':scheduler.CONFIRM})

def drive(r,limit=800):
 for _ in range(limit):
  result=run(scheduler.tick(r))
  assert result.get('status')!='paused',result
  state=run(scheduler.load(r.sql,scheduler.STATE))
  if state.get('last_finished'):return state
 pytest.fail('Background sync failed to finish')

def test_unattended_pull_after_logout_and_repeat_noop(pair):
 api,preview,ra,rb,a,*_=pair
 enable(api,True)
 # No auth session, CSRF token or browser driving the sync from here on.
 run(ra.sql.batch([("UPDATE auth_sessions SET revoked_at=?,revoke_reason='logout'",(now(),))]))
 drive(ra)
 assert run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))==run(rb.sql.query('SELECT uid FROM students ORDER BY uid'))
 assert len(run(ra.sql.query("SELECT uid FROM operation_logs WHERE action='sync_pull_commit'")))==1
 assert run(scheduler.tick(ra)).get('skipped')=='interval'
 state=run(scheduler.load(ra.sql,scheduler.STATE));state.pop('last_finished',None);state['next_due']=''
 run(ra.sql.batch([scheduler.put(scheduler.STATE,state)]));drive(ra)
 assert len(run(ra.sql.query("SELECT uid FROM operation_logs WHERE action='sync_pull_commit'")))==1
 assert run(scheduler.load(ra.sql,scheduler.STATE))['message']=='无差异'

def test_only_approved_jobs_no_implicit_preview_execution(peers):
 api,b,preview,review,ra,rb,*_=peers
 enable(b)
 uid=preview(['students'],lambda x:x['action']=='add',direction='push')
 api('proposal-send',{'uid':uid});proposal=b('proposal-inbox')['proposal'];before=run(core.revision(rb.sql))
 for _ in range(3):run(scheduler.tick(rb))
 assert run(core.revision(rb.sql))==before
 assert b('proposal-inbox')['proposal']['status']=='pending'
 job=review(proposal['request_id']);run(scheduler.tick(rb))
 assert run(core.revision(rb.sql))==before
 b('proposal-approve',{'uid':job['uid'],'confirmation':'同意对端推送'})
 run(rb.sql.batch([("UPDATE auth_sessions SET revoked_at=?,revoke_reason='logout'",(now(),))]))
 drive(rb)
 assert len(run(rb.sql.query('SELECT uid FROM students')))==6
 assert api('proposal-status',{'uid':uid})['outgoing']['phase']=='done'

def test_revocable_grant_inside_transaction(pair):
 api,_,ra,*_=pair
 enable(api,True)
 policy=run(scheduler.load(ra.sql));r=run(scheduler.context(ra,policy))
 # A cached principal cannot commit after its real role or saved policy changes.
 run(ra.sql.batch([("UPDATE auth_roles SET is_active=0 WHERE uid=?",(r.p['role_uid'],))]))
 gid,guard=r.auth.guard(r.p,'students','edit')
 with pytest.raises(Exception):run(ra.sql.batch([guard,("DELETE FROM students",())]))
 assert len(run(ra.sql.query('SELECT uid FROM students')))==3
 assert run(scheduler.tick(ra))['status']=='paused'
 assert not run(ra.sql.query('SELECT uid FROM sync_tasks'))


def test_policy_disable_peer_change_and_stale_form(pair):
 api,_,ra,*_=pair
 policy=enable(api,True)
 assert api('schedule-save',{'revision':'old','interval':5},ok=False).status_code==409
 policy=api('schedule-save',{'revision':policy['revision'],'enabled':False,'interval':5})
 assert run(scheduler.tick(ra))=={'skipped':'disabled'}
 enable(api,True)
 api('save',{'origin':'https://b.example.org','secret':'s'*64,'enabled':True})
 assert run(scheduler.tick(ra))['status']=='paused'
 assert not run(ra.sql.query('SELECT uid FROM sync_tasks'))

def test_media_dependency_order_in_background(pair):
 from pathlib import Path
 api,_,ra,rb,*_=pair
 raw=Path('tests/fixtures/media/sample.jpg').read_bytes();old='a'*32;new='b'*32
 seed_media(ra,old,'old.jpg',raw);seed_media(rb,new,'new.jpg',raw)
 for r,key in ((ra,'old.jpg'),(rb,'new.jpg')):
  run(r.sql.batch([("INSERT INTO profiles(uid,name,avatar_key) VALUES('same-teacher','Teacher',?)",(key,))]))
 enable(api,True,['profiles']);drive(ra)
 assert run(ra.sql.query("SELECT avatar_key FROM profiles WHERE uid='same-teacher'"))[0]['avatar_key']=='new.jpg'
 assert run(ra.media_store.get('old.jpg'))==raw and run(ra.media_store.get('new.jpg'))==raw
 # Scope did not silently expand to unrelated student differences.
 assert len(run(ra.sql.query('SELECT uid FROM students')))==3

def test_failure_pauses_execution_until_manual_retry(pair,monkeypatch):
 api,preview,ra,rb,*_=pair
 uid=preview(['students'],lambda x:x['action']=='add')
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'});enable(api)
 original=scheduler.apply.download
 async def fail(*args):raise Error('temporary unavailable',502)
 monkeypatch.setattr(scheduler.apply,'download',fail)
 assert run(scheduler.tick(ra))['status']=='paused'
 state=run(scheduler.load(ra.sql,scheduler.STATE));state.pop('retry_after',None)
 run(ra.sql.batch([scheduler.put(scheduler.STATE,state)]))
 monkeypatch.setattr(scheduler.apply,'download',original)
 result=run(scheduler.tick(ra));assert '暂停' in result['message']
 api('pull-tick',{'uid':uid});drive(ra)
 assert len(run(ra.sql.query('SELECT uid FROM students')))==6


def test_busy_and_local_lifespan_shutdown(pair,monkeypatch):
 from fastapi import FastAPI
 api,_,ra,*_=pair
 enable(api,True)
 run(ra.sql.batch([("INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES('site-sync:run','media_assets','test',?,?)",(now(),now()))]))
 assert run(scheduler.tick(ra))=={'skipped':'busy'}
 assert not run(ra.sql.query('SELECT uid FROM sync_tasks'))
 calls=[]
 async def tick(base):calls.append(base);return {}
 monkeypatch.setattr(scheduler,'tick',tick)
 app=FastAPI();scheduler.install_local(app,ra,interval=0.01)
 async def life():
  async with app.router.lifespan_context(app):await asyncio.sleep(.03)
  count=len(calls);await asyncio.sleep(.03);assert len(calls)==count
 run(life());assert calls and all(x is ra for x in calls)


def test_d1_adapter_background_transaction_path(pair):
 """Exercise D1SQL's real binding API/batch limits with a disposable SQLite binding double."""
 from backend.app.adapters.d1.sql import D1SQL
 api,_,ra,rb,*_=pair
 enable(api,True)
 sql=ra.sql
 class Statement:
  def __init__(self,text,args=()):self.text=text;self.args=args
  def bind(self,*args):return Statement(self.text,args)
  async def all(self):return {'results':await sql.query(self.text,self.args)}
 class Binding:
  def prepare(self,text):return Statement(text)
  async def batch(self,statements):
   return [{'results':rows} for rows in await sql.restore_batch([(x.text,x.args) for x in statements])]
 ra.sql=D1SQL(Binding());drive(ra)
 assert run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))==run(rb.sql.query('SELECT uid FROM students ORDER BY uid'))


def test_password_or_policy_change_revokes_cached_background_guard(pair):
 api,_,ra,*_=pair
 enable(api,True)
 p=run(scheduler.load(ra.sql));r=run(scheduler.context(ra,p))
 # Even within one tick, turning off the policy prevents the next protected write.
 off=dict(p,enabled=False,revision='changed')
 run(ra.sql.batch([scheduler.put(scheduler.KEY,off)]))
 gid,guard=r.auth.guard(r.p,'students','delete')
 with pytest.raises(Exception):run(ra.sql.batch([guard,('DELETE FROM students',())]))
 assert len(run(ra.sql.query('SELECT uid FROM students')))==3
 run(ra.sql.batch([scheduler.put(scheduler.KEY,p),("UPDATE auth_users SET updated_at=? WHERE uid=?",(now(seconds=1),p['owner']['uid']))]))
 assert run(scheduler.tick(ra))['status']=='paused'


def test_schedule_requires_explicit_consent_and_scope(pair):
 api,_,ra,*_=pair
 before=run(core.revision(ra.sql))
 data={'enabled':True,'auto_pull':True,'interval':5,'scopes':['students']}
 assert api('schedule-save',data,ok=False).status_code==422
 data['confirmation']=scheduler.CONFIRM;data['scopes']=['auth_users']
 assert api('schedule-save',data,ok=False).status_code==422
 assert run(core.revision(ra.sql))==before
 assert not run(scheduler.load(ra.sql))
