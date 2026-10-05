"""Shared low-load policy and durable task steps for browser and scheduler.

A small JSON patch stores step metadata without serializing the whole task again.
The existing database lease prevents two executors from advancing the same task.
"""
import json,time,hashlib
from functools import wraps
from contextlib import asynccontextmanager
from .catalog import Error,now
from .data_tools import encoded
from .media_locks import lease,live_lease
from .site_sync_diagnostics import operation
from .site_sync_checkpoint import PROJECTION,observe

PROTOCOL=7
TASK_FORMAT=8
from .site_sync_limits import (
    CONTENT_ROWS,VERSION_ROWS,PAGE_BYTES,RECORD_BYTES,TOTAL_ROWS,TOTAL_BYTES,
    REQUEST_INTERVAL_MS,MEDIA_CHUNK_BYTES,MEDIA_FILE_BYTES,MEDIA_TOTAL_BYTES,
    CLEANUP_BATCH,REFERENCE_ROWS,DEPENDENCY_ROWS,for_resource,capped_rows,budget,pressured,
)
RETRY_CODES=('sync_timeout','sync_overloaded','sync_locked','sync_network','sync_stream',
             'sync_http_429','sync_http_502','sync_http_503','sync_http_504','sync_unconfirmed','1101',1101,'1102',1102)

def retry_state(error,prior,resource=None,*,checkpointed=False,progressed=False):
    from .site_sync_recovery import retry
    return retry(error.code,prior,resource,checkpointed=checkpointed,progressed=progressed,clock=now)



def can_retry(work):
    return bool(work.get('retryable') and work.get('retry_after') and work['retry_after']<=now())

def policy(resource=None,remote=None):
    limits=for_resource(resource)
    peer=remote if isinstance(remote,dict) else {}
    # Media size is frozen per file after media-head capability negotiation.
    # Keep the legacy wire ceiling; expose the preferred width separately.
    return {'mode':limits['mode'],'content_rows':capped_rows(peer.get('content_rows'),limits['content_rows']),
            'version_rows':capped_rows(peer.get('version_rows'),limits['version_rows']),
            'brief_rows':capped_rows(peer.get('brief_rows'),limits['brief_rows']),
            'page_bytes':PAGE_BYTES,'record_bytes':RECORD_BYTES,'request_interval_ms':limits['request_interval_ms'],
            'media_chunk_bytes':MEDIA_CHUNK_BYTES,'preferred_media_chunk_bytes':limits['media_chunk_bytes'],
            'adaptive_media_ranges':1,'cleanup_batch':limits['cleanup_batch'],
            'reference_rows':REFERENCE_ROWS,'dependency_rows':DEPENDENCY_ROWS,
            'no_progress_retry_limit':limits['no_progress_retry_limit'],'background_slow_retry':True,
            'retry_seconds':list(limits['retry_seconds']),'retry_codes':list(RETRY_CODES)}

def lock_key(uid):return 'site-sync:task:'+uid

@asynccontextmanager
async def task_lease(r,uid):
    entered=False
    try:
        async with lease(r,lock_key(uid),'edit') as owner:
            entered=True
            yield owner
    except Exception as exc:
        if not entered and ('constraint' in str(exc).lower() or isinstance(exc,Error) and exc.status==409):
            raise Error('任务正在由其他请求推进，或权限状态已变化；稍后刷新并继续原任务',409,'sync_busy') from None
        raise

