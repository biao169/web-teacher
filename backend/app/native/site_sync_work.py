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
CONTENT_ROWS=5
VERSION_ROWS=20
PAGE_BYTES=64*1024
RECORD_BYTES=200000
TOTAL_ROWS=2000
TOTAL_BYTES=4*1024*1024
REQUEST_INTERVAL_MS=1000
MEDIA_CHUNK_BYTES=65536
MEDIA_FILE_BYTES=20*1024*1024
MEDIA_TOTAL_BYTES=24*1024*1024
CLEANUP_BATCH=4
REFERENCE_ROWS=1
DEPENDENCY_ROWS=5
RETRY_SECONDS=(2,5,15)
RETRY_CODES=('sync_timeout','sync_overloaded','sync_locked','sync_network','sync_stream',
             'sync_http_429','sync_http_502','sync_http_503','sync_http_504')

def retry_state(error,prior):
    count=prior.get('retry_count',0)+1
    allowed=error.code in RETRY_CODES and count<=len(RETRY_SECONDS)
    return {'retry_count':count,'retryable':allowed,
            'retry_after':now(seconds=RETRY_SECONDS[count-1]) if allowed else None}

def can_retry(work):
    return bool(work.get('retryable') and work.get('retry_after') and work['retry_after']<=now())

def policy():
    return {'mode':'low','content_rows':CONTENT_ROWS,'version_rows':VERSION_ROWS,
            'page_bytes':PAGE_BYTES,'record_bytes':RECORD_BYTES,'request_interval_ms':REQUEST_INTERVAL_MS,
            'media_chunk_bytes':MEDIA_CHUNK_BYTES,'cleanup_batch':CLEANUP_BATCH,
            'reference_rows':REFERENCE_ROWS,'dependency_rows':DEPENDENCY_ROWS,
            'retry_seconds':list(RETRY_SECONDS),'retry_codes':list(RETRY_CODES)}

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

def step(name):
    """One leased request, durable last-start/last-complete/error; no implicit replay."""
    def decorate(fn):
        @wraps(fn)
        async def run(r,uid,*args,**kwargs):
            if not isinstance(uid,str) or not uid or len(uid)>128:raise Error('任务标识无效')
            async with task_lease(r,uid) as owner:
                before=await position(r.sql,uid);prior=before['work']
                # Termination can leave only the running marker. Bound repeated recovery
                # even when the runtime never reaches our exception handler.
                uncertain=prior.get('retry_count',0)+1 if prior.get('status')=='running' else 0
                if uncertain>len(RETRY_SECONDS):
                    prior.update(status='paused',retryable=False,error='连续步骤未确认完成，请手动继续或重新开始',error_code='sync_unconfirmed')
                    await mark(r.sql,uid,owner,prior)
                    raise Error(prior['error'],409,'sync_unconfirmed')
                work={'operation':name,'status':'running','attempt':prior.get('attempt',0)+1,
                      'started_at':now(),'completed_at':prior.get('completed_at'),
                      'completed_steps':prior.get('completed_steps',0),
                      'phase':stage(before,name),'side':before['side'],
                      'table_index':before['table_index'],'count':before['count'] or 0}
                if uncertain:work['retry_count']=uncertain
                await mark(r.sql,uid,owner,work)
                started=time.monotonic()
                try:
                    with operation('task:'+name):result=await fn(r,uid,*args,**kwargs)
                except Error as exc:
                    # 1102 termination may skip this handler; the last running checkpoint survives.
                    work.update(status='paused',elapsed_ms=round((time.monotonic()-started)*1000),failed_at=now(),error=exc.message[:800],error_code=exc.code,**retry_state(exc,prior))
                    try:await mark(r.sql,uid,owner,work)
                    except Exception:pass  # Preserve the original diagnostic if storage is unavailable.
                    raise
                after=await position(r.sql,uid)
                work.update(status='saved',elapsed_ms=round((time.monotonic()-started)*1000),completed_at=now(),completed_steps=work['completed_steps']+1,
                            phase=stage(after,name),side=after['side'],
                            table_index=after['table_index'],count=after['count'] or 0)
                work.pop('retry_count',None)
                await mark(r.sql,uid,owner,work)
                if isinstance(result,dict):result.update(work=work,request_interval_ms=REQUEST_INTERVAL_MS)
                return result
        return run
    return decorate
