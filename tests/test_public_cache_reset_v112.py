"""Module whitelist, real live admin/CSRF checks and honest non-edge handling."""
import pytest
from test_accounts_regression import fixture,run,role,user
from backend.app.native.public_cache_tags import RESET_HEADER,RESET_MODULES,reset_plan
PATH='/api/admin/public-cache/reset'
def reset(c,r,module='profiles',**extra):
    return c.post(PATH,json={'module':module,'_csrf':r.p['csrf'],**extra},headers={'Origin':r.config.origin,'Accept':'application/json'})
@pytest.mark.parametrize('module',RESET_MODULES)
def test_worker_accepts_only_a_single_module_and_returns_internal_pending(fixture,module):
    c,r=fixture;r.kind='r2';response=reset(c,r,module)
    assert response.status_code==202,response.text
    assert response.headers[RESET_HEADER]==module
    assert response.json()['page_cache']=='pending'
    assert response.json()['data_cache']==('not_applicable' if module=='home' else 'pending')
    assert response.headers['cache-control']==response.headers['cloudflare-cdn-cache-control']=='no-store'
    assert len(reset_plan(module).purge)==1 and not reset_plan(module).invalidate
@pytest.mark.parametrize('module',['public-profiles','all','HOME','/en/profiles','',None,[],{'purgeEverything':True}])
def test_invalid_modules_do_not_emit_controls(fixture,module):
    c,r=fixture;r.kind='r2';response=reset(c,r,module)
    assert response.status_code==400 and RESET_HEADER not in response.headers

def test_arbitrary_tags_action_and_urls_rejected(fixture):
    c,r=fixture;r.kind='r2'
    for extra in [{'tags':['public-layout']},{'action':'invalidate'},{'url':'/en'},{'purgeEverything':True}]:
        response=reset(c,r,**extra);assert response.status_code==400 and RESET_HEADER not in response.headers

def test_local_has_no_edge_purge_and_maintenance_section_explains_it(fixture):
    c,r=fixture;response=reset(c,r)
    assert response.status_code==200 and response.json()['page_cache']==response.json()['data_cache']=='not_applicable'
    assert RESET_HEADER not in response.headers
    page=c.get('/admin/runtime-maintenance');assert 'data-public-cache' in page.text and '没有共享 Workers Cache' in page.text

def test_worker_workspace_has_nine_module_buttons(fixture):
    c,r=fixture;r.kind='r2';page=c.get('/admin/runtime-maintenance')
    assert page.status_code==200 and page.text.count('data-public-cache-module=')==9
    assert 'native-public-cache.js?v=0.16.112' in page.text

def test_csrf_and_live_permissions_cannot_be_bypassed(fixture):
    c,r=fixture;r.kind='r2'
    response=c.post(PATH,json={'module':'profiles','_csrf':'wrong'},headers={'Origin':r.config.origin});assert response.status_code==403
    response=c.post(PATH,json={'module':'profiles','_csrf':r.p['csrf']},headers={'Origin':'https://evil.test'});assert response.status_code==403
    run(r.sql.batch([("UPDATE auth_permissions SET can_delete=0 WHERE role_uid=? AND module='global_settings'",(r.p['role_uid'],))]))
    assert reset(c,r).status_code==403

def test_ordinary_and_revoked_users_cannot_reset(fixture):
    c,r=fixture;r.kind='r2';u=user(r,role(r)['uid']);c.cookies.set('ts_session',run(r.auth.login(u['username'],'Synthetic-only-password-035','cache-reset')))
    p=run(r.auth.principal(c.cookies.get('ts_session')));r.p=p
    assert reset(c,r).status_code==403
    run(r.auth.logout(p));assert reset(c,r).status_code==401
