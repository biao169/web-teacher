"""Same-origin identity, stopped migration, rollback and runtime-data isolation."""
import asyncio,json,sqlite3
from pathlib import Path
import pytest
from test_accounts_regression import fixture,run,user
from backend.app.native.auth import Auth
from backend.app.native.database import Database,SCHEMA
from backend.app.native.locking import RuntimeLock
from backend.app.native.storage import LocalStore
from backend.app.config import Settings,PROJECT_ROOT
from transfer.backend.native import Transfers
from transfer.backend.identity import SessionSQL
from transfer.backend.migrate import import_legacy,rollback,content_hash


def enabled(c,r):
    assert c.get('/transfer/').status_code==200
    reply=c.post('/transfer/api/settings',json={'_csrf':r.p['csrf'],'revision':0,'enabled':True,'vpnGuard':False,'temporaryShare':True},headers={'Origin':r.config.origin})
    assert reply.status_code==200,reply.text


def test_same_site_main_cookie_only_and_local_urls(fixture):
    c,r=fixture;enabled(c,r)
    html=c.get('/transfer/').text
    assert 'content="/transfer"' in html and 'href="/transfer/tasks"' in html and 'href="/transfer/admin"' in html
    assert c.get('/transfer',follow_redirects=False).headers['location']=='/transfer/'
    assert c.get('/transfer/login',follow_redirects=False).headers['location']=='/transfer/'
    assert c.post('/transfer/bridge',json={}).status_code==410
    headers={'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf']}
    t=c.post('/transfer/api/tasks',json={'name':'测试.txt','size':4},headers=headers)
    assert t.status_code==200,t.text
    t=t.json();assert c.post('/transfer/api/tasks/'+t['id']+'/chunk',content=b'test',headers={**headers,'X-Offset':'0'}).status_code==200
    assert c.get('/transfer/s/'+t['token']).content==b'test'
    assert c.get('/transfer-data/files/'+t['id']+'/secret.part').status_code==404
    assert run(r.sql.query('SELECT count(*) n FROM temporary_shares'))[0]['n']==1
    assert not r.settings.transfer_database_path.exists()
    assert c.get('/transfer/api/tasks').status_code==200
    assert '/transfer/' in c.get('/admin/transfer').text
    # Old independently signed sessions confer no privilege on the integrated app.
    c.cookies.clear();c.cookies.set('ft_session','obsolete')
    assert c.get('/transfer/api/tasks').status_code==401
    assert c.get('/transfer/admin',follow_redirects=False).status_code==303
    assert c.get('/transfer/login',follow_redirects=False).headers['location'].startswith('/auth/login?')


def test_live_permissions_csrf_and_logout(fixture):
    c,r=fixture;enabled(c,r)
    assert c.post('/transfer/api/tasks',json={'name':'x','size':1},headers={'Origin':'https://wrong.example'}).status_code==403
    registered=user(r);token=run(r.auth.login(registered['username'],'Synthetic-only-password-035','test'))
    c.cookies.set(r.config.name('session'),token);p=run(r.auth.principal(token))
    assert c.get('/transfer/admin').status_code==403
    # Stale imported grants do not make a main-site ordinary user a manager.
    run(r.sql.batch([('INSERT INTO admin_grants VALUES (?,?,?)',(registered['uid'],'test','legacy'))]))
    assert c.get('/transfer/api/admin/usage').status_code==403
    assert c.get('/transfer/api/tasks').status_code==200
    run(r.sql.batch([("UPDATE auth_permissions SET can_view=0 WHERE role_uid='role-registered' AND module='transfer'",())]))
    assert c.get('/transfer/api/tasks').status_code==403
    run(r.sql.batch([("UPDATE auth_permissions SET can_view=1 WHERE role_uid='role-registered' AND module='transfer'",())]))
    sql=SessionSQL(r.sql,p,'create')
    run(r.auth.logout(p))
    assert c.get('/transfer/api/tasks').status_code==401
    # Request already in flight also cannot commit after its session is revoked.
    with pytest.raises(sqlite3.IntegrityError):run(sql.batch([("INSERT INTO service_meta VALUES ('forbidden','x')",())]))
    assert not run(r.sql.query("SELECT 1 FROM service_meta WHERE key='forbidden'"))


