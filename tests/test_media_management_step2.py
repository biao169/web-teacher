"""Real SQLite, files and HTTP regression for the second media management step."""
import asyncio,json,sqlite3,uuid
from pathlib import Path
from urllib.parse import quote
import pytest
from list_fixture import client_at
from test_media_regression import PNG
from backend.app.native.database import Database,SCHEMA
from backend.app.native.schema_upgrade import migrate
from backend.app.native.locking import RuntimeLock
from backend.app.native.auth import Auth
from backend.app.native.media_audit import MediaAudit
from backend.app.native.media_inventory_store import LocalInventory
from backend.app.native.media_locks import purge_key
from backend.app.native.catalog import now

run=asyncio.run
@pytest.fixture
def fixture(tmp_path):
    c,r=client_at(tmp_path)
    from backend.app.native.content import Content
    from backend.app.native.media import Media
    r.auth=Auth(r.sql,r.passwords);r.content=Content(r.sql,r.auth);r.media=Media(r.sql,r.auth,r.content,r.media_store)
    r.p=run(r.auth.principal(c.cookies.get('ts_session')))
    yield c,r
    c.close()
def query(r,sql,args=()):return run(r.sql.query(sql,args))
def post(c,r,row,action,**extra):
    return c.post('/api/admin/media_assets/'+row['uid'],json={'action':action,'stamp':row['updated_at'],'_csrf':r.p['csrf'],**extra},headers={'Origin':r.config.origin,'Accept':'application/json'})
def register(r,*,status='trash',old=False,external=False):
    uid=uuid.uuid4().hex;key='https://example.test/'+uid+'.png' if external else uid+'.png'
    if not external:run(r.media_store.put(key,PNG))
    run(r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status,updated_at) VALUES (?,?,?,?,?,?,?,?)',(uid,key,'测试文件','image/png',len(PNG),'external' if external else 'local',status,now(seconds=-365*86400) if old else now()))]))
    return query(r,'SELECT * FROM media_assets WHERE uid=?',(uid,))[0]
def present(r,row):return query(r,'SELECT * FROM media_assets WHERE uid=?',(row['uid'],))
def legacy(path):
    c=sqlite3.connect(path)
    data=json.loads((SCHEMA/'teacher-v0.15.37.json').read_text())
    for o in data['objects']:c.execute(o['sql'])
    c.execute("INSERT INTO media_assets(uid,object_key,title,size) VALUES('old','old.png','用户编辑的标题',2048)")
    c.commit();c.close();return Database(path)

def test_upgrade_preserves_rows_creates_snapshot_and_is_idempotent(tmp_path):
    db=legacy(tmp_path/'teacher.db');before=run(db.query('SELECT * FROM media_assets'))
    result=migrate(db);db.initialize()
    with sqlite3.connect(result['backup']) as old:
        assert 'original_filename' not in [r[1] for r in old.execute('PRAGMA table_info(media_assets)')]
        assert old.execute('SELECT title FROM media_assets').fetchone()[0]=='用户编辑的标题'
    after=run(db.query('SELECT * FROM media_assets'))[0];assert after.pop('original_filename') is None;assert after==before[0]
    assert migrate(db)=={'upgraded':False,'schema':'current'}

def test_upgrade_rejects_unknown_and_running_database(tmp_path):
    db=legacy(tmp_path/'teacher.db')
    with RuntimeLock(db.path),pytest.raises(ValueError,match='in use'):migrate(db)
    with db.connect() as c:c.execute('CREATE TABLE foreign_table(x)')
    with pytest.raises(ValueError,match='Unknown schema'):migrate(db)
    assert not list(tmp_path.glob('*.before-*.sqlite3'))

def test_upgrade_rolls_back_if_verification_fails(tmp_path,monkeypatch):
    db=legacy(tmp_path/'teacher.db')
    def fail(*args):raise ValueError('Synthetic verify failure')
    monkeypatch.setattr(db,'verify',fail)
    with pytest.raises(ValueError,match='Synthetic'):migrate(db)
    assert 'original_filename' not in [r['name'] for r in run(db.query('PRAGMA table_info(media_assets)'))]
    assert list(tmp_path.glob('*.before-*.sqlite3'))

