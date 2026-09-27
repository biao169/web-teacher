"""Embedded management shares APIs/templates and preserves live permission gates."""
import re
from test_accounts_regression import fixture,run,user
from test_transfer_integration_v66 import enabled
from test_transfer_lan_v68 import headers


def test_management_is_rendered_in_teacher_workspace(fixture):
    c,r=fixture;enabled(c,r)
    response=c.get('/admin/transfer');assert response.status_code==200,response.text
    html=response.text
    for marker in ['workspace-sidebar','workspace-topbar','data-transfer-admin','id="transfer-controls"','id="transfer-tasks"','id="transfer-cache"','id="transfer-storage"','id="transfer-usage"']:
        assert marker in html,marker
    assert '<iframe' not in html and '打开快传管理' not in html
    assert html.count('<main ')==1 and html.count('<html ')==1
    assert 'id="send"' not in html
    assert 'data-csrf="'+r.p['csrf']+'"' in html
    assert response.headers['cache-control']=='no-store'
    assert c.get('/assets/admin/css/native-transfer.css').status_code==200
    old=c.get('/transfer/admin?q=demo&state=ready',follow_redirects=False)
    assert old.status_code==303 and old.headers['location']=='/admin/transfer?q=demo&state=ready'
    page=c.get(old.headers['location']).text
    assert 'name="q" value="demo"' in page


def test_embedded_save_and_refresh_keep_existing_contract(fixture):
    c,r=fixture;enabled(c,r)
    html=c.get('/admin/transfer').text
    revision=int(re.search(r'id="save-settings" data-revision="(\d+)"',html).group(1))
    result=c.post('/transfer/api/settings',json={'revision':revision,'totalDailyBytes':'123456'},headers=headers(r))
    assert result.status_code==200,result.text
    assert 'id="totalDailyBytes"' in c.get('/admin/transfer').text
    assert 'value="123456"' in c.get('/admin/transfer').text
    assert c.get('/transfer/api/tasks?q=missing').json()['total']==0
    assert c.post('/transfer/api/settings',json={'revision':revision},headers=headers(r)).status_code==409
    assert c.post('/transfer/api/settings',json={'revision':revision+1}).status_code==403


def test_view_only_user_sees_own_tasks_without_manager_controls(fixture):
    c,r=fixture;enabled(c,r)
    task=c.post('/transfer/api/tasks',json={'name':'private-admin-task','size':1},headers=headers(r));assert task.status_code==200
    run(r.sql.batch([("UPDATE auth_permissions SET can_view=1,can_create=0,can_edit=0,can_delete=0 WHERE role_uid='role-registered' AND module='transfer'",())]))
    u=user(r);token=run(r.auth.login(u['username'],'Synthetic-only-password-035','test'));c.cookies.set(r.config.name('session'),token)
    response=c.get('/admin/transfer');assert response.status_code==200,response.text
    assert '我的任务' in response.text and 'private-admin-task' not in response.text
    for marker in ('id="transfer-controls"','id="transfer-cache"','data-transfer-example="','id="save-settings"'):
        assert marker not in response.text
    assert c.get('/transfer/admin').status_code==403
    assert c.get('/transfer/api/admin/usage').status_code==403
    assert c.get('/transfer/api/cache').status_code==403
    assert c.get('/transfer/api/tasks').json()['total']==0
    run(r.sql.batch([("UPDATE auth_permissions SET can_view=0 WHERE role_uid='role-registered' AND module='transfer'",())]))
    assert c.get('/admin/transfer').status_code==403


def test_anonymous_cannot_read_embedded_management(fixture):
    c,r=fixture;c.cookies.clear()
    response=c.get('/admin/transfer',follow_redirects=False)
    assert response.status_code in (303,401)
    assert 'id="transfer-controls"' not in response.text