def test_upload_permission_rechecked_inside_transaction(fixture):
    c,r=fixture;enabled(c,r);sql=SessionSQL(r.sql,r.p,'create')
    run(r.sql.batch([("UPDATE auth_permissions SET can_create=0 WHERE role_uid=? AND module='transfer'",(r.p['role_uid'],))]))
    with pytest.raises(sqlite3.IntegrityError):run(sql.batch([("INSERT INTO service_meta VALUES ('forbidden','x')",())]))
    response=c.post('/transfer/api/tasks',json={'name':'x','size':1,'_csrf':r.p['csrf']},headers={'Origin':r.config.origin})
    assert response.status_code==403


def legacy(tmp_path):
    settings=Settings(tmp_path/'main');settings.database_path.parent.mkdir(parents=True)
    Database(settings.database_path).initialize()
    old=Database(tmp_path/'old.sqlite','transfer');old.initialize();store=LocalStore(tmp_path/'old-files');cache=tmp_path/'old-cache';cache.mkdir();(cache/'old.txt').write_bytes(b'cache')
    service=Transfers(old,store);run(service.initialize('legacy-manager'))
    # Synthetic active upload with a real immutable part and old UID/owner preserved.
    from transfer.backend.settings import edit
    state,policy=run(service.settings());policy=edit(policy,{'enabled':True,'vpnGuard':False,'temporaryShare':True})
    run(old.batch([('UPDATE tool_settings SET document=?',(json.dumps(policy),))]))
    task=run(service.create({'uid':'old-user','role_id':'role-registered','send':True},'legacy.txt',4))
    run(service.chunk({'uid':'old-user','role_id':'role-registered','send':True},task['id'],0,b'test'))
    return settings,old,store,cache,task


def migrate_fixture(data,tmp_path):
    s,old,store,cache,task=data
    return import_legacy(s,old.path,store.root,cache,tmp_path/'receipt.json')


def test_migrate_preserves_rows_bytes_originals_and_rollback(tmp_path):
    data=legacy(tmp_path);s,old,store,cache,task=data
    result=migrate_fixture(data,tmp_path);assert result['imported'] and result['files']==2
    Database(s.database_path).verify()
    with sqlite3.connect(s.database_path) as db:
        assert db.execute('SELECT id FROM temporary_shares').fetchone()[0]==task['id']
        assert db.execute('SELECT user_uid FROM admin_grants').fetchone()[0]=='legacy-manager'
    assert (s.transfer_cache_dir/'old.txt').read_bytes()==b'cache'
    assert list(store.root.rglob('*.part'))[0].read_bytes()==b'test'
    assert rollback(tmp_path/'receipt.json')['rolled_back']
    with sqlite3.connect(s.database_path) as db:
        assert not db.execute('SELECT 1 FROM temporary_shares').fetchone()
    assert list(s.transfer_media_dir.rglob('*.part'))[0].read_bytes()==b'test'


@pytest.mark.parametrize('problem',['missing','corrupt','conflict','symlink','locked','unknown'])
def test_migration_rejects_unsafe_sources_without_database_changes(tmp_path,problem):
    data=legacy(tmp_path);s,old,store,cache,task=data
    with sqlite3.connect(s.database_path) as db:before=content_hash(db)
    part=list(store.root.rglob('*.part'))[0]
    if problem=='missing':part.unlink()
    if problem=='corrupt':part.write_bytes(b'evil')
    if problem=='conflict':
        dest=s.transfer_media_dir/part.relative_to(store.root);dest.parent.mkdir(parents=True);dest.write_bytes(b'evil')
    if problem=='symlink':(cache/'link').symlink_to(cache/'old.txt')
    if problem=='unknown':
        with sqlite3.connect(old.path) as db:db.execute('CREATE TABLE unknown(x)')
    lock=RuntimeLock(old.path) if problem=='locked' else None
    try:
        if lock:lock.__enter__()
        with pytest.raises(ValueError):migrate_fixture(data,tmp_path)
    finally:
        if lock:lock.__exit__()
    with sqlite3.connect(s.database_path) as db:assert content_hash(db)==before


