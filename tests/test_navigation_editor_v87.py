"""Public navigation drafts: persistence, public-only preview, errors and legacy parity."""
import base64,json,re
import pytest
from test_accounts_regression import fixture,run,user
from test_public_home_step2 import add
from backend.app.native.catalog import Error
from backend.app.native.navigation import build_public_path,parse_public_path,editor_state

RULE=[{'field':'name','operator':'contains','value':'人工智能'}]
def request(c,r,**data):
    return c.post('/api/assistance/navigation',json={'_csrf':r.p['csrf'],'location':'header',**data},headers={'Origin':r.config.origin})
def save(r,**extra):
    return run(r.content.save('navigation_items',r.p,{'title':'AI projects','url_name':'ai-projects','kind':'route','location':'header','path':build_public_path('projects',RULE),'visibility':'public','enabled':1,**extra}))

@pytest.mark.parametrize('lang',['en','zh'])
def test_round_trip_and_public_editor_fields(fixture,lang):
    c,r=fixture;path=build_public_path('projects',RULE,lang);assert path.isascii() and '人工' not in path
    assert parse_public_path(path)==('projects',RULE,lang)
    uid=save(r,path=path);row=run(r.sql.query('SELECT * FROM navigation_items WHERE uid=?',(uid,)))[0]
    state=editor_state(row,r.p)
    assert state['table']=='projects' and state['conditions']==RULE and state['lang']==lang
    fields={f['key']:f for f in state['modules']['projects']['public_fields']}
    assert fields['name']['default_operator']=='contains' and fields['status']['operators']==['eq']
    assert not {'principal','amount','members'}&fields.keys()
    html=c.get('/admin/navigation_items/'+uid+'/edit').text
    assert 'data-nav-pending' in html
    asset=re.search(r'src="(/assets/admin/js/native\.js\?v=[^"]+)"',html)
    assert asset and c.get(asset[1]).status_code==200
    assert request(c,r,action='parse',path=path).json()['conditions']==RULE
    # Scoped visitor links contain only an ASCII slug, never the stored condition marker.
    assert 'href="/en/n/ai-projects"' in c.get('/en').text

@pytest.mark.parametrize('location',['header','hero','footer'])
def test_preview_is_public_only_bounded_and_read_only(fixture,location):
    c,r=fixture
    for i in range(12):add(r,'projects','人工智能公开 '+str(i),amount='987654321',principal='SECRETPI',members='SECRETMEM')
    add(r,'projects','人工智能隐藏',visibility='hidden')
    before=run(r.sql.query('SELECT count(*) n FROM navigation_items'))[0]['n']
    logs=run(r.sql.query('SELECT count(*) n FROM operation_logs'))[0]['n']
    a=request(c,r,action='preview',table='projects',conditions=RULE,location=location,size=10,page=1)
    assert a.status_code==200,a.text
    assert a.json()['total']==12 and a.json()['html'].count('<tr>')==11
    assert all(x not in a.text for x in ('987654321','SECRET','隐藏','amount','principal','members'))
    b=request(c,r,action='preview',table='projects',conditions=RULE,location=location,size=10,page=2)
    assert b.status_code==200 and b.json()['html'].count('<tr>')==3
    assert run(r.sql.query('SELECT count(*) n FROM navigation_items'))[0]['n']==before
    assert run(r.sql.query('SELECT count(*) n FROM operation_logs'))[0]['n']==logs


def test_fixed_draft_update_remove_conditions_and_duplicate_slug(fixture):
    c,r=fixture;uid=save(r)
    with pytest.raises(Error,match='标识'):save(r)
    row=run(r.sql.query('SELECT * FROM navigation_items WHERE uid=?',(uid,)))[0]
    changed=[{'field':'source','operator':'eq','value':'国家基金'}]
    run(r.content.save('navigation_items',r.p,{'path':build_public_path('projects',changed)},uid,row['updated_at']))
    row=run(r.sql.query('SELECT * FROM navigation_items WHERE uid=?',(uid,)))[0]
    assert editor_state(row,r.p)['conditions']==changed
    run(r.content.save('navigation_items',r.p,{'path':build_public_path('projects',[])},uid,row['updated_at']))
    assert 'data-navigation-id="'+uid+'"' in c.get('/en').text

@pytest.mark.parametrize('path',['/en/projects?nf=!', '/en/projects?nf=e30', '/en/projects?nf=bnVsbA', '/en/projects?nf=YQ&nf=YQ','https://example.org/en/projects','/en/projects?q=hello','/en/projects?c.name=a&c.name=b','/en/projects?f.principal=x','/en/projects#x'])
def test_bad_draft_path_fails_without_traceback(fixture,path):
    c,r=fixture;response=request(c,r,action='parse',path=path)
    assert response.status_code==422

@pytest.mark.parametrize('patch',[{'kind':'external'},{'kind':'anchor'},{'fragment':'main'},{'url_name':''},{'location':'other'}])
def test_invalid_fixed_entry_cannot_save(fixture,patch):
    _,r=fixture
    with pytest.raises(Error):save(r,**patch)


def test_privacy_checks_apply_to_preview_and_save(fixture):
    c,r=fixture;bad=[{'field':'amount','operator':'eq','value':'100'}]
    assert request(c,r,action='preview',table='projects',conditions=bad).status_code==422
    encoded=base64.urlsafe_b64encode(json.dumps(bad).encode()).decode().rstrip('=')
    with pytest.raises(Error):save(r,path='/en/projects?nf='+encoded)
    assert c.post('/api/assistance/navigation',json={'action':'preview','location':'header','table':'projects','conditions':RULE},headers={'Origin':r.config.origin}).status_code==403
    u=user(r);token=run(r.auth.login(u['username'],'Synthetic-only-password-035','test'));p=run(r.auth.principal(token));c.cookies.set(r.config.name('session'),token)
    assert c.post('/api/assistance/navigation',json={'_csrf':p['csrf'],'action':'preview','table':'projects','conditions':RULE,'location':'header'},headers={'Origin':r.config.origin}).status_code==403


def test_legacy_preview_stays_equal_and_includes_authorized_private_records(fixture):
    c,r=fixture;add(r,'projects','人工智能');add(r,'projects','人工智能扩展');add(r,'projects','人工智能',visibility='hidden')
    response=request(c,r,action='preview',location='admin-sidebar',table='projects',conditions=[{'field':'name','value':'人工智能'}])
    assert response.status_code==200 and response.json()['total']==2
    assert request(c,r,action='preview',location='admin-sidebar',table='projects',conditions=RULE).json()['total']==3
