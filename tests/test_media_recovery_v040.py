import asyncio,json,sqlite3,time
from types import SimpleNamespace
import pytest
from backend.maintenance.media_uploads import create,recover,fence,PREFIX
from backend.app.native.media import Media
from backend.app.native.catalog import Error
from backend.app.ports.upload_stream import bind
from test_media_stream_v039 import Request,Native
from test_upload_diagnostics_v038 import SQL as MockSQL,Auth,Content,Store as MockStore

class SQL:
    def __init__(self):
        self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row
        self.c.executescript('CREATE TABLE service_meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE media_assets(object_key TEXT,storage_kind TEXT); CREATE TABLE admin_mutation_guards(uid TEXT PRIMARY KEY,target_uid TEXT);')
    async def query(self,s,a=()):return [dict(r) for r in self.c.execute(s,a).fetchall()]
    async def batch(self,statements):
        with self.c:return [[dict(r) for r in self.c.execute(s,a).fetchall()] for s,a in statements]
    def seed(self,i=1,stamp=1000):
        uid=f'{i:032x}';key=uid+'.png';name,statement=create(uid,key,'owner-'+str(i),stamp)
        self.c.execute(*statement);self.c.commit();return name,key
class Store:
    def __init__(self,fail=False):self.deleted=[];self.fail=fail
    async def delete(self,key):
        if self.fail:raise OSError('storage unavailable')
        self.deleted.append(key)

def test_expired_orphan_is_cleaned_and_owner_lock_released_but_tombstone_retained():
    sql=SQL();name,key=sql.seed();sql.c.execute('INSERT INTO admin_mutation_guards VALUES (?,?)',('media:upload','owner-1'));sql.c.commit();store=Store()
    assert asyncio.run(recover(sql,store,stamp=1600))['cleaned']==1
    assert store.deleted==[key]
    assert not sql.c.execute('SELECT * FROM admin_mutation_guards').fetchall()
    row=sql.c.execute('SELECT key FROM service_meta').fetchone();assert row['key']!=name
    # A late object is cleaned again; tombstones expire at 24 h, not forever.
    assert asyncio.run(recover(sql,store,stamp=87400))['cleaned']==1
    assert not sql.c.execute('SELECT * FROM service_meta').fetchall()

def test_registered_object_and_later_owner_lock_are_preserved():
    sql=SQL();_,key=sql.seed();sql.c.execute('INSERT INTO media_assets VALUES (?,?)',(key,'r2'));sql.c.execute('INSERT INTO admin_mutation_guards VALUES (?,?)',('media:upload','new-owner'));sql.c.commit();store=Store()
    assert asyncio.run(recover(sql,store,stamp=1600))['retained']==1
    assert not store.deleted and sql.c.execute('SELECT target_uid FROM admin_mutation_guards').fetchone()[0]=='new-owner'
    assert not sql.c.execute('SELECT * FROM service_meta').fetchall()

def test_recent_upload_not_touched_and_batch_is_bounded():
    sql=SQL();store=Store()
    for i in range(1,9):sql.seed(i)
    sql.seed(9,stamp=2000)
    result=asyncio.run(recover(sql,store,stamp=1600,batch=100));assert result['checked']==5 and len(store.deleted)==5
    assert all(not k.startswith(f'{9:032x}') for k in store.deleted)

def test_cleanup_failure_and_corrupt_state_do_not_block_other_items():
    sql=SQL();name,key=sql.seed();sql.c.execute('UPDATE service_meta SET value=? WHERE key=?',('{bad',name));sql.c.commit();sql.seed(2);store=Store()
    result=asyncio.run(recover(sql,store,stamp=1600));assert result['errors']==1 and result['cleaned']==1
    assert sql.c.execute('SELECT count(*) FROM service_meta').fetchone()[0]==2
    sql=SQL();sql.seed();result=asyncio.run(recover(sql,Store(True),stamp=1600));assert result['errors']==1
    assert sql.c.execute('SELECT key FROM service_meta').fetchone()[0].startswith(PREFIX+f'{2200:012d}')

def test_receiving_expired_and_removed_sessions_cannot_pass_registration_fence():
    sql=SQL();stamp=int(time.time());name,_=sql.seed(stamp=stamp);condition,args=fence(name)
    def check():return sql.c.execute('SELECT '+condition,args).fetchone()[0]
    assert check()==0
    sql.c.execute("UPDATE service_meta SET value=json_set(value,'$.status','stored')");assert check()==1
    sql.c.execute("UPDATE service_meta SET value=json_set(value,'$.expires_at',0)");assert check()==0
    sql.c.execute('DELETE FROM service_meta');assert check()==0

def test_commit_acknowledgement_loss_does_not_delete_registered_object():
    class LostAck(MockSQL):
        committed=False
        async def batch(self,statements):
            if any('INSERT INTO media_assets' in s for s,a in statements):self.committed=True;raise TimeoutError('ack lost')
            return await super().batch(statements)
        async def query(self,s,a=()):
            if 'SELECT 1 FROM media_assets' in s:return [{'ok':1}] if self.committed else []
            return await super().query(s,a)
    sql=LostAck();store=MockStore(False)
    async def run():
        with bind(Request(),Native()):await Media(sql,Auth(),Content(),store,'r2').upload({},'file.png',Request())
    with pytest.raises(Error,match='登记结果未确认') as caught:asyncio.run(run())
    assert isinstance(caught.value.__cause__,TimeoutError)
    assert sql.committed and sql.released and not store.deleted

def test_main_cron_upload_slot_never_calls_sync(monkeypatch):
    from runtime import maintenance
    async def scheduled(sql,env):return {'checked':1}
    monkeypatch.setattr('backend.maintenance.media_uploads.scheduled',scheduled)
    assert asyncio.run(maintenance.run(None,SimpleNamespace(TEACHER_SYNC_EXECUTOR_MODE='separate'),SimpleNamespace(scheduledTime=180000)))==('uploads',{'checked':1})
