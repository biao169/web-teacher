"""Trusted fixed-scope metadata, capability fallback and unchanged cache boundary."""
import json
import pytest
from justhtml import JustHTML
from test_accounts_regression import fixture
from test_public_navigation_v88 import entry
from backend.app.native.public_navigation import browser_scope

@pytest.mark.parametrize('lang',['zh','en'])
def test_public_fixed_scope_exports_minimal_json_and_icons(fixture,lang):
    c,r=fixture;entry(r,table='profiles',field='name',value='</script> literal')
    response=c.get('/'+lang+'/n/ai-projects');assert response.status_code==200
    doc=JustHTML(response.text,sanitize=False);root=doc.query('[data-public-list-local]')[0]
    descriptors=doc.query('[data-public-fixed-scope]');assert len(descriptors)==1
    data=json.loads(descriptors[0].to_text());assert set(data)=={'schema_version','module','slug','stamp','conditions'}
    assert data['conditions']==[{'field':'name','operator':'contains','value':'</script> literal'}]
    assert data['stamp']==root.attrs['data-nav-stamp']
    assert doc.query('input[name="nv"]')[0].attrs['value']==data['stamp']
    assert len(doc.query('template[data-public-card-icon]'))==2
    assert response.headers['cache-control']=='public, max-age=60'
    assert 'public-list.js?v=0.16.117' in response.text

def test_restricted_navigation_never_enables_browser_scope(fixture):
    c,r=fixture;entry(r,visibility='authenticated');response=c.get('/en/n/ai-projects');assert response.status_code==200
    doc=JustHTML(response.text,sanitize=False);assert not doc.query('[data-public-list-local]') and not doc.query('[data-public-fixed-scope]')
    assert response.headers['cache-control']=='no-store'

def test_unsupported_capability_keeps_scoped_server_page(fixture,monkeypatch):
    c,r=fixture;entry(r)
    monkeypatch.setattr('backend.app.native.public_navigation.browser_scope',lambda *args:None)
    response=c.get('/en/n/ai-projects');assert response.status_code==200
    doc=JustHTML(response.text,sanitize=False);assert not doc.query('[data-public-list-local]')
    assert doc.query('form[data-public-query-form]')[0].attrs['action']=='/en/n/ai-projects'
    assert doc.query('[data-nav-stamp]')

@pytest.mark.parametrize('condition',[{'field':'name','operator':'range','value':'A'},{'field':'amount','operator':'eq','value':'1'}])
def test_unsupported_predicate_has_no_browser_descriptor(condition):
    assert browser_scope({'public':True,'slug':'selected','stamp':'a'*32,'table':'projects','conditions':[condition]}) is None

def test_direct_scoped_query_with_cookie_remains_anonymous_and_local_but_no_store(fixture,monkeypatch):
    c,r=fixture;entry(r,table='profiles',field='name',value='Selected')
    initial=c.get('/en/n/ai-projects');stamp=JustHTML(initial.text,sanitize=False).query('[data-nav-stamp]')[0].attrs['data-nav-stamp']
    original=r.sql.query
    async def query(sql,*args,**kwargs):
        assert 'FROM auth_sessions' not in sql
        return await original(sql,*args,**kwargs)
    monkeypatch.setattr(r.sql,'query',query)
    response=c.get('/en/n/ai-projects',params={'nv':stamp,'page':2});assert response.status_code==200
    assert JustHTML(response.text,sanitize=False).query('[data-public-list-local]')
    assert response.headers['cache-control']=='no-store' and 'cache-tag' not in response.headers
    assert c.get('/en/n/ai-projects',params={'nv':'b'*32}).status_code==409
