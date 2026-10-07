"""HTTP initialization and unchanged application services against disposable SQLite."""
import asyncio
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient

HERE=Path(__file__).resolve().parents[1]
ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(HERE))
from runtime.setup import install
from backend.app.config import Settings
from backend.app.native.runtime import local
from backend.app.native.web import create_app
from backend.app.native.auth import Auth
from backend.app.security.http import AuthConfig

TOKEN='test-only-token-'+'x'*40
ORIGIN='https://teacher.example.test'
PASSWORD='Test-only-setup-2026'
run=asyncio.run

@pytest.fixture
def site(tmp_path):
    r=local(Settings(tmp_path));r.config=AuthConfig.from_origin(ORIGIN)
    app=create_app(lambda request:r,ROOT)
    env=SimpleNamespace(TEACHER_SETUP_TOKEN=TOKEN)
    @app.middleware('http')
    async def environment(request,call_next):
        request.scope['env']=env
        return await call_next(request)
    install(app,lambda request:r)
    with TestClient(app,base_url=ORIGIN) as c:
        yield c,r,env


def submit(c,**extra):
    data={'token':TOKEN,'username':'first-admin','password':PASSWORD,'confirm':PASSWORD}
    data.update(extra)
    return c.post('/setup',data=data,headers={'Origin':ORIGIN})


def test_setup_then_existing_login_and_public_pages(site):
    c,r,_=site
    page=c.get('/setup');assert page.status_code==200 and TOKEN not in page.text
    assert page.headers['x-robots-tag']=='noindex, nofollow'
    assert page.headers['referrer-policy']=='same-origin'
    assert page.headers['cache-control']=='no-store'
    result=submit(c);assert result.status_code==200
    assert 'Administrator created' in result.text and PASSWORD not in result.text and TOKEN not in result.text
    users=run(r.sql.query('SELECT username,status,password_hash FROM auth_users'))
    assert len(users)==1 and users[0]['status']=='active'
    assert users[0]['password_hash'].startswith('pbkdf2_sha256$100000$')
    auth=Auth(r.sql,r.passwords);token=run(auth.login('first-admin',PASSWORD,'test'))
    c.cookies.set(r.config.name('session'),token)
    assert c.get('/admin/profiles').status_code==200
    for url in ('/en','/zh','/en/news','/zh/news','/health'):
        assert c.get(url).status_code==200,url
    assert c.get('/setup').status_code==404
    assert submit(c).status_code==404


@pytest.mark.parametrize('value',['','short'])
def test_setup_disabled_without_strong_secret(site,value):
    c,r,env=site;env.TEACHER_SETUP_TOKEN=value
    assert c.get('/setup').status_code==404
    assert submit(c).status_code==404
    assert not run(r.sql.query('SELECT uid FROM auth_users'))


def test_bad_token_does_not_create_user(site):
    c,r,_=site
    result=submit(c,token='wrong')
    assert result.status_code==403 and TOKEN not in result.text
    assert not run(r.sql.query('SELECT uid FROM auth_users'))


def test_missing_or_foreign_origin(site):
    c,r,_=site
    data={'token':TOKEN,'username':'first-admin','password':PASSWORD,'confirm':PASSWORD}
    for headers in ({},{'Origin':'null'},{'Origin':'https://other.test'}):
        assert c.post('/setup',data=data,headers=headers).status_code==403
    assert not run(r.sql.query('SELECT uid FROM auth_users'))


def test_password_mismatch(site):
    c,r,_=site
    assert submit(c,confirm='different').status_code==422
    assert not run(r.sql.query('SELECT uid FROM auth_users'))


def test_payload_cap_and_no_password_echo(site):
    c,r,_=site
    assert submit(c,password='x'*9000).status_code==413
    result=submit(c,username='<script>alert(1)</script>')
    assert result.status_code==422 and '<script>' not in result.text


def test_marker_prevents_reinitialization_even_without_users(site):
    c,r,_=site
    run(r.sql.batch([("INSERT INTO auth_bootstrap_state(id,completed_at,user_uid) VALUES(1,'2026-01-01T00:00:00.000Z','removed')",())]))
    assert submit(c).status_code==404


def test_bootstrap_failure_rolls_back_all_writes(site):
    c,r,_=site
    run(r.sql.batch([("INSERT INTO auth_roles(uid,name) VALUES('role-registered','existing')",())]))
    assert submit(c).status_code==409
    assert not run(r.sql.query('SELECT uid FROM auth_users'))
    assert not run(r.sql.query('SELECT id FROM auth_bootstrap_state'))


def test_schema_missing_gives_instructions(site):
    c,r,_=site
    class Missing:
        async def query(self,*args):raise RuntimeError('D1_ERROR: no such table: auth_users')
    r.sql=Missing()
    response=c.get('/setup')
    assert response.status_code==503 and 'database/schema.sql' in response.text
    assert 'D1_ERROR' not in response.text


def test_hash_failure_has_safe_message_and_no_writes(site, capsys):
    c,r,_=site
    class Broken:
        async def hash(self, password):
            raise RuntimeError('NotSupportedError Pbkdf2 '+password+' '+TOKEN)
    r.passwords=Broken()
    response=submit(c)
    assert response.status_code==503 and 'SETUP-HASH' in response.text
    assert 'before administrator writes' in response.text
    output=capsys.readouterr().out
    assert 'SETUP-HASH' in output and 'RuntimeError' in output
    for text in (output,response.text):
        assert PASSWORD not in text and TOKEN not in text and 'NotSupportedError' not in text
    assert not run(r.sql.query('SELECT uid FROM auth_users'))
    assert not run(r.sql.query('SELECT id FROM auth_bootstrap_state'))


def test_unknown_write_failure_does_not_claim_no_writes(site, monkeypatch, capsys):
    c,r,_=site
    async def broken(*args, **kwargs):raise RuntimeError('private-db-message '+TOKEN)
    monkeypatch.setattr(r.sql, 'batch', broken)
    response=submit(c)
    assert response.status_code==500 and 'could not be confirmed' in response.text
    assert 'before administrator writes' not in response.text
    output=capsys.readouterr().out
    assert 'SETUP-SUBMIT' in output
    assert 'private-db-message' not in output+response.text and TOKEN not in output+response.text


def test_query_failure_has_safe_diagnostic(site, capsys):
    c,r,_=site
    class Broken:
        async def query(self,*args):raise RuntimeError('secret-query '+TOKEN)
    r.sql=Broken()
    response=c.get('/setup')
    assert response.status_code==503 and 'SETUP-CHECK' in response.text
    output=capsys.readouterr().out
    assert 'SETUP-CHECK' in output
    assert TOKEN not in output+response.text and 'secret-query' not in output+response.text


def test_password_change_uses_shared_cost_and_revokes_old_session(site):
    c,r,_=site
    assert submit(c).status_code==200
    auth=Auth(r.sql,r.passwords)
    token=run(auth.login('first-admin',PASSWORD,'change-test'))
    principal=run(auth.principal(token))
    new_password='Changed-密码-100000'
    run(auth.password(principal,PASSWORD,new_password))
    assert run(auth.principal(token)) is None
    from backend.app.native.catalog import Error
    with pytest.raises(Error):run(auth.login('first-admin',PASSWORD,'change-old'))
    assert run(auth.login('first-admin',new_password,'change-new'))
    row=run(r.sql.query('SELECT password_hash FROM auth_users'))[0]
    assert row['password_hash'].startswith('pbkdf2_sha256$100000$')
