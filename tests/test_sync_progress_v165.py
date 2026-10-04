"""Worker exceptions consume only a consecutive no-progress recovery budget."""
import asyncio,json
import pytest
from backend.app.native import site_sync_work as work
from backend.app.native.site_sync_transport import response_json
from backend.app.native.catalog import Error
from tests.test_sync_checkpoint_v161 import task,patch,pos
from tests.test_sync_recovery_v163 import due
run=asyncio.run

@pytest.mark.parametrize('code',['1101',1101,'1102',1102])
@pytest.mark.parametrize('operation,path',[
 ('advance','count'),('prepare','load_index'),('begin','begin_plan.index'),
 ('execute','execution.offset'),('execute','execution.cleanup_offset'),
 ('proposal-send','proposal_check.version_count'),
])
def test_progress_survives_more_than_worker_retry_limit(task,code,operation,path):
 @work.step(operation)
 async def advance(r,uid):
  patch(r,path,pos_value[0]);raise Error('Worker interrupted',503,code)
 pos_value=[0]
 for i in range(35):
  pos_value[0]=i+1
  with pytest.raises(Error):run(advance(task,'task'))
  saved=pos(task)['work']
  assert saved['retryable'] and saved['retry_count']==0 and saved['stalled_attempts']==0
  assert saved['last_outcome']=='progress_after_error' and saved['retry_after']
  due(task)
 assert saved['total_failures']==saved['failures_with_progress']==35
 assert saved['no_progress_failures']==0 and saved['last_error_code']==code

@pytest.mark.parametrize('code',['1101','1102'])
def test_worker_error_without_progress_exhausts_budget(task,code):
 @work.step('execute')
 async def fail(*args):raise Error('Worker interrupted',503,code)
 for _ in range(31):
  with pytest.raises(Error):run(fail(task,'task'))
  due(task)
 saved=pos(task)['work']
 assert not saved['retryable'] and saved['retry_count']==31
 assert saved['no_progress_failures']==31 and saved['failures_with_progress']==0
 assert saved['last_outcome']=='no_progress_error'

@pytest.mark.parametrize('path',['outgoing.confirmed','approval.ready'])
def test_proposal_and_review_receipts_are_progress(task,path):
 @work.step('proposal-send')
 async def save(r,uid):
  patch(r,path,True);raise Error('lost response',503,'1101')
 with pytest.raises(Error):run(save(task,'task'))
 assert pos(task)['work']['failures_with_progress']==1

@pytest.mark.parametrize('path',['execution.batch_size','execution.media[0].chunk_bytes'])
def test_batch_width_change_is_not_progress(task,path):
 before=pos(task)['checkpoint']
 if 'media' in path:patch(task,'execution.media',[{'chunk_bytes':4096}])
 else:patch(task,path,4)
 assert pos(task)['checkpoint']==before

def test_failure_history_survives_later_success(task):
 @work.step('execute')
 async def fail(*args):raise Error('Worker interrupted',503,'1102')
 with pytest.raises(Error):run(fail(task,'task'))
 due(task)
 @work.step('execute')
 async def success(r,uid):patch(r,'execution.offset',10);return {}
 saved=run(success(task,'task'))['work']
 assert saved['last_error_code']=='1102' and saved['last_error_at']
 assert saved['retry_count']==0 and saved['last_outcome']=='progress'
 assert saved['total_failures']==1 and saved['no_progress_failures']==1

@pytest.mark.parametrize('code',['1101','1102'])
@pytest.mark.parametrize('kind',['json','html','header'])
def test_edge_error_code_retained_on_http_500(code,kind):
 body=json.dumps({'error_code':int(code)}) if kind=='json' else '<title>Error '+code+'</title>'
 headers={'cf-error-type':code} if kind=='header' else {}
 with pytest.raises(Error) as raised:response_json(500,body.encode(),headers)
 assert raised.value.code==code
 assert work.retry_state(raised.value,{},checkpointed=True)['retryable']

def test_ordinary_internal_error_is_not_worker_resource_error():
 with pytest.raises(Error) as raised:response_json(500,b'{"error":"application failed"}')
 assert raised.value.code=='sync_http_500'
 assert not work.retry_state(raised.value,{},checkpointed=True)['retryable']

@pytest.mark.parametrize('path',['execution.cleanup_width','execution.media'])
def test_completed_merge_or_cleanup_level_is_progress(task,path):
 before=pos(task)['checkpoint']
 patch(task,path,[{'merge_width':65536,'merge_offset':0}] if path.endswith('media') else 65536)
 assert pos(task)['checkpoint']!=before
