import asyncio,json
from types import SimpleNamespace
import pytest
from site_sync.tests import test_engine as fixtures
from site_sync.adapters.transfer import Transfer
from site_sync.core.engine import Context
run=asyncio.run

@pytest.fixture(params=[False,True],ids=['sqlite','d1-contract'])
def engine(request):
    f=fixtures.EngineTests();f.use_d1=request.param;f.setUp()
    try:yield f
    finally:f.tearDown()

def test_candidate_and_cursor_rollback_together(engine,monkeypatch):
    f=engine;task=f.create();owner=f.claim();base=f.db.batch
    async def broken(statements):return await base([*statements,('SELECT missing_column_for_rollback',())])
    with monkeypatch.context() as patch:
        patch.setattr(f.db,'batch',broken)
        with pytest.raises(Exception):run(f.repo.add_item(owner,item_id='i',module='news',record_id='i',source_version='v1',discovery_cursor='[1,"news","i"]',now=f.clock()))
    assert run(f.db.query('SELECT item_id FROM sync_items'))==[]
    assert f.read(task)['discovery_cursor'] is None
    assert f.read(task)['progress_seq']==0

def test_lost_candidate_reply_is_idempotent_and_stale_cursor_cannot_rewind(engine,monkeypatch):
    f=engine;task=f.create();owner=f.claim();base=f.db.batch
    async def lost(statements):
        await base(statements)
        raise TimeoutError('injected lost reply after commit')
    kw=dict(item_id='i',module='news',record_id='i',source_version='v1',discovery_cursor='[2,"news","i"]',now=f.clock())
    with monkeypatch.context() as patch:
        patch.setattr(f.db,'batch',lost)
        with pytest.raises(TimeoutError):run(f.repo.add_item(owner,**kw))
    assert f.read(task)['discovery_cursor']==kw['discovery_cursor']
    run(f.repo.add_item(owner,**kw))
    assert f.read(task)['progress_seq']==1
    newer=f.read(task)
    run(f.repo.add_item(newer,item_id='j',module='news',record_id='j',source_version='v1',discovery_cursor='[1,"news","j"]',now=f.clock()))
    with pytest.raises(Exception):run(f.repo.add_item(owner,**kw))
    assert f.read(task)['discovery_cursor']=='[1,"news","j"]'
    assert f.read(task)['progress_seq']==2

def test_pinned_manifest_registers_one_file_per_recreated_step(engine,monkeypatch):
    f=engine;task=f.prepared(mode='scheduled');calls=[]
    class Peer:
        async def manifest(self,item):
            calls.append('manifest')
            return {'version':'v1','fields':{'body':8192},'files':[{'id':str(i),'version':'v1','size':0} for i in range(3)]}
        async def slice(self,*args):raise AssertionError('registration downloaded body')
    media=SimpleNamespace(kind='local',part_bytes=4096)
    def tick(lose=False):
        owner=f.claim();ctx=Context(f.repo,owner,f.clock);base=f.db.batch
        async def lost(statements):
            result=await base(statements)
            if any('INSERT INTO sync_files' in sql for sql,args in statements):raise TimeoutError('lost descriptor acknowledgement')
            return result
        with monkeypatch.context() as patch:
            if lose:patch.setattr(f.db,'batch',lost)
            if lose:
                with pytest.raises(TimeoutError):run(Transfer(f.repo,Peer(),media)(ctx))
            else:run(Transfer(f.repo,Peer(),media)(ctx))
        run(f.repo.finish(owner,f.clock(),error='TimeoutError' if lose else None));f.clock.step()
    tick()
    assert run(f.db.query('SELECT file_id FROM sync_files'))==[]
    for n in range(1,4):
        tick(lose=n==1)
        assert len(run(f.db.query('SELECT file_id FROM sync_files')))==n
        assert run(f.db.query('SELECT offset FROM sync_parts'))==[]
    assert calls==['manifest']
    assert f.read(task)['no_progress_count']==0