def test_original_names_unique_storage_search_download_and_backup_values(fixture):
    c,r=fixture;name='研究 项目 "甲".png'
    for _ in range(2):
        response=c.post('/api/admin/media/upload/file',content=PNG,headers={'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf'],'X-Filename':quote(name)})
        assert response.status_code==200,response.text
    rows=query(r,'SELECT * FROM media_assets');assert len(rows)==2
    assert rows[0]['object_key']!=rows[1]['object_key'];assert all(v['original_filename']==name for v in rows)
    run(r.sql.batch([('UPDATE media_assets SET title=? WHERE uid=?',('新标题',rows[0]['uid']))]))
    html=c.get('/admin/media_assets',params={'q':name}).text
    assert all('data-uid="'+v['uid']+'"' in html for v in rows);assert '大小/KB' in html and 'data-filter-scale="1024"' in html
    response=c.get('/api/admin/media/'+rows[0]['uid']+'/content?download=1')
    assert response.content==PNG and response.headers['content-disposition'].startswith('attachment;')
    assert "filename*=UTF-8''"+quote(name,safe='') in response.headers['content-disposition']
    assert c.get('/api/admin/media/'+rows[0]['uid']+'/content').headers['content-disposition'].startswith('inline;')
    from backend.app.native.data_tools import row_values
    assert row_values('media_assets',rows[0])['original_filename']==name
    historic=dict(rows[0]);historic.pop('original_filename');assert 'original_filename' not in row_values('media_assets',historic)

@pytest.mark.parametrize('name',['bad\r\nheader.png','x'*256+'.png','\u202eevil.png'])
def test_invalid_original_name_rejected_without_files(fixture,name):
    c,r=fixture;response=c.post('/api/admin/media/upload/file',content=PNG,headers={'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf'],'X-Filename':quote(name)})
    assert response.status_code==422 and not query(r,'SELECT * FROM media_assets')

@pytest.mark.parametrize('immediate,old',[(True,False),(False,True),(False,False)])
def test_purge_removes_real_file_and_record_and_retry_is_idempotent(fixture,immediate,old):
    c,r=fixture;row=register(r,old=old)
    plan=post(c,r,row,'purge-prepare',immediate=immediate);assert plan.status_code==200,plan.text
    assert present(r,row) and r.media_store.path(row['object_key']).exists()
    data=plan.json();assert '永久删除文件' in data['mode']
    for _ in range(2):assert post(c,r,row,'purge',token=data['token']).status_code==200
    assert not present(r,row) and not r.media_store.path(row['object_key']).exists()
    assert len(query(r,"SELECT * FROM operation_logs WHERE action='purge_complete' AND target_uid=?",(row['uid'],)))==1

@pytest.mark.parametrize('case',['active','stale','reference','bad-token','no-csrf','changed-file'])
def test_purge_rejections_leave_file_and_record(fixture,case):
    c,r=fixture;row=register(r,status='active' if case=='active' else 'trash')
    if case=='reference':run(r.sql.batch([("UPDATE profiles SET avatar_key=? WHERE id=(SELECT min(id) FROM profiles)",(row['object_key'],))]))
    if case=='stale':row['updated_at']=now(seconds=-1)
    if case in ('active','stale','reference'):
        response=post(c,r,row,'purge-prepare',immediate=False);assert response.status_code==409,response.text
    elif case=='no-csrf':assert post(c,r,row,'purge-prepare',immediate=True,_csrf='bad').status_code==403
    else:
        plan=post(c,r,row,'purge-prepare',immediate=True).json()
        if case=='changed-file':run(r.media_store.put(row['object_key'],PNG+b'changed'))
        response=post(c,r,row,'purge',token='0'*64 if case=='bad-token' else plan['token']);assert response.status_code==409,response.text
    assert present(r,row) and r.media_store.path(row['object_key']).exists()

