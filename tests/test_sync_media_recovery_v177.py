"""Real local/D1 adapters and simulated R2 streams; no live CPU claim."""
import asyncio,copy,hashlib,json,random
from pathlib import Path
import pytest
from tests.test_sync_platform_v131 import pair as platform_pair,local_pair
from backend.app.native import site_sync_media as media,site_sync_stream as streams,site_sync_sha256 as sha,site_sync_apply as apply,site_sync_tasks as tasks
from backend.app.native.media_inventory_store import inventory
from backend.app.native.catalog import Error
run=asyncio.run

@pytest.fixture
def pair(platform_pair):
    from backend.app.native.auth import Auth
    for r,client in zip(platform_pair[2:4],platform_pair[4:6]):
        r.auth=Auth(r.sql,r.passwords)
        r.p=run(r.auth.principal(client.cookies.get(r.config.name('session'))))
    return platform_pair

@pytest.mark.parametrize('length',[0,1,55,56,63,64,65,127,128,513,8193])
def test_serialized_sha_matches_hashlib_across_arbitrary_boundaries(length):
    rng=random.Random(length);raw=rng.randbytes(length);state=sha.initial();position=0
    while position<len(raw):
        amount=rng.randrange(1,170);state=sha.update(state,raw[position:position+amount]);position+=amount
        state=json.loads(json.dumps(state))
        assert len(state['tail'])<128
    assert sha.hexdigest(state)==hashlib.sha256(raw).hexdigest()
    assert sha.hexdigest(state)==sha.hexdigest(state)  # finalization does not mutate saved state


def test_known_sha_vectors_and_invalid_state():
    assert sha.hexdigest(sha.initial())=='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    assert sha.hexdigest(sha.update(sha.initial(),b'abc'))=='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    raw=b'a'*1000000;state=sha.initial()
    for offset in range(0,len(raw),65536):state=sha.update(state,raw[offset:offset+65536])
    assert sha.hexdigest(state)==hashlib.sha256(raw).hexdigest()
    for changes in ({'format':2},{'count':1},{'words':[1]},{'tail':'zz'}):
        with pytest.raises(ValueError):sha.update({**sha.initial(),**changes},b'x')


def seeded(r,size=21000):
    prefix=Path('tests/fixtures/media/sample.jpg').read_bytes();raw=prefix+b'x'*max(0,size-len(prefix))
    task={'uid':'recovery177','status':'ready','state':{'preview_format':8,'incremental':True,'execution':{
        'phase':'download','file_index':0,'offset':len(raw),'bytes':len(raw),'media':[],
        'cleanup_index':0,'cleanup_offset':0,'committed':False,'cancelled':False}}}
    item={'uid':'f'*32,'key':'recover.jpg','version':'source','chunk_bytes':4096,
        'size':len(raw),'mime_type':'image/jpeg','source_checksum':hashlib.sha256(raw).hexdigest()}
    task['state']['execution']['media']=[item]
    for offset in range(0,len(raw),4096):run(r.cache_store.put(media.chunk_key(task['uid'],0,offset),raw[offset:offset+4096]))
    run(r.sql.batch([('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',(task['uid'],'ready',json.dumps(task['state']),'2026-10-05T00:00:00.000Z'))]))
    return run(tasks.get(r.sql,task['uid'])),raw


def advance(r,task):
    run(media.finalize_step(r,task,0,task['state']['execution']['media'][0]))
    run(tasks.persist(r.sql,task,status='ready'))
    return run(tasks.get(r.sql,task['uid']))


def finish(r,task,limit=500):
    for _ in range(limit):
        if task['state']['execution']['file_index']==1:return task
        task=advance(r,task)
    pytest.fail('media did not finish')


