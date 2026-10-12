"""Successful tagged responses and transaction ordering with real disposable SQLite."""
import pytest,sqlite3
from test_translation_regression import fixture,source,run
from backend.app.native.public_cache_tags import CommittedChanges,record_commit,change_plan,statements_plan,record_tag,validate_payload
from backend.app.native.catalog import Error
from backend.app.adapters.d1.sql import D1SQL

@pytest.mark.parametrize('path,expected',[('/zh','public-home'),('/en/profiles','public-profiles'),('/zh/projects','public-projects'),('/en/publications','public-publications'),('/api/public/data/zh/students','public-students')])
def test_success_tagged_only_and_conditional(fixture,path,expected):
 c,r=fixture;response=c.get(path);assert response.status_code==200
 tags=set(response.headers['cache-tag'].split(','));assert expected in tags
 assert 'public-translations' in tags and 'public-media' in tags
 condition=c.get(path,headers={'If-None-Match':response.headers['etag']});assert condition.status_code==304 and condition.headers['cache-tag']==response.headers['cache-tag']
 assert c.head(path).headers['cache-tag']==response.headers['cache-tag']

def test_detail_tag_and_dynamic_exclusion(fixture):
 c,r=fixture;row=source(r,'profiles','title','Professor');tag=record_tag('profiles',row['uid'])
 assert tag in c.get('/zh/profiles/'+row['uid']).headers['cache-tag']
 for path in ('/admin/profiles','/api/public/session-summary','/zh/profiles?size=10','/zh/profiles/MISSING','/api/public/data/zh/profiles?q=x'):
  assert 'cache-tag' not in c.get(path).headers

def test_real_content_mutation_after_commit_and_rollback(fixture):
 c,r=fixture;observed=[];original=r.sql.on_public_commit
 async def notified(statements):
  observed.append((await r.sql.query('SELECT name FROM profiles'),statements_plan(statements)))
 r.sql.on_public_commit=notified
 row=source(r,'profiles','title','教授');assert len(observed)==1 and any(item['name']==row['name'] for item in observed[0][0])
 observed.clear();run(r.content.save('profiles',r.p,{'organization':'单位'},row['uid'],row['updated_at']))
 assert len(observed)==1 and 'public-profiles' in observed[0][1].invalidate and not observed[0][1].purge
 with pytest.raises((Error,sqlite3.IntegrityError)):run(r.content.save('profiles',r.p,{'name':'ROLLED_BACK'},row['uid'],row['updated_at']))
 assert len(observed)==1
 r.sql.on_public_commit=original

def test_visibility_contact_delete_and_private_only_plan(fixture):
 c,r=fixture;row=source(r,'profiles','title','Public',contact_visibility='public',email='public@example.test')
 r.sql.on_public_commit=record_commit
 with CommittedChanges() as changes:run(r.content.save('profiles',r.p,{'contact_visibility':'hidden'},row['uid'],row['updated_at']))
 assert 'public-profiles' in changes.plan.purge and 'public-home' in changes.plan.purge
 row=run(r.content.get('profiles',row['uid'],r.p))
 with CommittedChanges() as changes:run(r.content.save('profiles',r.p,{'visibility':'hidden'},row['uid'],row['updated_at']))
 assert {'public-profiles','public-translations'}<=changes.plan.purge
 row=run(r.content.get('profiles',row['uid'],r.p))
 with CommittedChanges() as changes:run(r.content.delete('profiles',r.p,row['uid'],row['updated_at']))
 assert record_tag('profiles',row['uid']) in changes.plan.purge
 assert not change_plan('projects','u',{'visibility':'public','principal':'old','members':None,'amount':None},{'visibility':'public','principal':'new','members':None,'amount':None})

def test_nonpublic_changes_and_fallback_bulk_dependencies():
 assert not change_plan('profiles','u',{'visibility':'hidden','name':'A'},{'visibility':'hidden','name':'B'})
 result=statements_plan([('UPDATE "projects" SET sort_order=? WHERE uid=?',(2,'p')),('DELETE FROM "projects" WHERE uid=?',('p',))])
 assert 'public-projects' in result.purge and 'public-projects' not in result.invalidate
 assert statements_plan([('UPDATE media_assets SET status=? WHERE uid=?',('trash','u'))]).purge=={'public-media'}
 assert statements_plan([('INSERT INTO publications (uid) SELECT value FROM json_each(?) ON CONFLICT(uid) DO UPDATE SET visibility=excluded.visibility',('[]',))]).purge
 assert not statements_plan([('UPDATE auth_users SET username=? WHERE uid=?',('u','u'))])
 assert statements_plan([('UPDATE translation_cache SET is_current=0 WHERE uid=?',('u',))]).invalidate=={'public-translations'}

def test_callback_failure_never_turns_committed_write_into_failure(fixture):
 c,r=fixture
 async def failing(statements):raise RuntimeError('notification unavailable')
 r.sql.on_public_commit=failing
 row=source(r,'profiles','title','Saved');assert run(r.sql.query('SELECT uid FROM profiles WHERE uid=?',(row['uid'],)))

@pytest.mark.parametrize('value',[{'purgeEverything':True},{'invalidate':['*'],'purge':[]},{'invalidate':['public-profiles\n'],'purge':[]},{'invalidate':['public-profiles'],'purge':['admin']},{'invalidate':[],'purge':['public-home']*65}])
def test_control_plan_rejects_unbounded_or_unsafe_values(value):
 with pytest.raises(ValueError):validate_payload(value)

def test_tags_do_not_case_fold_distinct_noncanonical_uids():
 assert record_tag('profiles','A')!=record_tag('profiles','a')

class Binding:
 def __init__(self,fail=False):self.fail=fail;self.committed=False
 def prepare(self,sql):return self
 def bind(self,*args):return self
 async def batch(self,statements):
  if self.fail:raise RuntimeError('constraint failure')
  self.committed=True;return [{'results':[]} for _ in statements]

def test_d1_notifies_after_success_only():
 binding=Binding();calls=[]
 async def notify(statements):assert binding.committed;calls.append(statements)
 sql=D1SQL(binding,on_public_commit=notify);run(sql.batch([('UPDATE profiles SET name=? WHERE uid=?',('A','u'))]));assert len(calls)==1
 binding.fail=True
 with pytest.raises(Error):run(sql.batch([('UPDATE profiles SET name=? WHERE uid=?',('B','u'))]))
 assert len(calls)==1

def test_operational_progress_does_not_invalidate_public_content():
 assert not statements_plan([('UPDATE global_settings SET translation_job_state=?,updated_at=? WHERE uid=?',('pending','now','u'))])
 assert not change_plan('global_settings','u',{'translation_job_state':'old'},{'translation_job_state':'new'})

def test_bulk_row_hints_compact_to_module_without_losing_coverage():
 from backend.app.native.public_cache_tags import Plan
 plan=Plan(invalidate={'public-profiles'}|{record_tag('profiles',str(i)) for i in range(500)})
 payload=plan.payload();assert payload['invalidate']==['public-profiles']
