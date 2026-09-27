"""Unified filter predicates on disposable SQLite, including legacy navigation gates."""
from urllib.parse import urlencode
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add
from backend.app.native.catalog import Error,CONTENT
from backend.app.native.filtering import normalize_conditions,field_options,compile_conditions,PUBLIC_FILTER_FIELDS,PUBLIC_SEARCH_FIELDS
from backend.app.native.navigation import build_path,parse_path,in_scope
from backend.app.native.public_data import public_listing


def fixed(field='name',value='智能',operator='contains'):
    return [{'field':field,'operator':operator,'value':value}]


def listing(r,conditions,**query):
    return run(public_listing(r,'projects',query,fixed_conditions=conditions))


def uids(result):return [row['uid'] for row in result['rows']]


def test_contains_equality_and_separate_user_conditions(fixture):
    _,r=fixture
    exact=add(r,'projects','智能',source='国家基金',status='进行中')
    longer=add(r,'projects','智能制造项目',source='国家基金',status='进行中')
    add(r,'projects','智能医疗项目',source='合作基金',status='已完成')
    add(r,'projects','材料研究',source='国家基金',status='进行中')
    add(r,'projects','智能隐藏项目',visibility='hidden',source='国家基金',status='进行中')
    conditions=fixed()+[{'field':'source','operator':'contains','value':'国家'}]
    result=listing(r,conditions,**{'f.status':'进行中'})
    assert result['total']==2 and set(uids(result))=={exact,longer}
    assert uids(listing(r,fixed(operator='eq')))==[exact]
    assert uids(listing(r,conditions,q='制造'))==[longer]
    assert listing(r,conditions,**{'f.name':'材料研究'})['total']==0
    assert listing(r,conditions,**{'c.name':'材料'})['total']==0
    # Clearing visitor filters only removes the extra intersection, not the fixed scope.
    assert set(uids(listing(r,conditions)))=={exact,longer}
    assert conditions[0]=={'field':'name','operator':'contains','value':'智能'}


@pytest.mark.parametrize('keyword', ['A_%','C\\D',"x' OR 1=1 --",'人工智能','ReSeArCh'])
def test_literal_substrings_and_ascii_case(fixture,keyword):
    _,r=fixture
    selected=add(r,'projects','Prefix '+keyword.lower()+' suffix')
    add(r,'projects','Prefix AxQQ suffix')
    assert uids(listing(r,fixed(value=keyword)))==[selected]
    assert uids(listing(r,[],q=keyword))==[selected]
    assert uids(run(r.content.listing('projects',r.p,query={'c.name':keyword})))==[selected]


def test_counts_and_pagination_are_after_all_filters(fixture):
    _,r=fixture;wanted=[]
    for i in range(23):
        uid=add(r,'projects','智能 '+str(i),source='目标' if i<12 else '其他',sort_order=i)
        if i<12:wanted.append(uid)
    add(r,'projects','智能 SECRET',visibility='hidden',source='目标')
    conditions=fixed()+[{'field':'source','operator':'eq','value':'目标'}]
    a=listing(r,conditions,page=1);b=listing(r,conditions,page=2)
    assert a['total']==b['total']==12 and a['pages']==2
    assert uids(a)+uids(b)==wanted
    reverse=listing(r,conditions,direction='desc');assert uids(reverse)==list(reversed(wanted))[:10]


@pytest.mark.parametrize('field', ['principal','amount','members','visibility','summary','email','phone','password_hash','name" OR 1=1 --'])
def test_public_fixed_and_visitor_filters_reject_private_or_unknown_fields(fixture,field):
    c,r=fixture
    for op in ('eq','contains'):
        with pytest.raises(Error):listing(r,fixed(field=field,operator=op,value='secret'))
    for prefix in ('f.','c.'):
        assert c.get('/en/projects?'+urlencode({prefix+field:'secret'})).status_code==422


def test_public_search_excludes_private_text_but_includes_source_plan_number(fixture):
    c,r=fixture
    uid=add(r,'projects','Normal project',source='VisibleSource',fund_name='VisiblePlan',project_number='P2026XYZ',principal='SECRETPI',members='SECRETMEMBER',amount='777777')
    for q in ('SECRETPI','SECRETMEMBER','777777'):assert listing(r,[],q=q)['total']==0
    for q in ('visiblesource','visibleplan','p2026xyz'):assert uids(listing(r,[],q=q))==[uid]
    # A system administrator still uses the same public search whitelist.
    assert r.p['is_system'] and listing(r,[],q='SECRETPI')['total']==0
    assert c.get('/en/projects?'+urlencode({'c.name':'Normal'})).status_code==200