def test_external_and_missing_cleanup(fixture,monkeypatch):
    c,r=fixture
    for external in (True,False):
        row=register(r,old=True,external=external)
        if not external:run(r.media_store.delete(row['object_key']))
        plan=post(c,r,row,'purge-prepare').json()
        assert ('外链' if external else '缺失') in plan['mode']
        assert post(c,r,row,'purge',token=plan['token']).status_code==200
        assert not present(r,row)

def test_file_deleted_but_acknowledgement_lost_preserves_intent_and_retry(fixture,monkeypatch):
    c,r=fixture;row=register(r,old=True);plan=post(c,r,row,'purge-prepare').json()
    original=LocalInventory.delete
    async def interrupted(store,key,version):
        await original(store,key,version);raise OSError('Synthetic lost acknowledgement')
    monkeypatch.setattr(LocalInventory,'delete',interrupted)
    assert post(c,r,row,'purge',token=plan['token']).status_code==503
    assert present(r,row) and not r.media_store.path(row['object_key']).exists()
    assert query(r,'SELECT * FROM admin_mutation_guards WHERE uid=?',(purge_key(row['uid']),))
    assert post(c,r,row,'status',value='active').status_code==409
    monkeypatch.setattr(LocalInventory,'delete',original)
    assert post(c,r,row,'purge',token=plan['token']).status_code==200
    assert not present(r,row)

def test_non_system_manager_retention_and_delete_permission(fixture):
    c,r=fixture
    role=run(r.content.save('auth_roles',r.p,{'name':'媒体管理员','level':1,'visibility_scopes':'["public"]','is_active':1},permissions={'media_assets':['view','delete']}))
    username='media-'+uuid.uuid4().hex
    run(r.content.save('auth_users',r.p,{'username':username,'role_uid':role,'status':'active','visibility':'public','must_change_password':0},password='Synthetic-Media-038'))
    row=register(r,old=False);token=run(r.auth.login(username,'Synthetic-Media-038','test'));c.cookies.set('ts_session',token);r.p=run(r.auth.principal(token))
    first=post(c,r,row,'purge-prepare').json()
    assert post(c,r,row,'purge',token=first['token']).status_code==200
    assert not present(r,row) and not r.media_store.path(row['object_key']).exists()
    row=register(r,old=False)
    plan=post(c,r,row,'purge-prepare');assert plan.status_code==200,plan.text
    run(r.sql.batch([("UPDATE auth_permissions SET can_delete=0 WHERE role_uid=? AND module='media_assets'",(role,))]))
    assert post(c,r,row,'purge',token=plan.json()['token']).status_code==403
    assert present(r,row) and r.media_store.path(row['object_key']).exists()

def test_reference_added_after_preflight_blocks_commit(fixture):
    c,r=fixture;row=register(r,old=True);plan=post(c,r,row,'purge-prepare').json()
    run(r.sql.batch([("UPDATE profiles SET avatar_key=? WHERE id=(SELECT min(id) FROM profiles)",(row['object_key'],))]))
    assert post(c,r,row,'purge',token=plan['token']).status_code==409
    assert present(r,row) and r.media_store.path(row['object_key']).exists()

def test_existing_audit_purge_entry_uses_same_core(fixture):
    c,r=fixture;row=register(r,old=True);audit=MediaAudit(r)
    report=run(audit.start())
    plan=run(audit.prepare_purge(report['id'],row['uid'],row['updated_at']))
    assert run(audit.commit_purge(report['id'],plan['token']))['uid']==row['uid']
    assert not present(r,row) and not r.media_store.path(row['object_key']).exists()

def test_unregistered_external_picker_dto_is_compatible(fixture):
    c,r=fixture
    response=c.post('/api/admin/media-picker/links/resolve',json={'_csrf':r.p['csrf'],'module':'news','field':'cover_key','url':'https://example.org/image.png','mime_type':'image/png'},headers={'Origin':r.config.origin})
    assert response.status_code==200,response.text
    assert response.json()['original_filename'] is None
    assert not query(r,'SELECT * FROM media_assets')


def test_automatic_purge_still_respects_retention(fixture):
    from backend.app.native.catalog import Error
    c,r=fixture;row=register(r,old=False)
    with pytest.raises(Error,match='保留期'):run(MediaAudit(r).purge_plan(row['uid'],row['updated_at']))
