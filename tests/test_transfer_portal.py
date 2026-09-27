"""Frontend rendering and approved route integration against isolated storage."""
from pathlib import Path
from jinja2 import Environment,FileSystemLoader,StrictUndefined,select_autoescape
ROOT=Path(__file__).resolve().parents[1]
def render(**values):
    env=Environment(loader=FileSystemLoader(ROOT/'transfer/frontend/native'),undefined=StrictUndefined,autoescape=select_autoescape())
    context=dict(csrf='',user_key='',max_file_bytes=0,teacher_origin='https://example.org',username='',manager=False,send_error='',tasks_url='/')
    return env.get_template('portal.html').render(**(context|values))
def test_guest_has_no_upload_and_has_receive():
    html=render()
    assert 'id="file" type="file" disabled' in html
    assert 'id="receive"' in html
    assert 'href="/admin"' not in html
    assert '匿名用户不能上传' in html

def test_identity_escaped_and_no_admin_assets():
    html=render(user_key='key',username='<img src=x>',csrf='" bad="x',max_file_bytes=123,manager=True,tasks_url='/tasks')
    assert '&lt;img src=x&gt;' in html
    assert 'data-csrf="&#34; bad=&#34;x"' in html
    assert '/assets/admin' not in html
    assert '/admin' in html
    assert 'data-max-file="123"' in html

# Exercise the actual shared route factory against isolated SQLite/local storage.
import time
from starlette.testclient import TestClient
from backend.app.native.bridge import sign
from transfer.backend.native import app_factory
from test_transfer_step5 import setup,save,custom,run

def test_root_guest_and_expired_session_render_receiver(setup):
    c,s,p,r=setup
    for token in ('',sign(r.secret,{**p,'exp':time.time()-1})):
        with TestClient(app_factory(lambda request:r)) as guest:
            if token:guest.cookies.set('ft_session',token)
            response=guest.get('/')
            assert response.status_code==200
            assert 'data-portal' in response.text and 'data-user=""' in response.text
            assert 'id="file" type="file" disabled' in response.text
            assert guest.get('/tasks',follow_redirects=False).headers['location']=='/login'
            assert guest.get('/admin',follow_redirects=False).headers['location']=='/login'
            assert guest.post('/api/tasks',json={'name':'x','size':1}).status_code==401
            assert response.headers['cache-control']=='no-store'

def test_root_context_limits_and_unchanged_management(setup):
    c,s,p,r=setup
    assert save(c,maxFileBytes='100',customRules=[custom(maxFileBytes='7')]).status_code==200
    response=c.get('/')
    assert response.status_code==200 and 'data-max-file="7"' in response.text
    assert 'data-csrf="synthetic-csrf"' in response.text and 'href="/tasks"' in response.text
    assert 'href="/admin"' in response.text
    assert 'totalWeeklyBytes' not in response.text and 'customRules' not in response.text
    for path in ('/tasks','/admin'):
        page=c.get(path)
        assert page.status_code==200 and 'id="task-panel"' in page.text
        assert 'data-portal' not in page.text
    assert c.post('/api/tasks',json={'_csrf':p['csrf'],'name':'x','size':8},headers={'Origin':r.origin}).status_code==403

def test_policy_denial_still_allows_opening_receiver(setup):
    c,s,p,r=setup
    assert save(c,allowUploads=False).status_code==200
    response=c.get('/')
    assert response.status_code==200
    assert 'data-max-file="0"' in response.text and '此方向的传输已关闭' in response.text
    assert 'id="receive"' in response.text

def test_ordinary_tasks_are_scoped_and_admin_stays_forbidden(setup):
    c,s,p,r=setup
    assert save(c).status_code==200
    run(s.create(p,'private-admin.txt',1))
    other={**p,'uid':'ordinary','username':'<b>Member</b>'}
    run(s.create(other,'my-file.txt',1))
    c.cookies.set('ft_session',sign(r.secret,other))
    page=c.get('/')
    assert '&lt;b&gt;Member&lt;/b&gt;' in page.text and 'href="/admin"' not in page.text
    assert c.get('/admin').status_code==403
    tasks=c.get('/tasks')
    assert tasks.status_code==200 and 'my-file.txt' in tasks.text
    assert 'private-admin.txt' not in tasks.text

def test_new_page_does_not_download_or_consume_download_count(setup):
    c,s,p,r=setup
    assert save(c,guestReceive=True).status_code==200
    task=run(s.create(p,'sample.txt',4))
    run(s.chunk(p,task['id'],0,b'abcd'))
    with TestClient(app_factory(lambda request:r)) as guest:
        assert guest.get('/').status_code==200
        assert run(s.task(task['id'],p))['downloads']==0
        assert guest.get('/s/'+task['token']).content==b'abcd'
        assert run(s.task(task['id'],p))['downloads']==1
    assert save(c,revision=1,guestReceive=False).status_code==200
    with TestClient(app_factory(lambda request:r)) as guest:
        assert guest.get('/').status_code==200
        assert guest.get('/s/'+task['token']).status_code==403
    assert run(s.task(task['id'],p))['downloads']==1

def test_bridge_returns_to_new_root_and_checkpoint_remains_usable(setup):
    c,s,p,r=setup
    assert save(c).status_code==200
    claims={**p,'aud':'transfer-bridge','nonce':'portal-bridge-test','exp':time.time()+60}
    response=c.post('/bridge',data={'ticket':sign(r.secret,claims)},headers={'Origin':r.teacher_origin},follow_redirects=False)
    assert response.status_code==303 and response.headers['location']=='/'
    assert 'data-portal' in c.get('/').text
    task=run(s.create(p,'resume.txt',4));run(s.chunk(p,task['id'],0,b'ab'))
    point=c.get('/api/tasks/'+task['id']).json()
    assert point['parts'][0]['size']==2 and point['state']=='uploading'
    run(s.chunk(p,task['id'],2,b'cd'))
    assert c.get('/api/tasks/'+task['id']).json()['state']=='ready'
