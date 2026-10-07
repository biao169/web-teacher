"""Actual form defaults, login/password workflow and transactional admin protection."""
from html.parser import HTMLParser
import re
import sqlite3
import uuid
import pytest
from starlette.testclient import TestClient
from test_accounts_regression import fixture,run,user,role,row,delete,remaining
from backend.app.native.accounts import deletion_blocks
from backend.app.native.catalog import Error

class EditorForm(HTMLParser):
    def __init__(self,html):
        super().__init__();self.values={};self.options={};self.active=False;self.select=None;self.textarea=None;self.feed(html)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='form':self.active=a.get('id')=='native-editor'
        if not self.active:return
        if tag=='input' and a.get('name') and 'disabled' not in a:
            if a.get('type') not in ('checkbox','radio') or 'checked' in a:self.values[a['name']]=a.get('value','')
        if tag=='select':self.select=a.get('name');self.options[self.select]=[]
        if tag=='option' and self.select:
            value=a.get('value','');self.options[self.select].append(value)
            if self.select not in self.values or 'selected' in a:self.values[self.select]=value
        if tag=='textarea':self.textarea=a.get('name');self.values[self.textarea]=''
    def handle_data(self,data):
        if self.active and self.textarea:self.values[self.textarea]+=data
    def handle_endtag(self,tag):
        if tag=='form':self.active=False
        if tag=='select':self.select=None
        if tag=='textarea':self.textarea=None

def challenge(html,name):return re.search('name="'+name+'" value="([^"]+)"',html)[1]

@pytest.mark.parametrize('administrator',[False,True])
def test_real_form_create_login_change_password_and_delete(fixture,administrator):
    c,r=fixture;selected_role=r.p['role_uid'] if administrator else role(r)['uid']
    page=c.get('/admin/auth_users/new');assert page.status_code==200
    form=EditorForm(page.text)
    assert form.values['status']=='active' and form.values['must_change_password']=='1'
    assert form.values['role_uid']==''
    assert '（系统管理员）' in page.text
    username='form-'+uuid.uuid4().hex;password='Synthetic-form-password-037'
    form.values.update(username=username,display_name='表单创建测试',role_uid=selected_role,_password=password,_password_confirm=password,_action='return')
    response=c.post('/admin/auth_users/save',data=form.values,headers={'Origin':r.config.origin},follow_redirects=False)
    assert response.status_code==303,response.text
    target=run(r.sql.query('SELECT * FROM auth_users WHERE username=?',(username,)))[0]
    assert target['status']=='active' and target['must_change_password']==1
    listing=c.get('/admin/auth_users').text
    fragment=re.search('<tr data-uid="'+target['uid']+'".*?</tr>',listing,re.S)[0]
    assert 'data-delete title=' in fragment and 'native-protection-reason' not in fragment
    with TestClient(c.app,base_url=r.config.origin) as login:
        def authenticate(secret):
            page=login.get('/auth/login')
            return login.post('/auth/login',data={'challenge':challenge(page.text,'challenge'),'username':username,'password':secret},headers={'Origin':r.config.origin},follow_redirects=False)
        assert authenticate(password).status_code==303
        assert login.get('/admin',follow_redirects=False).headers['location']=='/auth/password'
        page=login.get('/auth/password')
        result=login.post('/auth/password',data={'_csrf':challenge(page.text,'_csrf'),'current':password,'password':password+'-new'},headers={'Origin':r.config.origin},follow_redirects=False)
        assert result.status_code==303
        assert authenticate(password+'-new').status_code==303
        assert login.get('/admin').status_code==200
        target=row(r,'auth_users',target['uid'])
        assert delete(c,r,'auth_users',target).status_code==200
        assert login.get('/admin',follow_redirects=False).status_code==303
    assert remaining(r,'auth_users',r.p['uid'])