@pytest.mark.parametrize('conditions', [None,{},[{'field':'name','value':''}],
    [{'field':'name','value':'x','operator':'regex'}], [{'field':'name','value':'x','operator':[]}],
    [{'field':'status','value':'进行','operator':'contains'}],
    [{'field':'name','value':'a'},{'field':'name','value':'b'}],
    [{'field':'name','value':'x','extra':1}], [{'field':[],'value':'x'}],
    [{'field':'name','value':'x\x00y'}], [{'field':'name','value':'x\x7fy'}],
    [{'field':'name','value':'x'*501}], [{'field':'name','value':1.2}],
    [{'field':'name','value':'x'}]*13])
def test_invalid_conditions_fail_closed(conditions):
    with pytest.raises(Error):normalize_conditions('projects',conditions,public=True)


def test_legacy_conditions_and_scalar_normalization():
    old=[{'field':'name','value':' 智能 '}]
    assert normalize_conditions('projects',old,public=True)==fixed(value='智能',operator='eq')
    assert old[0]['value']==' 智能 '
    assert normalize_conditions('publications',[{'field':'year','value':'02026'}],public=True)[0]['value']=='2026'
    assert normalize_conditions('profiles',[{'field':'is_active','value':True}],public=True)[0]['value']=='1'
    for table,condition in [('profiles',{'field':'is_active','value':2}),('publications',{'field':'year','value':'2026.5'}),('publications',{'field':'year','value':2026,'operator':'contains'})]:
        with pytest.raises(Error):normalize_conditions(table,[condition],public=True)


def test_metadata_defaults_and_public_field_catalog():
    for table in CONTENT:
        options={item['key']:item for item in field_options(table,public=True)}
        assert set(PUBLIC_SEARCH_FIELDS[table])<=set(PUBLIC_FILTER_FIELDS[table])
        assert set(options)==set(PUBLIC_FILTER_FIELDS[table])
        assert not {'phone','email','student_id','principal','amount','members','visibility','source_citation','pdf_key'}&set(options)
    assert {i['key']:i for i in field_options('projects',public=True)}['name']['default_operator']=='contains'
    assert {i['key']:i for i in field_options('projects',public=True)}['status']['operators']==['eq']
    assert compile_conditions('projects',[],public=True)==('1',[])


def test_hidden_inactive_and_future_sources_remain_excluded(fixture):
    _,r=fixture
    inactive=add(r,'profiles','智能 inactive',is_active=0)
    active=add(r,'profiles','智能 active',is_active=1)
    results=run(public_listing(r,'profiles',{},fixed_conditions=fixed()))
    assert active in uids(results) and inactive not in uids(results)
    future=add(r,'news','智能 future')
    run(r.sql.batch([('UPDATE news SET published_at=? WHERE uid=?',('2099-01-01T00:00:00.000Z',future))]))
    assert run(public_listing(r,'news',{},fixed_conditions=fixed(field='title')))['total']==0


def test_manual_english_fields_are_searchable_before_cache_search_step(fixture):
    _,r=fixture
    uid=add(r,'students','张三',name_en='Alice Zhang')
    result=run(public_listing(r,'students',{'q':'ALICE'}))
    assert uids(result)==[uid]


def test_admin_saved_navigation_remains_exact_and_user_filter_cannot_override(fixture):
    c,r=fixture
    exact=add(r,'projects','智能');add(r,'projects','智能制造')
    path=build_path('projects',[{'field':'name','value':'智能'}])
    assert path.isascii() and parse_path(path)==('projects',{'name':'智能'})
    assert in_scope('projects',{'name':'智能'},{'name':'智能'})
    assert not in_scope('projects',{'name':'智能制造'},{'name':'智能'})
    nav=run(r.content.save('navigation_items',r.p,{'title':'Exact test','url_name':'exact-test','path':path,'location':'admin-sidebar','visibility':'public','enabled':1}))
    _,table,base=run(r.content.navigation('exact-test',r.p))
    assert uids(run(r.content.listing(table,r.p,base=base)))==[exact]
    assert not run(r.content.listing(table,r.p,base=base,query={'f.name':'智能制造'}))['rows']
    assert c.get('/admin/n/exact-test').status_code==200
    reply=c.post('/api/assistance/navigation',json={'_csrf':r.p['csrf'],'uid':nav,'action':'preview','table':'projects','conditions':[{'field':'name','value':'智能'}]},headers={'Origin':r.config.origin})
    assert reply.status_code==200 and reply.json()['total']==1
    # Explicit contains is supported; old f. paths above remain exact.
    assert in_scope('projects',{'name':'a test project'},parse_path('/admin/projects?c.name=test')[1])


def test_empty_home_module_still_validates_fixed_fields(fixture):
    _,r=fixture
    with pytest.raises(Error):run(public_listing(r,'projects',{},site={'homepage_project_limit':0},home=True,fixed_conditions=fixed(field='amount')))