async def position(sql,uid,*,checkpoint=True):
    rows=await sql.query("SELECT "+(PROJECTION if checkpoint else "NULL")+" AS checkpoint,status,json_extract(state,'$.preview_format') AS task_format,json_extract(state,'$.work') AS work,json_extract(state,'$.execution.phase') AS execution_phase,json_extract(state,'$.phase') AS phase,json_extract(state,'$.side') AS side,json_extract(state,'$.table_index') AS table_index,json_extract(state,'$.count') AS count FROM sync_tasks WHERE uid=?",(uid,))
    if not rows:raise Error('预览不存在或已清理',404)
    row=rows[0]
    if row['task_format']!=TASK_FORMAT:raise Error('旧版同步任务不能继续，请重新生成预览；不要重置业务数据库',409)
    if checkpoint:row['checkpoint']=hashlib.sha256(row['checkpoint'].encode()).hexdigest()
    row['work']=json.loads(row['work']) if row['work'] else {}
    return row

async def mark(sql,uid,owner,value):
    condition,args=live_lease(lock_key(uid),owner)
    result=await sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?),'$._sync_revision',lower(hex(randomblob(16)))) WHERE uid=? AND "+condition+' RETURNING uid',(encoded(value).decode(),uid,*args))])
    if not result[0]:raise Error('任务锁已失效，未保存本次运行状态；稍后核对原任务',409,'sync_busy')

def stage(row,name):
    return row['execution_phase'] or {'begin':'confirm','proposal-send':'proposal-check','select':'selection','review-finish':'approval-review'}.get(name,row['phase'])

def retry_gate(row,name,*,cancel=False):
    """Reject early without creating a lease or replaying expensive work."""
    work=row['work']
    # A different operation must not bypass an unconfirmed request's wait.
    if work.get('status')=='running' and work.get('recover_after','')>now():
        raise Error('上一步回执未确认；恢复窗口结束后再核对进度',429,'sync_retry_wait')
    if name=='select':return
    # Cancellation cleanup remains available even after a failed transfer.
    if work.get('operation')!=name:return
    if cancel and work.get('status')!='running':return
    deadline=work.get('recover_after') if work.get('status')=='running' else work.get('retry_after')
    if deadline and deadline>now():
        raise Error('任务正在冷却等待，进度已保存；请等待 '+deadline+' 后继续',429,'sync_retry_wait')
    if work.get('status')=='paused' and not work.get('retryable'):
        raise Error('自动重试已停止；请检查原因后点击继续或重新开始',409,'sync_retry_exhausted')

async def reconcile(r,uid):
    """One cheap, durable reconciliation tick; never execute business work here.

    Caller must hold current sync authorization. The task lease and existing
    global execution lock protect against overlap; the scheduler owns its own
    distinct lease. A repeated call observes the saved result without recounting.
    """
    row=await position(r.sql,uid,checkpoint=False)
    if row['status'] not in ('reading','ready'):raise Error('任务已过期或被替代，不能自动恢复',409,'sync_retry_exhausted')
    if row['work'].get('status')!='running':return row['work']
    retry_gate(row,row['work'].get('operation'))
    busy=await r.sql.query("SELECT 1 FROM admin_mutation_guards WHERE uid='site-sync:run' AND created_at>=?",(now(seconds=-300),))
    if busy:raise Error('原同步执行锁尚未到期；稍后核对',409,'sync_busy')
    async with task_lease(r,uid) as owner:
        row=await position(r.sql,uid);prior=row['work']
        if row['status'] not in ('reading','ready'):raise Error('任务已过期或被替代，不能自动恢复',409,'sync_retry_exhausted')
        if prior.get('status')!='running':return prior
        retry_gate(row,prior.get('operation'))
        from .site_sync_recovery import recovered
        saved=recovered(row,r)
        await mark(r.sql,uid,owner,saved)
        return saved