def test_disabled_role_is_not_selectable_and_forged_assignment_is_rejected(fixture):
    c,r=fixture;disabled=role(r)
    run(r.sql.batch([('UPDATE auth_roles SET is_active=0 WHERE uid=?',(disabled['uid'],))]))
    form=EditorForm(c.get('/admin/auth_users/new').text)
    assert disabled['uid'] not in form.options['role_uid']
    with pytest.raises(Error):user(r,disabled['uid'])
    assert not run(r.sql.query('SELECT uid FROM auth_users WHERE role_uid=?',(disabled['uid'],)))

def test_disabled_existing_account_is_not_silently_enabled(fixture):
    c,r=fixture;target=user(r,status='disabled')
    form=EditorForm(c.get('/admin/auth_users/'+target['uid']+'/edit').text)
    assert form.values['status']=='disabled'
    assert row(r,'auth_users',target['uid'])['status']=='disabled'

def test_last_available_admin_has_explicit_reason(fixture):
    _,r=fixture;target=user(r,r.p['role_uid'])
    run(r.sql.batch([("UPDATE auth_users SET status='disabled' WHERE uid=?",(r.p['uid'],))]))
    blocked=run(deletion_blocks(r.sql,r.p,'auth_users',[target]))
    assert blocked[target['uid']]=='最后一个可用系统管理员受保护'
    with pytest.raises(Error):run(r.content.delete('auth_users',r.p,target['uid'],target['updated_at']))

def test_competing_admin_deletions_leave_one_available_admin(fixture,monkeypatch):
    _,r=fixture;a=user(r,r.p['role_uid']);b=user(r,r.p['role_uid'])
    pa=run(r.auth.principal(run(r.auth.login(a['username'],'Synthetic-only-password-035','test'))))
    pb=run(r.auth.principal(run(r.auth.login(b['username'],'Synthetic-only-password-035','test'))))
    run(r.sql.batch([("UPDATE auth_users SET status='disabled' WHERE uid=?",(r.p['uid'],))]))
    original=r.sql.batch;injected=False
    async def intercept(statements):
        nonlocal injected
        if not injected and any(sql.startswith('DELETE FROM "auth_users"') and args==(b['uid'],) for sql,args in statements):
            injected=True
            await r.content.delete('auth_users',pb,a['uid'],a['updated_at'])
        return await original(statements)
    monkeypatch.setattr(r.sql,'batch',intercept)
    with pytest.raises(sqlite3.IntegrityError):run(r.content.delete('auth_users',pa,b['uid'],b['updated_at']))
    assert injected and not remaining(r,'auth_users',a['uid']) and remaining(r,'auth_users',b['uid'])

def test_role_disabled_between_validation_and_commit_rolls_back_creation(fixture,monkeypatch):
    _,r=fixture;selected=role(r);original=r.sql.batch;changed=False
    async def intercept(statements):
        nonlocal changed
        if not changed and any(sql.startswith('INSERT INTO "auth_users"') for sql,args in statements):
            changed=True;await original([('UPDATE auth_roles SET is_active=0 WHERE uid=?',(selected['uid'],))])
        return await original(statements)
    monkeypatch.setattr(r.sql,'batch',intercept)
    with pytest.raises(sqlite3.IntegrityError):user(r,selected['uid'])
    assert changed and not run(r.sql.query('SELECT uid FROM auth_users WHERE role_uid=?',(selected['uid'],)))

def test_grouped_navigation_preserves_custom_order_and_active_entry(fixture):
    c,r=fixture;ids=[]
    for n in (2,1):
        ids.append(run(r.content.save('navigation_items',r.p,{'title':'自定义'+str(n),'url_name':'custom-'+str(n),'location':'admin-sidebar','path':'/admin/profiles','visibility':'public','enabled':1,'sort_order':n})))
    page=c.get('/admin/n/custom-1');assert page.status_code==200
    html=page.text
    assert html.index('data-menu-key="'+ids[1]+'"')<html.index('data-menu-key="'+ids[0]+'"')
    assert re.search('data-menu-key="'+ids[1]+'"[^>]*aria-current="page"',html)
    assert all(label in html for label in ['内容管理','资源与工具','网站配置','系统管理','自定义入口'])
    dashboard=c.get('/admin');assert dashboard.status_code==200 and 'native-overview-group' in dashboard.text
