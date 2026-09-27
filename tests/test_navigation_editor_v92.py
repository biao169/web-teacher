"""Both destinations reuse fixed predicates through preview, save, reads and writes."""
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add
from backend.app.native.navigation import build_path,parse_path,in_scope,scope_conditions,editor_state
from backend.app.native.catalog import Error
from backend.app.native.suggestions import suggestions
from backend.app.native.data_tools import validate_domain

RULE=[{'field':'name','operator':'contains','value':'机械'}]

def test_backend_contains_persists_and_intersects_queries(fixture):
    c,r=fixture
    selected=add(r,'projects','机械制造',source='目标来源')
    add(r,'projects','机械医疗',source='另一来源')
    outside=add(r,'projects','其他制造',source='外部来源')
    path=build_path('projects',RULE)
    assert path.isascii() and '机械' not in path
    uid=run(r.content.save('navigation_items',r.p,{'title':'机械项目','url_name':'mechanics','location':'admin-sidebar','kind':'route','path':path,'enabled':1,'visibility':'public'}))
    row=run(r.content.get('navigation_items',uid,r.p))
    assert editor_state(row,r.p)['conditions']==RULE
    entry,table,base=run(r.content.navigation('mechanics',r.p))
    assert scope_conditions(base)==RULE and base and not dict(base) # Contains must never become an equality lock/default.
    listing=lambda **q:run(r.content.listing(table,r.p,q,base))
    assert listing()['total']==2
    assert listing(q='制造')['rows'][0]['uid']==selected
    assert listing(**{'f.name':'其他制造'})['total']==0
    assert listing(**{'c.name':'其他'})['total']==0
    assert listing()['total']==2
    for query in ('','?q=其他'):
        response=c.get('/admin/n/mechanics'+query)
        assert response.status_code==200,response.text
        assert '外部来源' not in response.text
    assert '包含 机械' in c.get('/admin/n/mechanics').text
    exported=c.get('/admin/projects/export?nav=mechanics')
    assert exported.status_code==200 and '机械制造' in exported.text and '外部来源' not in exported.text
    current=run(r.content.get(table,selected,r.p))
    run(r.content.save(table,r.p,{'name':'机械制造更新'},selected,current['updated_at'],base))
    assert set(run(suggestions(r.content,r.p,{'table':'projects','field':'source'},base))['values'])=={'另一来源','目标来源'}
    with pytest.raises(Error):run(r.content.save(table,r.p,{'name':'其他'},selected,run(r.content.get(table,selected,r.p))['updated_at'],base))
    other=run(r.content.get(table,outside,r.p))
    with pytest.raises(Error):run(r.content.delete(table,r.p,outside,other['updated_at'],base))
    assert c.get('/admin/projects/'+outside+'/edit?nav=mechanics').status_code==403
    validate_domain('navigation_items',row)
    assert scope_conditions(parse_path(row['path'])[1])==RULE

@pytest.mark.parametrize('term',['A_%','C\\D',"x' OR 1=1 --",'ReSeArCh','机械'])
def test_backend_contains_literal_and_write_guard_agree(fixture,term):
    _,r=fixture
    wanted=add(r,'projects','prefix '+term.lower()+' suffix')
    add(r,'projects','prefix AXfoo suffix')
    _,base=parse_path(build_path('projects',[{'field':'name','operator':'contains','value':term}]))
    rows=run(r.content.listing('projects',r.p,{},base))['rows']
    assert [row['uid'] for row in rows]==[wanted]
    assert in_scope('projects',rows[0],base)
    assert not in_scope('projects',{'name':'else'},base)


def test_backend_preview_pagination_and_legacy_equality(fixture):
    c,r=fixture
    for i in range(12):add(r,'projects','机械 '+str(i))
    add(r,'projects','其他')
    for page,count in [(1,10),(2,2)]:
        resp=c.post('/api/assistance/navigation',json={'_csrf':r.p['csrf'],'location':'admin-sidebar','action':'preview','table':'projects','conditions':RULE,'page':page,'size':10},headers={'Origin':r.config.origin})
        assert resp.status_code==200,resp.text
        assert resp.json()['total']==12 and resp.json()['html'].count('<tr>')==count+1
    table,base=parse_path('/admin/projects?f.name=abc')
    assert base=={'name':'abc'} and build_path(table,scope_conditions(base))=='/admin/projects?f.name=abc'
    with pytest.raises(Error):parse_path('/admin/projects?f.name=abc&c.name=a')
    with pytest.raises(Error):build_path('projects',[{'field':'status','operator':'contains','value':'进行中'}])
