"""Public project field scopes and shared frontend foundation at HTTP boundaries."""
import pytest
from test_accounts_regression import fixture,run,user,role
from test_public_home_step2 import add,configure,DOM
from test_public_stream_v46 import H

@pytest.mark.parametrize('identity',['anonymous','ordinary','other_manager','project_reader','admin','revoked'])
def test_project_private_fields_require_system_admin_and_permission_across_home_and_pages(fixture,identity):
    c,r=fixture
    for i in range(12):add(r,'projects','Visible project '+str(i),source='PUBLIC_SOURCE',principal='PRIVATE_PRINCIPAL',amount='2468.1234',members='PRIVATE_MEMBERS',is_featured=1)
    configure(r,homepage_project_limit=15)
    admin_token=c.cookies.get('ts_session')
    if identity=='anonymous':c.cookies.clear()
    elif identity in ('ordinary','other_manager','project_reader'):
        target_role=role(r) if identity!='ordinary' else {'uid':'role-registered'}
        if identity=='project_reader':run(r.sql.batch([("INSERT INTO auth_permissions(uid,role_uid,module,can_view) VALUES ('project-reader-grant',?,'projects',1)",(target_role['uid'],))]))
        account=user(r,target_role['uid']);token=run(r.auth.login(account['username'],'Synthetic-only-password-035','test'))
        c.cookies.set('ts_session',token)
    elif identity=='revoked':run(r.auth.logout(r.p))
    allowed=identity=='admin'
    for route in ['/zh','/en/projects','/zh/projects?page=2&admin=1','/zh/projects?home=1&page=2']:
        headers=H if 'page=2' in route else {}
        response=c.get(route,headers=headers);assert response.status_code==200,response.text
        html=response.json()['html'] if headers else response.text
        for value in ['PRIVATE_PRINCIPAL',('CNY 24,681,234' if route.startswith('/en') else '2468.1234 万元'),'PRIVATE_MEMBERS']:assert (value in html)==allowed
        assert response.headers['cache-control']=='no-store'
    if not allowed:
        assert c.get('/zh/projects?f.principal=PRIVATE_PRINCIPAL').status_code==422
        assert c.get('/api/public/people/projects/facets/members').status_code==404


def test_revoked_project_grant_takes_effect_on_next_fragment_and_sql_excludes_fields(fixture,monkeypatch):
    c,r=fixture
    uid=add(r,'projects','Public',principal='PRIVATE',amount='10',members='MEMBERS')
    assert 'PRIVATE' in c.get('/zh/projects?f.uid='+uid).text
    run(r.sql.batch([("UPDATE auth_permissions SET can_view=0 WHERE role_uid=? AND module='projects'",(r.p['role_uid'],))]))
    original=r.sql.query;reads=[]
    async def collect(sql,args=()):
        if 'FROM "projects"' in sql:reads.append(sql)
        return await original(sql,args)
    monkeypatch.setattr(r.sql,'query',collect)
    page=c.get('/zh/projects?f.uid='+uid,headers=H)
    assert page.status_code==200 and 'PRIVATE' not in page.json()['html']
    assert reads and all(all('"'+field+'"' not in sql for field in ('principal','amount','members')) for sql in reads)


def test_public_theme_controls_and_avatar_initials_without_admin_style_changes(fixture):
    c,r=fixture
    teacher=add(r,'profiles','欧阳明',name_en='Ming Ouyang',is_active=1)
    student=add(r,'students','示例学生 01 · 林沐',name_en='Demo Student 01 · Mu Lin')
    for table,uid,cn,en in [('profiles',teacher,'欧阳','MO'),('students',student,'林','ML')]:
        for lang,text in [('zh',cn),('en',en)]:
            page=c.get(f'/{lang}/{table}?f.uid={uid}').text
            assert '>'+text+'</span>' in page
            assert 'data-public-media' in page and 'data-back-top hidden' in page
            assert '/assets/shared/css/public-theme.css?v=0.15.100' in page
    for path in ['/admin/profiles']:
        assert '/assets/shared/css/public-theme.css' not in c.get(path).text
    assert '/assets/shared/css/public-theme.css' in c.get('/auth/login').text
    assert c.get('/assets/shared/css/public-theme.css').status_code==200
    assert c.get('/assets/shared/js/public-controls.js').status_code==200
