"""Login display is server-confirmed and never a shared authorization cache."""
import pytest
from test_accounts_regression import fixture,run
from test_public_auth_v65 import form,send
from backend.app.native.catalog import Error

def test_login_handoff_exact_fields_without_rechecking_principal(fixture,monkeypatch):
    c,r=fixture;c.cookies.clear();_,challenge=form(c,query='?lang=en')
    async def forbidden(*args,**kwargs):raise AssertionError('Login must not re-query a principal')
    monkeypatch.setattr(r.auth,'principal',forbidden)
    monkeypatch.setattr(r.auth,'public_principal',forbidden)
    response=send(c,r,'login',dict(challenge=challenge[1],username='list-test-admin',password='Synthetic-test-only-032',lang='en'),True)
    assert response.status_code==200
    result=response.json();assert result['redirect']=='/admin'
    identity=result['identity'];assert set(identity)=={'authenticated','username','display_name','can_enter_admin','checked_at'}
    assert identity['authenticated'] is True and identity['username']=='list-test-admin'
    assert identity['can_enter_admin'] is True
    assert response.headers['cache-control']=='no-store'
    assert response.headers['cloudflare-cdn-cache-control']=='no-store'
    assert c.cookies.get('ts_session')

def test_no_identity_on_failed_login(fixture):
    c,r=fixture;c.cookies.clear();_,challenge=form(c)
    response=send(c,r,'login',dict(challenge=challenge[1],username='missing-115',password='wrong',lang='en'),True)
    assert response.status_code==401 and 'identity' not in response.json()

def test_changed_user_during_password_check_cannot_receive_success(fixture,monkeypatch):
    _,r=fixture;verify=r.passwords.verify
    async def changed(password,encoded):
        result=await verify(password,encoded)
        await r.sql.batch([("UPDATE auth_users SET status='disabled' WHERE username='list-test-admin'",())])
        return result
    monkeypatch.setattr(r.passwords,'verify',changed)
    with pytest.raises(Error) as exc:run(r.auth.login('list-test-admin','Synthetic-test-only-032','115-race',with_display=True))
    assert exc.value.status==401

def test_password_change_required_snapshot_does_not_offer_admin(fixture):
    c,r=fixture
    run(r.sql.batch([("UPDATE auth_users SET must_change_password=1 WHERE username='list-test-admin'",())]))
    c.cookies.clear();_,challenge=form(c)
    response=send(c,r,'login',dict(challenge=challenge[1],username='list-test-admin',password='Synthetic-test-only-032',lang='en',next='/en/profiles'),True)
    assert response.status_code==200
    assert response.json()['identity']['authenticated'] is True
    assert response.json()['identity']['can_enter_admin'] is False
    assert response.json()['redirect']=='/en/profiles'
