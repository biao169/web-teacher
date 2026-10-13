"""Navigation tag dependency and committed-write semantics on disposable SQLite."""
import pytest,sqlite3
from test_public_navigation_v88 import fixture,entry,run
from backend.app.native.public_cache_tags import navigation_tag,change_plan,Plan,validate_payload,statements_plan,CommittedChanges,record_commit
from backend.app.native.catalog import Error

@pytest.mark.parametrize('lang',['zh','en'])
def test_fixed_entry_has_language_independent_navigation_and_module_tags(fixture,lang):
 c,r=fixture;entry(r)
 response=c.get('/'+lang+'/n/ai-projects');tags=set(response.headers['cache-tag'].split(','))
 assert {navigation_tag('ai-projects'),'public-navigation','public-projects','public-layout'}<=tags
 assert c.head('/'+lang+'/n/ai-projects').headers['cache-tag']==response.headers['cache-tag']
 assert c.get('/'+lang+'/n/ai-projects',headers={'If-None-Match':response.headers['etag']}).headers['cache-tag']==response.headers['cache-tag']
 assert navigation_tag('ai-projects') not in c.get('/'+lang+'/projects').headers['cache-tag']
 assert 'cache-tag' not in c.get('/'+lang+'/n/ai-projects?direction=asc').headers

def row(**kw):return {'url_name':'old','path':'/zh/projects?f.status=active','title':'Old','visibility':'public','enabled':1,'location':'header','kind':'route','fragment':'',**kw}

def test_label_edit_invalidates_while_scope_change_purges_only_entry():
 before=row();plan=change_plan('navigation_items','uid',before,row(title='New'))
 assert navigation_tag('old') in plan.invalidate and 'public-layout' in plan.invalidate
 assert not plan.purge
 plan=change_plan('navigation_items','uid',before,row(path='/zh/publications?f.year=2026'))
 assert plan.purge=={navigation_tag('old')}
 assert 'public-layout' in plan.invalidate and 'public-layout' not in plan.purge

@pytest.mark.parametrize('patch',[{'url_name':'new'},{'visibility':'authenticated'},{'visibility':'staff'},{'enabled':0},{'location':'admin-sidebar'},{'kind':'external'},{'fragment':'part'}])
def test_configuration_binding_change_cannot_reuse_old_success(patch):
 plan=change_plan('navigation_items','uid',row(),row(**patch))
 assert navigation_tag('old') in plan.purge and 'public-layout' not in plan.purge
 if 'url_name' in patch:assert navigation_tag('new') in plan.purge

def test_delete_and_independent_entries():
 plan=change_plan('navigation_items','uid',row(),{},True)
 assert navigation_tag('old') in plan.purge and navigation_tag('unrelated') not in plan.purge
 assert navigation_tag('old')!=navigation_tag('new')

@pytest.mark.parametrize('sql',['UPDATE navigation_items SET path=? WHERE uid=?','UPDATE navigation_items SET url_name=? WHERE uid=?','DELETE FROM navigation_items WHERE uid=?'])
def test_bulk_writes_fall_back_to_fixed_entry_group_not_full_page_purge(sql):
 plan=statements_plan([(sql,())]);assert 'public-navigation' in plan.purge
 assert 'public-layout' in plan.invalidate and 'public-layout' not in plan.purge

def test_many_entry_tags_are_bounded_and_validator_rejects_arbitrary_tags():
 plan=Plan(purge={navigation_tag('nav-'+str(i)) for i in range(100)})
 assert plan.payload()=={'invalidate':[],'purge':['public-navigation']}
 assert validate_payload({'invalidate':[navigation_tag('old')],'purge':['public-navigation']})
 for tag in ['public-nav-x','public-nav-'+('A'*32),'admin-cache','anything']:
  with pytest.raises(ValueError):validate_payload({'invalidate':[],'purge':[tag]})

def test_real_save_emits_after_commit_and_failed_save_emits_nothing(fixture):
 c,r=fixture;uid=entry(r);r.sql.on_public_commit=record_commit
 before=run(r.content.get('navigation_items',uid,r.p))
 with CommittedChanges() as changes:run(r.content.save('navigation_items',r.p,{'url_name':'new-name'},uid,before['updated_at']))
 assert {navigation_tag('ai-projects'),navigation_tag('new-name')}<=changes.plan.purge
 assert c.get('/zh/n/ai-projects').status_code==404 and c.get('/en/n/new-name').status_code==200
 with CommittedChanges() as failed:
  with pytest.raises((Error,sqlite3.IntegrityError)):run(r.content.save('navigation_items',r.p,{'title':'Should not commit'},uid,before['updated_at']))
 assert not failed.plan