def step(name):
    """One leased request, durable last-start/last-complete/error; no implicit replay."""
    def decorate(fn):
        @wraps(fn)
        async def run(r,uid,*args,**kwargs):
            if not isinstance(uid,str) or not uid or len(uid)>128:raise Error('任务标识无效')
            cancel=name=='execute' and bool(kwargs.get('cancel',args[0] if args else False))
            retry_gate(await position(r.sql,uid,checkpoint=False),name,cancel=cancel)
            async with task_lease(r,uid) as owner:
                before=await position(r.sql,uid);retry_gate(before,name,cancel=cancel);prior=before['work']
                uncertain=prior.get('status')=='running'
                observed=observe(prior,before['checkpoint'],now(),uncertain=uncertain)
                if uncertain:
                    observed.update(last_error_code='sync_unconfirmed',last_error_at=now())
                progressed=observed['progress_events']>prior.get('progress_events',0)
                recovery=retry_state(Error('步骤回执未确认',503,'sync_unconfirmed'),prior,r,
                                     checkpointed=True,progressed=progressed) if uncertain else None
                if recovery and not recovery['retryable'] and not cancel:
                    prior.update(observed);prior.update(recovery)
                    prior.update(status='paused',error='连续无进展恢复次数已用尽，请检查原因后手动继续或取消',error_code='sync_unconfirmed')
                    await mark(r.sql,uid,owner,prior)
                    raise Error(prior['error'],409,'sync_unconfirmed')
                work={'operation':name,'status':'running','attempt':prior.get('attempt',0)+1,
                      'started_at':now(),'recover_after':now(seconds=300),'completed_at':prior.get('completed_at'),
                      'completed_steps':prior.get('completed_steps',0),
                      'resource_level':pressured(r,prior,'sync_unconfirmed' if uncertain else None),
                      'phase':stage(before,name),'side':before['side'],
                      'table_index':before['table_index'],'count':before['count'] or 0}
                work.update(observed)
                work['retry_count']=0 if cancel or progressed else (recovery['retry_count'] if recovery else prior.get('retry_count',0))
                if recovery and recovery['retry_after']:
                    work['recover_after']=max(work['recover_after'],recovery['retry_after'])
                await mark(r.sql,uid,owner,work)
                started=time.monotonic()
                try:
                    with budget(r,work),operation('task:'+name):
                        result=await fn(r,uid,*args,**kwargs)
                        interval=for_resource(r)['request_interval_ms']
                except Exception as exc:
                    error=exc if isinstance(exc,Error) else Error('步骤异常，已保留进度；请检查服务端日志后继续',500,'sync_internal')
                    # 1101/1102 termination may skip this handler; the last running checkpoint survives.
                    work.update(status='paused',elapsed_ms=round((time.monotonic()-started)*1000),failed_at=now(),error=error.message[:800],error_code=error.code)
                    try:
                        failed=await position(r.sql,uid)
                        checkpoint=failed['checkpoint']
                    except Exception:checkpoint=work['checkpoint']
                    evidence=observe(work,checkpoint,now(),failed=True)
                    work.update(retry_state(error,work,r,checkpointed=True,progressed=evidence['progress_events']>work['progress_events']))
                    work.update(evidence)
                    work.update(last_error_code=error.code,last_error_at=work['failed_at'],resource_level=pressured(r,work,error.code))
                    try:await mark(r.sql,uid,owner,work)
                    except Exception:pass  # Preserve the original diagnostic if storage is unavailable.
                    raise
                after=await position(r.sql,uid)
                work.update(status='saved',elapsed_ms=round((time.monotonic()-started)*1000),completed_at=now(),completed_steps=work['completed_steps']+1,
                            phase=stage(after,name),side=after['side'],
                            table_index=after['table_index'],count=after['count'] or 0)
                work['request_interval_ms']=interval
                if work['resource_level']:work['pace_after']=now(seconds=interval/1000)
                evidence=observe(work,after['checkpoint'],now(),finished=True)
                if evidence['progress_events']>work['progress_events']:work['retry_count']=0
                work.update(evidence);work.pop('recover_after',None)
                await mark(r.sql,uid,owner,work)
                if isinstance(result,dict):
                    if result.get('uid',uid)==uid:result.update(work=work,request_interval_ms=interval)
                    else:result.update(parent_uid=uid,request_interval_ms=interval)
                return result
        return run
    return decorate
