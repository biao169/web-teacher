"""Shared low-load policy and durable task steps for browser and scheduler.

A small JSON patch stores step metadata without serializing the whole task again.
The existing database lease prevents two executors from advancing the same task.
"""
import json,time
from functools import wraps
from contextlib import asynccontextmanager
from .catalog import Error,now
from .data_tools import encoded
from .media_locks import lease,live_lease
from .site_sync_diagnostics import operation

PROTOCOL=7
TASK_FORMAT=8
from .site_sync_limits import (
    CONTENT_ROWS,VERSION_ROWS,PAGE_BYTES,RECORD_BYTES,TOTAL_ROWS,TOTAL_BYTES,
    REQUEST_INTERVAL_MS,MEDIA_CHUNK_BYTES,MEDIA_FILE_BYTES,MEDIA_TOTAL_BYTES,
    CLEANUP_BATCH,REFERENCE_ROWS,DEPENDENCY_ROWS,for_resource,capped_rows,
)
RETRY_SECONDS=(5,15,60)
RETRY_CODES=('sync_timeout','sync_overloaded','sync_locked','sync_network','sync_stream',
             'sync_http_429','sync_http_502','sync_http_503','sync_http_504')

def retry_state(error,prior,resource=None):
    delays=for_resource(resource)['retry_seconds']
    count=prior.get('retry_count',0)+1
    allowed=error.code in RETRY_CODES and count<=len(delays)
    return {'retry_count':count,'retryable':allowed,
            'retry_after':now(seconds=delays[count-1]) if allowed else None}

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
            'page_bytes':PAGE_BYTES,'record_bytes':RECORD_BYTES,'request_interval_ms':REQUEST_INTERVAL_MS,
            'media_chunk_bytes':MEDIA_CHUNK_BYTES,'preferred_media_chunk_bytes':limits['media_chunk_bytes'],
            'adaptive_media_ranges':1,'cleanup_batch':limits['cleanup_batch'],
            'reference_rows':REFERENCE_ROWS,'dependency_rows':DEPENDENCY_ROWS,
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

async def position(sql,uid):
    rows=await sql.query("SELECT status,json_extract(state,'$.preview_format') AS task_format,json_extract(state,'$.work') AS work,json_extract(state,'$.execution.phase') AS execution_phase,json_extract(state,'$.phase') AS phase,json_extract(state,'$.side') AS side,json_extract(state,'$.table_index') AS table_index,json_extract(state,'$.count') AS count FROM sync_tasks WHERE uid=?",(uid,))
    if not rows:raise Error('预览不存在或已清理',404)
    row=rows[0]
    if row['task_format']!=TASK_FORMAT:raise Error('旧版同步任务不能继续，请重新生成预览；不要重置业务数据库',409)
    row['work']=json.loads(row['work']) if row['work'] else {}
    return row

async def mark(sql,uid,owner,value):
    condition,args=live_lease(lock_key(uid),owner)
    await sql.batch([("UPDATE sync_tasks SET state=json_set(state,'$.work',json(?)) WHERE uid=? AND "+condition,(encoded(value).decode(),uid,*args))])

def stage(row,name):
    return row['execution_phase'] or {'begin':'confirm','proposal-send':'proposal-check','select':'selection','review-finish':'approval-review'}.get(name,row['phase'])

def retry_gate(row,name):
    """Reject early without creating a lease or replaying expensive work."""
    work=row['work']
    if name=='select':return
    # Cancellation cleanup remains available even after a failed transfer.
    if row.get('execution_phase')=='cleanup' or work.get('operation')!=name:return
    deadline=work.get('recover_after') if work.get('status')=='running' else work.get('retry_after')
    if deadline and deadline>now():
        raise Error('任务正在冷却等待，进度已保存；请等待 '+deadline+' 后继续',429,'sync_retry_wait')
    if work.get('status')=='paused' and not work.get('retryable'):
        raise Error('自动重试已停止；请检查原因后点击继续或重新开始',409,'sync_retry_exhausted')

def step(name):
    """One leased request, durable last-start/last-complete/error; no implicit replay."""
    def decorate(fn):
        @wraps(fn)
        async def run(r,uid,*args,**kwargs):
            if not isinstance(uid,str) or not uid or len(uid)>128:raise Error('任务标识无效')
            retry_gate(await position(r.sql,uid),name)
            async with task_lease(r,uid) as owner:
                before=await position(r.sql,uid);retry_gate(before,name);prior=before['work']
                # Termination can leave only the running marker. Bound repeated recovery
                # even when the runtime never reaches our exception handler.
                uncertain=prior.get('retry_count',0)+1 if prior.get('status')=='running' else 0
                if uncertain>len(RETRY_SECONDS):
                    prior.update(status='paused',retryable=False,error='连续步骤未确认完成，请手动继续或重新开始',error_code='sync_unconfirmed')
                    await mark(r.sql,uid,owner,prior)
                    raise Error(prior['error'],409,'sync_unconfirmed')
                work={'operation':name,'status':'running','attempt':prior.get('attempt',0)+1,
                      'started_at':now(),'recover_after':now(seconds=300),'completed_at':prior.get('completed_at'),
                      'completed_steps':prior.get('completed_steps',0),
                      'phase':stage(before,name),'side':before['side'],
                      'table_index':before['table_index'],'count':before['count'] or 0}
                if uncertain:work['retry_count']=uncertain
                await mark(r.sql,uid,owner,work)
                started=time.monotonic()
                try:
                    with operation('task:'+name):result=await fn(r,uid,*args,**kwargs)
                except Exception as exc:
                    error=exc if isinstance(exc,Error) else Error('步骤异常，已保留进度；请检查服务端日志后继续',500,'sync_internal')
                    # 1102 termination may skip this handler; the last running checkpoint survives.
                    work.update(status='paused',elapsed_ms=round((time.monotonic()-started)*1000),failed_at=now(),error=error.message[:800],error_code=error.code,**retry_state(error,prior,r))
                    try:await mark(r.sql,uid,owner,work)
                    except Exception:pass  # Preserve the original diagnostic if storage is unavailable.
                    raise
                after=await position(r.sql,uid)
                work.update(status='saved',elapsed_ms=round((time.monotonic()-started)*1000),completed_at=now(),completed_steps=work['completed_steps']+1,
                            phase=stage(after,name),side=after['side'],
                            table_index=after['table_index'],count=after['count'] or 0)
                work.pop('retry_count',None);work.pop('recover_after',None)
                await mark(r.sql,uid,owner,work)
                if isinstance(result,dict):result.update(work=work,request_interval_ms=REQUEST_INTERVAL_MS)
                return result
        return run
    return decorate
