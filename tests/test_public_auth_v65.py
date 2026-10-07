import re
import pytest
from test_accounts_regression import fixture,run
from backend.app.native.public_auth import safe_next

def form(c,mode='login',query=''):
    r=c.get('/auth/'+mode+query)
    return r,re.search('name="challenge" value="([^"]+)"',r.text)
def send(c,r,mode,data,json=False):
    h={'Origin':r.config.origin}
    if json:h['Accept']='application/json'
    return c.post('/auth/'+mode,data=data,headers=h,follow_redirects=False)

def test_closed_registration_in_page_and_fragment(fixture):
    c,r=fixture;run(r.sql.batch([('UPDATE global_settings SET allow_public_registration=0',())]))
    page,_=form(c,query='?lang=en')
    assert 'Registration is currently closed.' in page.text and 'data-auth-form' in page.text
    assert 'data-auth-switch' not in page.text and '登录管理后台' not in page.text
    response=c.get('/auth/register?lang=en',headers={'X-Auth-Fragment':'1'})
    assert response.status_code==403 and 'data-auth-form' not in response.json()['html']
    result=send(c,r,'register',dict(challenge=c.cookies.get('ts_public-form'),username='new-user',password='secret123',lang='en'),True)
    assert result.status_code==403 and 'Registration is currently closed' in result.json()['html']

def test_registration_then_login_returns_to_original_page(fixture):
    c,r=fixture;run(r.sql.batch([('UPDATE global_settings SET allow_public_registration=1',())]))
    c.cookies.clear();page,ch=form(c,'register','?lang=en&next=/en/students')
    result=send(c,r,'register',dict(challenge=ch[1],username='new65',password='secret123',email='a@example.org',lang='en',next='/en/students'),True)
    assert result.status_code==200 and result.json()['registered']
    page=c.get(result.json()['redirect']);assert 'Registration complete' in page.text
    ch=re.search('name="challenge" value="([^"]+)"',page.text)[1]
    result=send(c,r,'login',dict(challenge=ch,username='new65',password='secret123',lang='en',next='/en/students'),True)
    assert result.json()['redirect']=='/en/students' and c.cookies.get('ts_session')

def test_failure_preserves_account_not_password_and_renews_token(fixture):
    c,r=fixture;_,ch=form(c,query='?lang=en')
    result=send(c,r,'login',dict(challenge=ch[1],username='nonexistent65',password='NEVER_ECHO_THIS',lang='en'),True)
    assert result.status_code==401
    html=result.json()['html'];assert 'nonexistent65' in html and 'NEVER_ECHO_THIS' not in html and 'Incorrect username' in html
    assert c.cookies.get('ts_login')!=ch[1]

@pytest.mark.parametrize('value',['https://evil.test','//evil.test','/\\evil.test','/%2f%2fevil.test','/admin/../auth/logout','/auth/login','/en\nX:bad','/en#fragment'])
def test_return_target_rejects_external_and_unsafe(value):assert safe_next(value)==''

def test_return_target_keeps_query():assert safe_next('/en/publications?year=2026')=='/en/publications?year=2026'

def test_open_dialog_uses_fresh_settings_and_missing_cookie_is_rejected(fixture):
    c,r=fixture;c.cookies.clear()
    response=send(c,r,'login',dict(challenge='!',username='x',password='secret',lang='en'),True)
    assert response.status_code==403
    run(r.sql.batch([('UPDATE global_settings SET allow_public_registration=1',())]))
    response=c.get('/auth/login?lang=en',headers={'X-Auth-Fragment':'1'})
    assert response.headers['cache-control']=='no-store' and 'data-auth-switch' in response.json()['html']

def test_admin_login_native_fallback_and_transfer_return(fixture):
    c,r=fixture;c.cookies.clear();page,ch=form(c)
    result=send(c,r,'login',dict(challenge=ch[1],username='list-test-admin',password='Synthetic-test-only-032'))
    assert result.status_code==303 and result.headers['location']=='/admin'
    c.cookies.clear();result=c.get('/transfer/login',follow_redirects=False)
    assert result.status_code==303 and 'next=%2Ftransfer%2Flogin' in result.headers['location']

def test_duplicate_registration_preserves_username_without_echoing_password(fixture):
    c,r=fixture;run(r.sql.batch([('UPDATE global_settings SET allow_public_registration=1',())]))
    page,ch=form(c,'register','?lang=en')
    result=send(c,r,'register',dict(challenge=ch[1],username='list-test-admin',password='NEVER_ECHO_THIS',lang='en'))
    assert result.status_code==409 and 'already exists' in result.text
    assert 'value="list-test-admin"' in result.text and 'NEVER_ECHO_THIS' not in result.text

def test_setting_changed_after_open_is_rechecked_and_origin_is_required(fixture):
    c,r=fixture;run(r.sql.batch([('UPDATE global_settings SET allow_public_registration=1',())]))
    _,ch=form(c,'register');run(r.sql.batch([('UPDATE global_settings SET allow_public_registration=0',())]))
    assert send(c,r,'register',dict(challenge=ch[1],username='blocked65',password='secret123')).status_code==403
    _,ch=form(c)
    result=c.post('/auth/login',data=dict(challenge=ch[1],username='list-test-admin',password='Synthetic-test-only-032'),headers={'Origin':'https://elsewhere.example','Accept':'application/json'})
    assert result.status_code==403
