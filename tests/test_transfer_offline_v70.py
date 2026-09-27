"""Offline cache capacity, restart, physical expiry cleanup and failure checkpoints."""
import asyncio,errno,hashlib,json,os
from pathlib import Path
from types import SimpleNamespace
import pytest
from test_accounts_regression import fixture,run
from test_transfer_integration_v66 import enabled
from test_transfer_lan_v68 import setting
from transfer.backend.native import Transfers
from transfer.backend.resources import DurableStore
from transfer.backend.offline import DiskBudget,Maintenance,ExpiryCleanup,ExpiredService
from transfer.backend.accounting import milliseconds as ms


def h(r):return {'Origin':r.config.origin,'X-CSRF-Token':r.p['csrf']}
def service(r,free=10**10):
    store=DurableStore(r.settings.transfer_media_dir)
    budget=DiskBudget(store.root,lambda path:SimpleNamespace(free=free,total=10**11))
    return Transfers(r.sql,store,indexed=True,disk=budget)
def prep(c,r):
    enabled(c,r);setting(r,lambda doc:doc.update(wanRateKbps=None,temporaryFreeBytes='0'))
def task(s,r,size=3):return run(s.create({**r.p,'send':True},'synthetic.bin',size))
def send(s,r,t,data=b'abc',offset=0):return run(s.chunk({**r.p,'send':True},t['id'],offset,data))
def expire(r,id):run(r.sql.batch([('UPDATE temporary_shares SET expires_at=? WHERE id=?',(ms()-1,id))]))


def test_large_metadata_and_admin_settings_no_200mib_limit(fixture):
    c,r=fixture;prep(c,r)
    reply=c.post('/transfer/api/settings',json={'revision':2,'maxFileBytes':str(3*1024**3),'temporaryFreeBytes':'67108864','temporaryCleanupMinutes':2,'temporaryAutoCleanup':True},headers=h(r));assert reply.status_code==200,reply.text
    t=c.post('/transfer/api/tasks',json={'name':'large.bin','size':201*1048576},headers=h(r));assert t.status_code==200,t.text
    assert 'data-max-file="3221225472"' in c.get('/transfer/').text
    assert 'data-max-file="9007199254740991"' in c.get('/transfer/tasks').text
    assert 'data-transfer-admin' in c.get('/transfer/admin').text
    status=c.get('/transfer/api/storage-status');assert status.status_code==200 and status.json()['pending_upload_bytes']==201*1048576
    c.cookies.clear();assert c.get('/transfer/api/storage-status').status_code==403


def test_disk_pending_reservations_and_safety_floor(fixture):
    c,r=fixture;prep(c,r);s=service(r,free=10)
    task(s,r,6)
    with pytest.raises(Exception,match='磁盘可用空间不足'):task(s,r,5)
    assert len(run(r.sql.query('SELECT * FROM temporary_shares')))==1
    setting(r,lambda doc:doc.update(temporaryFreeBytes='5'))
    with pytest.raises(Exception,match='磁盘可用空间不足'):task(s,r,1)


def test_concurrent_reservations_cannot_overbook_same_disk(fixture):
    c,r=fixture;prep(c,r);s=service(r,free=10)
    async def go():return await asyncio.gather(*(s.create({**r.p,'send':True},'parallel',6) for _ in range(2)),return_exceptions=True)
    results=run(go());assert sum(isinstance(x,dict) for x in results)==1


def test_os_disk_full_does_not_advance_or_charge_then_resume(fixture):
    c,r=fixture;prep(c,r);s=service(r);t=task(s,r)
    original=s.store.put
    async def full(*args):raise OSError(errno.ENOSPC,'synthetic full')
    s.store.put=full
    with pytest.raises(Exception,match='本块未确认'):send(s,r,t)
    row=run(r.sql.query('SELECT point FROM recovery_tasks WHERE id=?',(t['id'],)))[0]
    assert json.loads(row['point'])['bytes']==0
    ledger=run(r.sql.query('SELECT outcome FROM transfer_allowances'))[0];assert json.loads(ledger['outcome'])['used']==0
    s.store.put=original;assert send(s,r,t)['complete']


def test_cleanup_bounded_checkpoint_restart_and_live_task_untouched(fixture):
    c,r=fixture;prep(c,r);s=service(r);old=task(s,r,10)
    for n in range(10):send(s,r,old,b'x',n)
    live=task(s,r);send(s,r,live);expire(r,old['id'])
    worker=Maintenance(r.sql,s.store);first=run(worker.tick(batches=1));assert first['removed_chunks']==8
    assert run(r.sql.query('SELECT state FROM temporary_shares WHERE id=?',(old['id'],)))[0]['state']=='revoked'
    worker=Maintenance(r.sql,DurableStore(r.settings.transfer_media_dir));last=run(worker.tick(batches=1));assert last['completed_tasks']==1
    assert not (s.store.root/old['id']).exists()
    assert (s.store.root/live['id']).is_dir()
    assert run(r.sql.query('SELECT state FROM temporary_shares WHERE id=?',(live['id'],)))[0]['state']=='ready'


