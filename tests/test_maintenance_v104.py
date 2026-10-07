import asyncio,json,os,time
from pathlib import Path
from backend.app.config import Settings
from backend.app.native.database import Database
from backend.app.native.catalog import now
from backend.maintenance.runtime import Maintenance


def setup(tmp_path):
    settings=Settings(tmp_path)
    db=Database(settings.database_path);db.initialize()
    return Maintenance(db,settings)


def test_throttle_preview_apply_preserves_active_and_is_bounded(tmp_path):
    async def run():
        m=setup(tmp_path)
        for i in range(205):
            expiry=now(seconds=-3600) if i<204 else now(seconds=3600)
            await m.sql.batch([('INSERT INTO auth_login_throttles(key_hash,scope,failures,window_started_at,updated_at,expires_at) VALUES (?,?,1,?,?,?)',(f'{i:064x}','account',now(seconds=-7200),now(seconds=-7200),expiry))])
        preview=await m.tick(False);assert preview['counts']['auth_login_throttles']==200
        assert (await m.sql.query('SELECT count(*) n FROM auth_login_throttles'))[0]['n']==205
        one=await m.tick(True);assert one['counts']['auth_login_throttles']==200
        await m.tick(True)
        assert (await m.sql.query('SELECT count(*) n FROM auth_login_throttles'))[0]['n']==1
    asyncio.run(run())


def test_report_cleanup_retries_keeps_new_unknown_and_media(tmp_path):
    async def run():
        m=setup(tmp_path);owner='a'*64
        for report,expiry in [('b'*32,now(seconds=-90000)),('c'*32,now(seconds=3600))]:
            await m.store.put(f'media-audit/{report}/state.json',json.dumps({'id':report,'owner':owner,'expires':expiry}).encode())
            await m.store.put(f'media-audit/{report}/page-0.json',b'[]')
        await m.store.put('media-audit/latest-'+owner+'.json',json.dumps({'id':'b'*32}).encode())
        m.settings.media_dir.mkdir(parents=True);(m.settings.media_dir/'keep.jpg').write_bytes(b'keep')
        await m.store.put('unknown.tmp',b'keep')
        for _ in range(10):await m.tick(True)
        assert not (m.store.root/'media-audit'/('b'*32)).exists()
        assert (m.store.root/'media-audit'/('c'*32)/'page-0.json').exists()
        assert (m.store.root/'unknown.tmp').exists() and (m.settings.media_dir/'keep.jpg').exists()
    asyncio.run(run())


def test_report_lease_and_temporary_age(tmp_path):
    async def run():
        m=setup(tmp_path);report='d'*32;key=f'media-audit/{report}/page-0.json'
        await m.store.put(f'media-audit/{report}/state.json',json.dumps({'id':report,'owner':'a'*64,'expires':now(seconds=-90000)}).encode())
        await m.store.put(key,b'[]');at=now()
        await m.sql.batch([('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES (?,?,?,?,?)',('media:scan:'+report,'media_assets','busy',at,at))])
        old='metadata/v2/aa.json.'+'a'*16+'.tmp';new='metadata/v2/ab.json.'+'b'*16+'.tmp'
        for k in [old,new]:
            path=m.store.root/k;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b'tmp')
        os.utime((m.store.root/old),(time.time()-90000,)*2)
        for _ in range(5):await m.tick(True)
        assert m.store.path(key).exists() and (m.store.root/new).exists() and not (m.store.root/old).exists()
    asyncio.run(run())


def test_symlink_never_followed(tmp_path):
    async def run():
        m=setup(tmp_path);outside=tmp_path/'outside';outside.write_bytes(b'keep')
        k=(m.store.root/('metadata/v2/aa.json.'+'a'*16+'.tmp'));k.parent.mkdir(parents=True)
        try:k.symlink_to(outside)
        except OSError:return
        await m.tick(True);assert outside.read_bytes()==b'keep' and k.is_symlink()
    asyncio.run(run())

from test_accounts_regression import fixture

def test_sessions_retention_keeps_current_and_recent(fixture):
    async def run():
        c,r=fixture;m=Maintenance(r.sql,r.settings)
        user=(await r.sql.query('SELECT uid FROM auth_users LIMIT 1'))[0]['uid']
        for name,days in [('old',40),('recent',2)]:
            created=now(seconds=-(days+1)*86400);ended=now(seconds=-days*86400)
            await r.sql.batch([('INSERT INTO auth_sessions(uid,user_uid,token_hash,created_at,updated_at,last_seen_at,idle_expires_at,expires_at) VALUES (?,?,?,?,?,?,?,?)',(name,user,('a' if name=='old' else 'b')*64,created,created,created,ended,ended))])
        await m.tick(True)
        assert not await r.sql.query("SELECT 1 FROM auth_sessions WHERE uid='old'")
        assert await r.sql.query("SELECT 1 FROM auth_sessions WHERE uid='recent'")
        assert await r.sql.query('SELECT 1 FROM auth_sessions WHERE uid=?',(r.p['session_uid'],))
    asyncio.run(run())


def test_file_failure_is_recorded_and_retry_succeeds(tmp_path):
    async def run():
        m=setup(tmp_path);key='metadata/v2/aa.json.'+'a'*16+'.tmp'
        path=m.store.root/key;path.parent.mkdir(parents=True);path.write_bytes(b'temp');os.utime(path,(time.time()-90000,)*2)
        preview=await m.tick(False);assert path.exists() and preview['counts']['temporary_files']==1
        original=m.inventory.delete
        async def fail(*args):raise PermissionError('synthetic')
        m.inventory.delete=fail
        result=await m.tick(True);assert result['errors'] and path.exists()
        m.inventory.delete=original
        for _ in range(4):await m.tick(True)
        assert not path.exists()
    asyncio.run(run())
