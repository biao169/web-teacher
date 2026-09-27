"""Account deletion against disposable real SQLite/HTTP/template boundaries."""
import asyncio
import re
import sqlite3
import uuid
import pytest
from list_fixture import client_at
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from backend.app.native.catalog import Error

def run(value):return asyncio.run(value)

@pytest.fixture
def fixture(tmp_path):
    client,r=client_at(tmp_path)
    r.auth=Auth(r.sql,r.passwords);r.content=Content(r.sql,r.auth)
    r.p=run(r.auth.principal(client.cookies.get('ts_session')))
    yield client,r
    client.close()

def row(r,table,uid):return run(r.sql.query(f'SELECT * FROM {table} WHERE uid=?',(uid,)))[0]
def role(r):
    uid=run(r.content.save('auth_roles',r.p,{'name':'Test '+uuid.uuid4().hex,'level':1,'visibility_scopes':'["public"]','is_active':1},permissions={'profiles':['view']}))
    return row(r,'auth_roles',uid)
def user(r,role_uid='role-registered',**extra):
    uid=run(r.content.save('auth_users',r.p,{'username':'test-'+uuid.uuid4().hex,'display_name':'Synthetic','role_uid':role_uid,'status':'active','visibility':'public','must_change_password':0,**extra},password='Synthetic-only-password-035'))
    return row(r,'auth_users',uid)
def delete(client,r,table,target,**extra):
    return client.post('/api/admin/'+table+'/'+target['uid'],json={'action':'delete','_csrf':r.p['csrf'],'stamp':target['updated_at'],**extra},headers={'Origin':r.config.origin,'Accept':'application/json'})
def remaining(r,table,uid):return run(r.sql.query(f'SELECT uid FROM {table} WHERE uid=?',(uid,)))

def test_delete_user_cascades_sessions_preserves_audit_and_role(fixture):
    c,r=fixture;u=user(r)
    tokens=[run(r.auth.login(u['username'],'Synthetic-only-password-035','test')) for _ in range(2)]
    run(r.sql.batch([r.content.audit({'uid':u['uid'],'display_name':'Synthetic'},'profiles','view','history')]))
    assert delete(c,r,'auth_users',u).status_code==200
    assert not remaining(r,'auth_users',u['uid'])
    assert not run(r.sql.query('SELECT uid FROM auth_sessions WHERE user_uid=?',(u['uid'],)))
    assert all(run(r.auth.principal(t)) is None for t in tokens)
    assert remaining(r,'auth_roles',u['role_uid'])
    assert run(r.sql.query('SELECT uid FROM operation_logs WHERE actor_uid=?',(u['uid'],)))
    assert len(run(r.sql.query("SELECT uid FROM operation_logs WHERE target_uid=? AND action='delete'",(u['uid'],))))==1

def test_delete_unused_role_removes_grants_and_preserves_history(fixture):
    c,r=fixture;target=role(r)
    assert run(r.sql.query('SELECT uid FROM auth_permissions WHERE role_uid=?',(target['uid'],)))
    assert delete(c,r,'auth_roles',target).status_code==200
    assert not remaining(r,'auth_roles',target['uid'])
    assert not run(r.sql.query('SELECT uid FROM auth_permissions WHERE role_uid=?',(target['uid'],)))
    assert len(run(r.sql.query('SELECT uid FROM operation_logs WHERE target_uid=?',(target['uid'],))))==2

@pytest.mark.parametrize('kind',['self','bootstrap','system-role','default-role','used-role','disabled-hidden-member'])
def test_protected_records_reject_deletion(fixture,kind):
    c,r=fixture;table='auth_users'
    if kind=='self':target=row(r,table,r.p['uid'])
    elif kind=='bootstrap':
        initial=r.p['uid'];admin=user(r,r.p['role_uid']);token=run(r.auth.login(admin['username'],'Synthetic-only-password-035','test'))
        c.cookies.set('ts_session',token);r.p=run(r.auth.principal(token));target=row(r,table,initial)
    else:
        table='auth_roles'
        if kind=='system-role':target=row(r,table,r.p['role_uid'])
        elif kind=='default-role':target=row(r,table,'role-registered')
        else:
            target=role(r);user(r,target['uid'],**({'status':'disabled','visibility':'hidden'} if kind=='disabled-hidden-member' else {}))
    result=delete(c,r,table,target)
    assert result.status_code==409,result.text
    assert remaining(r,table,target['uid'])
    assert not run(r.sql.query("SELECT uid FROM operation_logs WHERE target_uid=? AND action='delete'",(target['uid'],)))