def test_cleanup_failure_preserved_and_retried(fixture):
    c,r=fixture;prep(c,r);s=service(r);t=task(s,r);send(s,r,t);expire(r,t['id'])
    original=s.store.delete
    async def denied(key):raise PermissionError('synthetic locked file')
    s.store.delete=denied;worker=Maintenance(r.sql,s.store)
    assert run(worker.tick(batches=1))['failed_tasks']==1
    row=run(r.sql.query('SELECT state,extra FROM recovery_tasks WHERE id=?',(t['id'],)))[0]
    assert row['state']=='cleanup_failed' and json.loads(row['extra'])['cleanup_error']
    assert list((s.store.root/t['id']).glob('*.part'))
    assert run(worker.tick(batches=1))['removed_chunks']==0
    s.store.delete=original
    run(r.sql.batch([("UPDATE recovery_tasks SET extra=json_set(extra,'$.cleanup_requested',0) WHERE id=?",(t['id'],))]))
    assert run(Maintenance(r.sql,s.store).tick(batches=1))['completed_tasks']==1


def test_orphan_part_and_temp_pruned_but_other_files_protected(fixture):
    c,r=fixture;prep(c,r);s=service(r);t=task(s,r);expire(r,t['id'])
    folder=s.store.root/t['id'];folder.mkdir()
    (folder/('a'*32+'.part')).write_bytes(b'orphan');(folder/('b'*32+'.part.'+'c'*16+'.tmp')).write_bytes(b'tmp')
    assert run(Maintenance(r.sql,s.store).tick(batches=1))['completed_tasks']==1
    assert not folder.exists()
    t=task(s,r);expire(r,t['id']);folder=s.store.root/t['id'];folder.mkdir();(folder/'keep.txt').write_bytes(b'keep')
    assert run(Maintenance(r.sql,s.store).tick(batches=1))['failed_tasks']==1
    assert (folder/'keep.txt').read_bytes()==b'keep'


def test_internal_cleanup_refuses_active_and_symlink(fixture,tmp_path):
    c,r=fixture;prep(c,r);s=service(r);t=task(s,r)
    with pytest.raises(Exception,match='自动清理拒绝'):run(ExpiryCleanup(ExpiredService(r.sql,s.store,indexed=True),t['id']).purge(t['id']))
    target=tmp_path/'outside';target.mkdir();(target/('a'*32+'.part')).write_bytes(b'keep')
    folder=s.store.root/t['id'];folder.symlink_to(target,target_is_directory=True);expire(r,t['id'])
    assert run(Maintenance(r.sql,s.store).tick(batches=1))['failed_tasks']==1
    assert (target/('a'*32+'.part')).read_bytes()==b'keep'


def test_lifespan_starts_cleanup_without_visiting_transfer(fixture):
    c,r=fixture;prep(c,r);s=service(r);t=task(s,r);send(s,r,t);expire(r,t['id'])
    # Opening a fresh application lifespan triggers cleanup; no transfer-page request.
    from fastapi.testclient import TestClient
    with TestClient(c.app) as running:
        worker=c.app.state.transfer_maintenance
        async def done():
            for _ in range(100):
                rows=await r.sql.query('SELECT state FROM temporary_shares WHERE id=?',(t['id'],))
                if rows[0]['state']=='deleted':return True
                await asyncio.sleep(.01)
            return False
        assert running.portal.call(done)
        assert worker.status['running']
    assert not worker.status['running']


def test_cache_full_stays_reserved_until_physical_cleanup(fixture):
    c,r=fixture;prep(c,r);setting(r,lambda doc:doc.update(temporaryStorageBytes='4'))
    s=service(r);t=task(s,r,3);send(s,r,t)
    with pytest.raises(Exception):task(s,r,2)
    expire(r,t['id'])
    with pytest.raises(Exception):task(s,r,2)
    assert run(Maintenance(r.sql,s.store).tick())['completed_tasks']==1
    assert task(s,r,4)['id']!=t['id']


def test_cleanup_switch_and_disabled_tool_are_independent(fixture):
    c,r=fixture;prep(c,r);s=service(r);t=task(s,r);send(s,r,t);expire(r,t['id'])
    setting(r,lambda doc:doc.update(temporaryAutoCleanup=False,enabled=False))
    async def stopped_cycle():
        worker=Maintenance(r.sql,s.store);process=asyncio.create_task(worker.run());await asyncio.sleep(.03);worker.stopped.set();await process
        assert not worker.status['last_run']
    run(stopped_cycle());assert (s.store.root/t['id']).is_dir()
    setting(r,lambda doc:doc.update(temporaryAutoCleanup=True))
    async def cleanup_disabled_tool():
        worker=Maintenance(r.sql,s.store);process=asyncio.create_task(worker.run())
        for _ in range(100):
            if worker.status['last_run']:break
            await asyncio.sleep(.01)
        worker.stopped.set();await process
        assert worker.status['completed_tasks']==1
    run(cleanup_disabled_tool());assert not (s.store.root/t['id']).exists()


def test_indexed_cleanup_does_not_follow_link_to_another_task(fixture):
    c,r=fixture;prep(c,r);s=service(r);t=task(s,r);send(s,r,t)
    folder=s.store.root/t['id'];part=next(folder.glob('*.part'))
    other=s.store.root/('f'*32);other.mkdir();(other/part.name).write_bytes(b'keep')
    part.unlink();folder.rmdir();folder.symlink_to(other,target_is_directory=True);expire(r,t['id'])
    assert run(Maintenance(r.sql,s.store).tick(batches=1))['failed_tasks']==1
    assert (other/part.name).read_bytes()==b'keep'
