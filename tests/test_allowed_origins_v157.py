"""Multi-domain admission, same-host writes and real shared sessions/transfer routes."""
import asyncio
import re
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from backend.app.security.http import AuthConfig,AuthError
from backend.app.security.origins import parse_origins
from test_accounts_regression import fixture,run

PRIMARY='https://primary.example.test'
ALIAS='https://alias.example.test'

def req(host='alias.example.test',origin=ALIAS,**headers):
    return SimpleNamespace(headers={'host':host,'origin':origin,**headers})

@pytest.mark.parametrize('value',['*','https://*.example.test','http://alias.example.test','https://u:p@alias.example.test','https://alias.example.test/path','https://alias.example.test?x=1','https://alias.example.test#x','null','https://alias.example.test\\evil','https://alias%2eexample.test','https://alias.example.test:0','https://alias.example.test:99999','[1]','{}'])
def test_bad_aliases_rejected(value):
    with pytest.raises((ValueError,TypeError)):AuthConfig.from_origin(PRIMARY,value)

def test_normalization_and_backward_compatibility():
    c=AuthConfig.from_env({'TEACHER_ORIGIN':PRIMARY,'TEACHER_ALLOWED_ORIGINS':'["https://ALIAS.example.test:443/", "'+PRIMARY+'"]'})
    assert c.origin==PRIMARY and c.allowed_origins==(PRIMARY,ALIAS)
    assert AuthConfig.from_origin(PRIMARY).allowed_origins==(PRIMARY,)
    assert AuthConfig.from_origin('http://[::1]:8003').request_origin(req('[::1]:8003'))=='http://[::1]:8003'
    with pytest.raises(ValueError):parse_origins(PRIMARY,','.join('https://n'+str(i)+'.test' for i in range(33)))

@pytest.mark.parametrize('origin',[PRIMARY,'https://evil.test','null',''])
def test_allowed_host_requires_its_own_origin(origin):
    c=AuthConfig.from_origin(PRIMARY,ALIAS)
    with pytest.raises(AuthError):c.same_origin(req(origin=origin))

def test_forwarded_headers_and_fetch_site_do_not_expand_trust():
    c=AuthConfig.from_origin(PRIMARY,ALIAS)
    c.same_origin(req())
    c.same_origin(req('ALIAS.example.test:443'))
    with pytest.raises(AuthError):c.valid_host(req('evil.test',**{'x-forwarded-host':'alias.example.test'}))
    with pytest.raises(AuthError):c.same_origin(req(**{'sec-fetch-site':'same-site'}))
    for host in ('alias.example.test/','alias.example.test@evil.test','alias.example.test,evil.test',''):
        with pytest.raises(AuthError):c.valid_host(req(host))

@pytest.mark.parametrize('origin',[PRIMARY,ALIAS])
def test_login_save_sync_transfer_logout_on_each_domain(fixture,origin,monkeypatch):
    monkeypatch.setenv('TEACHER_SYNC_KEY','6a'*32)
    old,r=fixture;r.config=AuthConfig.from_origin(PRIMARY,ALIAS)
    with TestClient(old.app,base_url=origin) as c:
        page=c.get('/auth/login');assert page.status_code==200
        challenge=re.search(r'name="challenge" value="([^"]+)"',page.text)[1]
        result=c.post('/auth/login',json={'challenge':challenge,'username':'list-test-admin','password':'Synthetic-test-only-032','next':'/admin'},headers={'Origin':origin,'Accept':'application/json'})
        assert result.status_code==200 and result.json()['redirect']=='/admin'
        cookie=result.headers['set-cookie'].lower()
        assert 'secure' in cookie and 'httponly' in cookie and 'domain=' not in cookie
        principal=run(r.auth.principal(c.cookies.get('__Host-ts_session')))
        headers={'Origin':origin,'X-CSRF-Token':principal['csrf'],'Accept':'application/json'}
        saved=c.post('/admin/profiles/save',json={'name':'Domain teacher','visibility':'public'},headers=headers)
        assert saved.status_code==200,saved.text
        wrong=ALIAS if origin==PRIMARY else PRIMARY
        assert c.post('/admin/profiles/save',json={'name':'Rejected'},headers={**headers,'Origin':wrong}).status_code==403
        assert c.post('/admin/profiles/save',json={'name':'Rejected'},headers={'Origin':origin}).status_code==403
        assert c.get('/admin/site-sync').status_code==200
        assert c.post('/api/admin/site-sync/connection',json={'origin':'https://peer.example','enabled':True},headers=headers).status_code==200
        assert c.get('/admin/site-sync/api/tasks').status_code==200
        assert c.get('/transfer/').status_code==200
        settings=c.post('/transfer/api/settings',json={'revision':0,'enabled':True,'vpnGuard':False,'temporaryShare':True},headers=headers)
        assert settings.status_code==200,settings.text
        task=c.post('/transfer/api/tasks',json={'name':'domain.txt','size':4},headers=headers)
        assert task.status_code==200,task.text
        task=task.json()
        assert c.post('/transfer/api/tasks/'+task['id']+'/chunk',content=b'test',headers={**headers,'X-Offset':'0'}).status_code==200
        assert c.get('/transfer/s/'+task['token']).content==b'test'
        assert c.post('/transfer/api/tasks',json={'name':'bad','size':1},headers={**headers,'Origin':wrong}).status_code==403
        public=c.get('/en');assert 'rel="canonical" href="'+PRIMARY+'/en' in public.text
        assert PRIMARY+'/sitemap.xml' in c.get('/robots.txt').text
        assert c.get('https://evil.test/en').status_code==400
        assert c.get(wrong+'/admin/profiles',follow_redirects=False).status_code==303
        assert c.post('/auth/logout',json={},headers=headers,follow_redirects=False).status_code==303
        assert c.get('/admin/profiles',follow_redirects=False).status_code==303


def test_alias_registration_and_contact(fixture):
    old,r=fixture;r.config=AuthConfig.from_origin(PRIMARY,ALIAS)
    run(r.sql.batch([('UPDATE global_settings SET allow_public_registration=1,allow_anonymous_messages=1',())]))
    with TestClient(old.app,base_url=ALIAS) as c:
        html=c.get('/auth/register?lang=en').text
        challenge=re.search(r'name="challenge" value="([^"]+)"',html)[1]
        response=c.post('/auth/register',json={'challenge':challenge,'username':'alias157','password':'secret123','email':'a@example.org','lang':'en'},headers={'Origin':ALIAS,'Accept':'application/json'})
        assert response.status_code==200 and response.json()['registered']
        html=c.get('/en/contact').text
        challenge=re.search(r'name="challenge" value="([^"]+)"',html)[1]
        data={'challenge':challenge,'name':'Alias visitor','email':'a@example.org','subject':'Alias contact','content':'Message from alias'}
        response=c.post('/en/contact',data=data,headers={'Origin':PRIMARY,'Accept':'application/json'})
        assert response.status_code==403
        html=c.get('/en/contact').text
        data['challenge']=re.search(r'name="challenge" value="([^"]+)"',html)[1]
        response=c.post('/en/contact',data=data,headers={'Origin':ALIAS,'Accept':'application/json'})
        assert response.status_code==200 and response.json()['ok'],response.text
        assert run(r.sql.query("SELECT count(*) AS n FROM messages WHERE subject='Alias contact'"))[0]['n']==1