def test_merge_ack_loss_adopts_only_after_bounded_comparison(pair,monkeypatch):
    r=pair[2];task,raw=seeded(r);original=streams.compose;calls=[];lost=False
    async def lose(source,target,parts,key,**kwargs):
        nonlocal lost
        result=await original(source,target,parts,key,**kwargs);calls.append(key)
        if not lost and target is r.cache_store:
            lost=True;raise Error('lost merge ack',502,'1102')
        return result
    monkeypatch.setattr(streams,'compose',lose)
    task=advance(r,task)  # durable intent before any merge write
    before=copy.deepcopy(task)
    with pytest.raises(Error):advance(r,task)
    task=before;task=advance(r,task)
    assert task['state']['execution']['media'][0]['merge_pending']['stage']=='compare'
    task=advance(r,task)
    checked=task['state']['execution']['media'][0]['merge_pending']['checked']
    assert 0<checked<= (65536 if r.kind=='local' else 4096)
    task=finish(r,task)
    assert len(calls)==len(set(calls))  # no rewrite of the already completed group
    assert run(r.media_store.get('recover.jpg'))==raw
    assert task['state']['execution']['media'][0]['sha256']==hashlib.sha256(raw).hexdigest()


def test_hash_resume_reads_only_after_checkpoint_and_detects_changed_object(pair,monkeypatch):
    r=pair[2];task,_=seeded(r)
    for _ in range(80):
        task=advance(r,task);item=task['state']['execution']['media'][0]
        if item.get('verify',{}).get('offset',0)>0:break
    cursor=item['verify'];assert cursor['offset']>0 and cursor['offset']==cursor['hash']['count']
    head=run(inventory(r.cache_store).head(cursor['key']))
    # Even a same-size overwrite invalidates a saved rolling hash.
    run(r.cache_store.put(cursor['key'],b'z'*head['size']))
    with pytest.raises(Error,match='版本|变化'):advance(r,task)
    assert not run(inventory(r.media_store).head('recover.jpg'))


def test_publication_ack_loss_verifies_existing_and_cancel_retains_unowned_file(pair,monkeypatch):
    r=pair[2];task,raw=seeded(r);original=streams.compose;lost=False;writes=0
    async def lose(source,target,parts,key,**kwargs):
        nonlocal lost,writes
        result=await original(source,target,parts,key,**kwargs)
        if target is r.media_store:
            writes+=1
            if not lost:lost=True;raise Error('publication lost',502,'1102')
        return result
    monkeypatch.setattr(streams,'compose',lose)
    for _ in range(100):
        saved=copy.deepcopy(task)
        try:task=advance(r,task)
        except Error:
            task=saved;break
    assert lost and task['state']['execution']['media'][0].get('publication')
    task=finish(r,task);item=task['state']['execution']['media'][0]
    assert item['publication_unconfirmed'] and not item.get('created_version') and writes==1
    async def persist(*args):pass
    monkeypatch.setattr(apply,'persist',persist)
    task['state']['execution']['cancelled']=True
    for _ in range(100):
        run(apply.cleanup(r,task))
        if task['state']['execution']['cleanup_index']==1:break
    assert run(r.media_store.get('recover.jpg'))==raw
    assert task['state']['execution']['retained_files']==['recover.jpg']


def test_same_size_wrong_merge_is_not_adopted(pair):
    r=pair[2];task,_=seeded(r);task=advance(r,task)
    pending=task['state']['execution']['media'][0]['merge_pending']
    run(r.cache_store.put(pending['key'],b'z'*pending['size']))
    task=advance(r,task)
    with pytest.raises(Error,match='内容不符'):advance(r,task)
    assert not run(inventory(r.media_store).head('recover.jpg'))


def test_wrong_existing_target_is_never_overwritten(pair):
    r=pair[2];task,raw=seeded(r);wrong=b'z'*len(raw);run(r.media_store.put('recover.jpg',wrong))
    with pytest.raises(Error,match='同名不同内容'):finish(r,task)
    assert run(r.media_store.get('recover.jpg'))==wrong