def test_rollback_refuses_new_work_and_import_refuses_existing_rows(tmp_path):
    data=legacy(tmp_path);s,old,store,cache,task=data;migrate_fixture(data,tmp_path)
    with sqlite3.connect(s.database_path) as db:db.execute("INSERT INTO service_meta VALUES ('new-work','preserve')")
    with pytest.raises(ValueError,match='changed after import'):rollback(tmp_path/'receipt.json')
    with pytest.raises(ValueError,match='not empty'):import_legacy(s,old.path,store.root,cache,tmp_path/'second.json')


def test_unimported_source_blocks_transfer_only(fixture):
    c,r=fixture;Database(r.settings.transfer_database_path,'transfer').initialize()
    assert c.get('/transfer/').status_code==503
    assert c.get('/zh').status_code==200


def test_runtime_defaults_package_exclusion_and_one_vps_service(tmp_path):
    from deploy.vps.release import inventory,render
    s=Settings.from_env({'TEACHER_DATA_DIR':str(tmp_path/'data')})
    assert s.transfer_media_dir==PROJECT_ROOT/'data/transfer-data/files'
    root=tmp_path/'source';(root/'transfer-data').mkdir(parents=True);(root/'transfer-data/private.sqlite3').write_bytes(b'private');(root/'source.py').write_text('pass')
    assert list(inventory(root))==['source.py']
    out=tmp_path/'config';result=render(out,'/opt/teacher-site','teacher.example',None,'/opt/teacher-site/venv/bin/python')
    assert result['services']==1 and len(list(out.glob('*.service')))==1
    assert '8004' not in (out/'Caddyfile.fragment').read_text()


def test_import_current_empty_schema_and_no_repeated_schema_upgrade(tmp_path):
    from sync_schema_contract import assert_upgrade
    assert_upgrade(tmp_path)


def test_import_commit_failure_leaves_main_unchanged(tmp_path,monkeypatch):
    import transfer.backend.migrate as module
    data=legacy(tmp_path);s,*_=data
    with sqlite3.connect(s.database_path) as c:before=content_hash(c)
    original=module.receipt_write
    def fail(path,data):
        if data.get('status')=='ready-to-commit':raise OSError('Synthetic disk full')
        return original(path,data)
    monkeypatch.setattr(module,'receipt_write',fail)
    with pytest.raises(OSError,match='disk full'):migrate_fixture(data,tmp_path)
    with sqlite3.connect(s.database_path) as c:assert content_hash(c)==before


def test_password_change_required_blocks_integrated_requests(fixture):
    c,r=fixture;enabled(c,r)
    run(r.sql.batch([('UPDATE auth_users SET must_change_password=1 WHERE uid=?',(r.p['uid'],))]))
    assert c.get('/transfer/api/tasks').status_code==403


def test_migrated_share_downloads_from_main_and_keeps_owner(fixture,tmp_path):
    from transfer.backend.settings import edit
    c,r=fixture
    old=Database(r.settings.transfer_database_path,'transfer');old.initialize()
    store=LocalStore(tmp_path/'old-payload');cache=tmp_path/'old-aux';cache.mkdir()
    service=Transfers(old,store);run(service.initialize(r.p['uid']))
    _,policy=run(service.settings());policy=edit(policy,{'enabled':True,'vpnGuard':False,'temporaryShare':True})
    run(old.batch([('UPDATE tool_settings SET document=?',(json.dumps(policy),))]))
    owner={**r.p,'role_id':r.p['role_uid'],'send':True}
    t=run(service.create(owner,'kept.txt',4));run(service.chunk(owner,t['id'],0,b'kept'))
    assert import_legacy(r.settings,old.path,store.root,cache,tmp_path/'migration.json')['imported']
    assert c.get('/transfer/s/'+t['token']).content==b'kept'
    assert c.get('/transfer/api/tasks/'+t['id']).json()['name']=='kept.txt'
    assert c.get('/transfer/api/admin/usage').json()['total']['weekly']['charged_and_reserved']==8


@pytest.mark.parametrize('kind',['ready','cache'])
def test_integrated_examples_reuse_management_and_main_identity(fixture,kind):
    c,r=fixture;enabled(c,r)
    response=c.post('/transfer/api/examples',json={'_csrf':r.p['csrf'],'kind':kind},headers={'Origin':r.config.origin})
    assert response.status_code==200,response.text
    assert response.json()['status']=='created'
