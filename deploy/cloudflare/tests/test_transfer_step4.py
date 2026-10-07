"""Adapter HTTP integration against disposable SQLite and object-store substitute."""
import asyncio
import json
from pathlib import Path
import sys
import pytest
from fastapi.testclient import TestClient
HERE=Path(__file__).resolve().parents[1];ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(HERE));sys.path.insert(0,str(ROOT/'tests'))
from runtime.transfer import install
from runtime.cleanup import run as cleanup, LEASE, STATUS
from backend.app.config import Settings
from backend.app.native.runtime import local
from backend.app.native.web import create_app
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from backend.app.native.storage import LocalStore
from backend.app.security.http import AuthConfig
from test_transfer_integration_v66 import enabled
from test_transfer_lan_v68 import setting
from test_transfer_codes_v95 import (test_live_issue_resolve_cancel_and_sender_fences,
    test_offline_receive_capability_revoke_and_old_link, test_offline_download_and_expiry,
    test_policy_csrf_shape_and_lookup_throttle)
from test_transfer_integration_v66 import test_live_permissions_csrf_and_logout
from test_transfer_folder_v82 import test_empty_root_and_zero_file
from test_transfer_relay_v69 import (test_ready_reserves_both_directions_and_one_block_window, test_source_and_receiver_permissions_and_request_bounds)
from test_transfer_live_folder_v84 import test_relay_folder_uses_existing_one_chunk_ack_and_double_direction_quota
from test_transfer_folder_receive_v83 import test_folder_session_manifest_metering_and_explicit_final_save
run=asyncio.run

@pytest.fixture
def fixture(tmp_path):
    r=local(Settings(tmp_path));r.config=AuthConfig.from_origin('https://teacher.example.test')
    r.auth=Auth(r.sql,r.passwords);run(r.auth.bootstrap('test-admin','Password-only-for-test'))
    token=run(r.auth.login('test-admin','Password-only-for-test','test'));r.p=run(r.auth.principal(token))
    r.content=Content(r.sql,r.auth)
    app=create_app(lambda request:r)
    source=ROOT/'transfer/frontend/native'
    templates={p.name:p.read_text() for p in source.glob('*.html')}
    store=LocalStore(tmp_path/'transfer-objects');cache=LocalStore(tmp_path/'transfer-cache')
    child=install(app,lambda request:r,templates,(source/'transfer-i18n-catalog.js').read_text(),lambda main:(store,cache))
    r.test_store=store;r.test_child=child
    with TestClient(app,base_url=r.config.origin) as c:
        c.cookies.set(r.config.name('session'),token)
        yield c,r


def headers(r):return {'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf']}


def upload(c,r):
    row=c.post('/transfer/api/tasks',json={'name':'sample.txt','size':3},headers=headers(r))
    assert row.status_code==200,row.text
    task=row.json()
    response=c.post('/transfer/api/tasks/'+task['id']+'/chunk',content=b'abc',headers={**headers(r),'X-Offset':'0'})
    assert response.status_code==200,response.text
    return task


def test_portal_admin_and_r2_status(fixture):
    c,r=fixture;enabled(c,r)
    for lang in ('en','zh'):
        response=c.get('/transfer/?lang='+lang);assert response.status_code==200,response.text
        assert 'public-header' in response.text or '/assets/public/' in response.text
    assert c.get('/admin/transfer').status_code==200
    assert 'data-transfer-admin' in c.get('/admin/transfer').text
    status=c.get('/transfer/api/storage-status');assert status.status_code==200
    assert status.json()['storage_kind']=='r2'
    assert 'disk_free_bytes' not in status.json()
    c.cookies.clear();assert c.get('/transfer/api/storage-status').status_code==403
    assert c.get('/transfer/login',follow_redirects=False).headers['location'].startswith('/auth/login')


def test_cron_expiry_preserves_active_and_removes_objects(fixture):
    c,r=fixture;enabled(c,r);setting(r,lambda d:d.update(wanRateKbps=None))
    expired=upload(c,r);active=upload(c,r)
    run(r.sql.batch([('UPDATE temporary_shares SET expires_at=0 WHERE id=?',(expired['id'],))]))
    result=run(cleanup(r.sql,r.test_store));assert result['completed_tasks']==1
    assert not list((r.test_store.root/expired['id']).glob('*.part'))
    assert c.get('/transfer/s/'+active['token']).content==b'abc'
    assert not run(r.sql.query('SELECT value FROM service_meta WHERE key=?',(LEASE,)))
    if not result['more']: assert run(cleanup(r.sql,r.test_store))['skipped']=='interval'


def test_cleanup_disabled_and_lease(fixture):
    c,r=fixture;enabled(c,r)
    setting(r,lambda d:d.update(temporaryAutoCleanup=False))
    assert run(cleanup(r.sql,r.test_store))=={'skipped':'disabled'}
    setting(r,lambda d:d.update(temporaryAutoCleanup=True))
    run(r.sql.batch([('INSERT INTO service_meta(key,value) VALUES(?,?)',(LEASE,json.dumps({'until':10**15})))]))
    assert run(cleanup(r.sql,r.test_store))=={'skipped':'busy'}


def test_failed_delete_keeps_checkpoint_and_releases_lease(fixture):
    c,r=fixture;enabled(c,r);setting(r,lambda d:d.update(wanRateKbps=None))
    row=upload(c,r);run(r.sql.batch([('UPDATE temporary_shares SET expires_at=0 WHERE id=?',(row['id'],))]))
    async def fail(key):raise OSError('simulated R2 failure')
    r.test_store.delete=fail
    with pytest.raises(RuntimeError,match='checkpoint retained'):run(cleanup(r.sql,r.test_store))
    assert run(r.sql.query('SELECT state FROM recovery_tasks WHERE id=?',(row['id'],)))[0]['state']=='cleanup_failed'
    assert not run(r.sql.query('SELECT value FROM service_meta WHERE key=?',(LEASE,)))


def test_both_peers_and_encoded_routes_use_one_coordinator():
    from runtime.routing import dispatch
    from types import SimpleNamespace
    names=[];forwarded=[];local=[]
    class Namespace:
        def idFromName(self,name):names.append(name);return name
        def get(self,name):return self
        async def fetch(self,request):forwarded.append(request);return 'coordinator'
    async def fetch(*args):local.append(args);return 'main'
    env=SimpleNamespace(TRANSFER_COORDINATOR=Namespace())
    for path in ('/transfer/api/relay/create','/transfer/api/codes/resolve','/%74ransfer/api/relay/chunk','/admin/transfer'):
        request=SimpleNamespace(url='https://site.test'+path,headers={'cookie':'session'},body=b'original')
        assert run(dispatch(None,request,env,None,fetch))=='coordinator'
        assert forwarded[-1] is request
    assert len(set(names))==1
    for path in ('/en','/transfer-static/portal.js','/admin/profiles'):
        assert run(dispatch(None,SimpleNamespace(url='https://site.test'+path),env,None,fetch))=='main'
    assert len(local)==3