@pytest.mark.parametrize('table',['auth_users','auth_roles'])
def test_non_system_role_cannot_delete_even_with_grant(fixture,table):
    c,r=fixture;target=user(r) if table=='auth_users' else role(r);actor_role=role(r)
    run(r.sql.batch([('INSERT INTO auth_permissions(uid,role_uid,module,can_view,can_delete) VALUES (?,?,?,1,1)',(uuid.uuid4().hex,actor_role['uid'],table))]))
    actor=user(r,actor_role['uid']);token=run(r.auth.login(actor['username'],'Synthetic-only-password-035','test'))
    c.cookies.set('ts_session',token);r.p=run(r.auth.principal(token))
    assert delete(c,r,table,target).status_code==403
    page=c.get('/admin/'+table);assert page.status_code==200
    assert 'data-bulk-delete' not in page.text and 'data-delete title=' not in page.text
    assert remaining(r,table,target['uid'])

@pytest.mark.parametrize('failure',['csrf','origin','stamp','permission','scope'])
def test_shared_security_checks_still_apply(fixture,failure):
    c,r=fixture;u=user(r)
    if failure=='scope':
        with pytest.raises(Error):run(r.content.delete('auth_users',r.p,u['uid'],u['updated_at'],{'status':'disabled'}))
    elif failure=='origin':
        assert c.post('/api/admin/auth_users/'+u['uid'],json={'action':'delete','_csrf':r.p['csrf'],'stamp':u['updated_at']},headers={'Origin':'https://untrusted.invalid'}).status_code==403
    else:
        if failure=='permission':run(r.sql.batch([("UPDATE auth_permissions SET can_delete=0 WHERE role_uid=? AND module='auth_users'",(r.p['role_uid'],))]))
        result=delete(c,r,'auth_users',u,**({'_csrf':'invalid'} if failure=='csrf' else {'stamp':'stale'} if failure=='stamp' else {}))
        assert result.status_code==(409 if failure=='stamp' else 403),result.text
    assert remaining(r,'auth_users',u['uid'])

@pytest.mark.parametrize('race',['new-member','promoted-target','demoted-actor'])
def test_guard_rechecks_protection_at_commit(fixture,monkeypatch,race):
    c,r=fixture;table='auth_roles' if race=='new-member' else 'auth_users';target=role(r) if table=='auth_roles' else user(r)
    member=user(r) if race=='new-member' else None
    original=r.sql.batch;injected=False
    async def intercept(statements):
        nonlocal injected
        if not injected and any(sql.startswith('DELETE FROM "'+table+'"') for sql,args in statements):
            injected=True
            mutation=('UPDATE auth_users SET role_uid=? WHERE uid=?',(target['uid'],member['uid'])) if race=='new-member' else ('UPDATE auth_users SET role_uid=? WHERE uid=?',(r.p['role_uid'],target['uid'])) if race=='promoted-target' else ('UPDATE auth_roles SET is_system=0 WHERE uid=?',(r.p['role_uid'],))
            await original([mutation])
        return await original(statements)
    monkeypatch.setattr(r.sql,'batch',intercept)
    assert delete(c,r,table,target).status_code==409
    assert injected and remaining(r,table,target['uid'])
    if table=='auth_roles':assert run(r.sql.query('SELECT uid FROM auth_permissions WHERE role_uid=?',(target['uid'],)))

@pytest.mark.parametrize('table',['auth_users','auth_roles'])
def test_audit_failure_rolls_back_deletion_and_dependencies(fixture,monkeypatch,table):
    _,r=fixture;target=user(r) if table=='auth_users' else role(r)
    token=run(r.auth.login(target['username'],'Synthetic-only-password-035','test')) if table=='auth_users' else None
    monkeypatch.setattr(r.content,'audit',lambda *args:('INSERT INTO operation_logs(uid) VALUES (NULL)',()))
    with pytest.raises(sqlite3.IntegrityError):run(r.content.delete(table,r.p,target['uid'],target['updated_at']))
    assert remaining(r,table,target['uid'])
    if token:assert run(r.auth.principal(token))
    else:assert run(r.sql.query('SELECT uid FROM auth_permissions WHERE role_uid=?',(target['uid'],)))

def test_account_list_uses_shared_actions_and_protection_hints(fixture):
    c,r=fixture;u=user(r);empty=role(r)
    for table,allowed,blocked in [('auth_users',u['uid'],r.p['uid']),('auth_roles',empty['uid'],'role-registered')]:
        response=c.get('/admin/'+table);assert response.status_code==200
        html=response.text;assert 'data-bulk-delete' in html and 'data-delete-confirm="删除' in html
        for uid,expected in [(allowed,True),(blocked,False)]:
            fragment=re.search(r'<tr data-uid="'+uid+r'".*?</tr>',html,re.S).group()
            assert ('data-delete title=' in fragment)==expected
        response=c.get('/admin/'+table,headers={'X-Native-List':'1'})
        assert response.status_code==200 and 'data-delete-confirm="删除' in response.json()['html']
