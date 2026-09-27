"""Private project data stays out of public SQL and all public rendering paths."""
import pytest
from test_accounts_regression import fixture,run,user,role
from test_public_home_step2 import add
from test_public_cards_v55 import article
from backend.app.native.public_data import public_listing

@pytest.mark.parametrize('change',['ordinary_with_project_permissions','admin_role_removed','password_change_required'])
def test_private_projection_rechecks_live_identity(fixture,monkeypatch,change):
    c,r=fixture
    uid=add(r,'projects','Public title',principal='HIDDEN_PI',members='HIDDEN_TEAM',amount='4321.2345',status='RUNNING')
    assert 'HIDDEN_PI' in c.get('/zh/projects').text
    if change=='password_change_required':
        run(r.sql.batch([('UPDATE auth_users SET must_change_password=1 WHERE uid=?',(r.p['uid'],))]))
    else:
        target=role(r)
        run(r.sql.batch([("INSERT INTO auth_permissions(uid,role_uid,module,can_view,can_edit,can_create,can_delete,can_export) VALUES ('test-projects-all',?,'projects',1,1,1,1,1)",(target['uid'],))]))
        if change=='admin_role_removed':
            run(r.sql.batch([('UPDATE auth_users SET role_uid=? WHERE uid=?',(target['uid'],r.p['uid']))]))
        else:
            account=user(r,target['uid']);c.cookies.set('ts_session',run(r.auth.login(account['username'],'Synthetic-only-password-035','project73')))
    original=r.sql.query;reads=[]
    async def collect(sql,args=()):
        if sql.startswith('SELECT ') and 'FROM "projects"' in sql:reads.append(sql)
        return await original(sql,args)
    monkeypatch.setattr(r.sql,'query',collect)
    response=c.get('/en/projects?admin=1&is_system=1',headers={'X-Public-Fragment':'1'})
    assert response.status_code==200
    assert all(value not in response.text for value in ('HIDDEN_PI','HIDDEN_TEAM','43,212,345'))
    assert reads and all(all('"'+key+'"' not in sql for key in ('principal','members','amount')) for sql in reads)
    r.p=run(r.auth.principal(c.cookies.get('ts_session')))
    data=run(public_listing(r,'projects',{}))
    assert all(key not in data['rows'][0] for key in ('principal','members','amount'))

@pytest.mark.parametrize('lang',['zh','en'])
def test_status_unique_right_slot_and_no_empty_slot(fixture,lang):
    c,r=fixture
    uid=add(r,'projects','TITLE73',principal='PRINCIPAL73',members='MEMBERS73',status='STATUS73',is_featured=1)
    for path in ('/'+lang,'/'+lang+'/projects'):
        text=article(c.get(path).text,uid)
        assert 'project-with-status' in text and 'class="project-main"' in text
        assert text.count('STATUS73')==1 and text.index('MEMBERS73')<text.index('STATUS73')
    run(r.sql.batch([('UPDATE projects SET status=NULL WHERE uid=?',(uid,))]))
    text=article(c.get('/'+lang+'/projects').text,uid)
    assert 'project-with-status' not in text and 'project-status content-status' not in text