def test_changed_merge_input_stops_before_stream(pair):
    r=pair[2];task,_=seeded(r);task=advance(r,task)
    pending=task['state']['execution']['media'][0]['merge_pending'];part=pending['parts'][0]
    run(r.cache_store.put(part['key'],b'z'*part['size']))
    with pytest.raises(Error):advance(r,task)
    assert not run(inventory(r.cache_store).head(pending['key']))


def test_worker_hash_budget_shrinks_without_restarting_cursor(pair):
    from backend.app.native.site_sync_limits import budget
    r=pair[2]
    if r.kind=='local':pytest.skip('worker-specific budget')
    task,_=seeded(r)
    for _ in range(80):
        task=advance(r,task);item=task['state']['execution']['media'][0]
        if item.get('verify',{}).get('offset',0)>0:break
    before=item['verify']['offset']
    with budget(r,{'resource_level':2}):task=advance(r,task)
    item=task['state']['execution']['media'][0]
    assert item['verify']['offset']==before+256 and item['verify_block_bytes']==256
    task=advance(r,task)
    assert task['state']['execution']['media'][0]['verify']['offset']==before+512


def test_local_incomplete_compose_temp_is_removed_on_retry(local_pair):
    r=local_pair[2];task,_=seeded(r);task=advance(r,task)
    pending=task['state']['execution']['media'][0]['merge_pending'];path=inventory(r.cache_store).path(pending['key'])
    temp=path.with_name(path.name+'.sync-compose.tmp');temp.parent.mkdir(parents=True,exist_ok=True);temp.write_bytes(b'partial')
    task=advance(r,task)
    assert not temp.exists() and run(inventory(r.cache_store).head(pending['key']))


def test_hash_checkpoint_ack_loss_reloads_saved_state(pair,monkeypatch):
    r=pair[2];task,raw=seeded(r,size=140000)
    for _ in range(100):
        task=advance(r,task)
        if task['state']['execution']['media'][0].get('verify',{}).get('offset',0)>0:break
    previous=task['state']['execution']['media'][0]['verify']['offset'];original=r.sql.batch;lost=False
    async def batch(statements):
        nonlocal lost
        result=await original(statements)
        if not lost and any(sql.startswith('UPDATE sync_tasks SET status=') for sql,args in statements):
            lost=True;raise Error('hash checkpoint reply lost',502,'sync_network')
        return result
    monkeypatch.setattr(r.sql,'batch',batch)
    with pytest.raises(Error):advance(r,task)
    saved=run(tasks.get(r.sql,task['uid']));offset=saved['state']['execution']['media'][0]['verify']['offset']
    assert offset>previous
    saved=finish(r,saved)
    assert saved['state']['execution']['media'][0]['sha256']==hashlib.sha256(raw).hexdigest()


def test_legacy_assembled_checkpoint_remains_resumable(pair):
    r=pair[2];task,raw=seeded(r)
    for _ in range(100):
        task=advance(r,task);item=task['state']['execution']['media'][0]
        if item.get('assembled_version'):break
    item.pop('finalize_stage',None);item.pop('signature_version',None);item.pop('verify_block_bytes',None)
    run(tasks.persist(r.sql,task,status='ready'))
    task=finish(r,run(tasks.get(r.sql,task['uid'])))
    assert run(r.media_store.get('recover.jpg'))==raw


def test_cancel_removes_known_created_file_and_incomplete_local_temp(local_pair):
    from backend.app.native.auth import Auth
    r=local_pair[2];client=local_pair[4];r.auth=Auth(r.sql,r.passwords)
    r.p=run(r.auth.principal(client.cookies.get(r.config.name('session'))))
    task,raw=seeded(r);task=finish(r,task)
    item=task['state']['execution']['media'][0];assert item['created_version']
    path=inventory(r.media_store).path(item['key']);temp=path.with_name(path.name+'.sync-compose.tmp');temp.write_bytes(b'partial')
    task['state']['execution']['cancelled']=True
    for _ in range(100):
        run(apply.cleanup(r,task))
        if task['state']['execution']['cleanup_index']==1:break
    assert not temp.exists() and run(inventory(r.media_store).head(item['key'])) is None
