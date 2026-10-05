"""Advance one latest-preview page without web, renderer or storage resources.

Other phases are rejected; the next scheduler invocation reselects its path.
The existing page implementation, signed transport and durable step are reused.
"""
from types import SimpleNamespace
from .catalog import Error,now
from .data_tools import encoded
from .site_sync_background import context
from .site_sync_gate import KEY,STATE,checkpoint,lease_until,dispatch
from .site_sync_manual_gate import PREFIX,binding
from .site_sync_latest_gate import select,STABLE
from .site_sync_initialization import advance,failed,Superseded,Unavailable
from .site_sync_work import retry_state
from .site_sync_recovery import MODULES
from .media_locks import lease
from . import site_sync_tasks as tasks

def put(key,value):
    return ('INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,encoded(value).decode()))

class GuardedSQL:
    """Recheck the frozen grant and narrow phase inside every task-write batch."""
    def __init__(self,sql,r,condition,args):self.base=sql;self.r=r;self.condition=condition;self.args=args
    async def query(self,sql,args=()):return await self.base.query(sql,args)
    async def batch(self,statements):
        guarded=any(sql.lstrip().upper().startswith(('UPDATE SYNC_TASKS','INSERT INTO SYNC_TASK_ITEMS','DELETE FROM SYNC_TASK_ITEMS')) for sql,_ in statements)
        if guarded:
            gid,guard=self.r.auth.guard(self.r.p,'data_tools','edit',self.condition,self.args)
            statements=[guard,*statements,('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))]
        result=await self.base.batch(statements)
        return result[1:-1] if guarded else result


async def run(sql,choice,*,kind='r2'):
    uid=choice['uid'];manual=choice['manual'];policy=choice['policy'];key=choice['key']
    deadline=await lease_until(sql,uid)
    if deadline and deadline>now():return {'skipped':'busy','task_uid':uid}
    base=SimpleNamespace(sql=sql,kind=kind,passwords=None)
    old=policy if manual else choice['state'];before=choice['before'] if manual else encoded(old).decode()
    value={**old,'updated_at':now()};row_before=await checkpoint(sql,uid);started=False
    try:
        r=await context(base,policy,policy_key=key,read_only=True)
        await advance('execution_lease')
        async with lease(r,'site-sync:schedule-run','edit'):
            # Never reuse a routing decision after a browser changed this task/grant.
            fresh=await select(sql,uid)
            if not fresh or fresh['policy']!=policy or fresh['manual']!=manual or fresh['task_binding']!=choice['task_binding'] or (not manual and fresh['state']!=old):
                return {'skipped':'phase-changed','task_uid':uid}
            condition='EXISTS(SELECT 1 FROM sync_tasks WHERE uid=? AND '+STABLE+' AND '+binding('read')+'=json(?))';args=(uid,encoded(choice['task_binding']).decode())
            modules=(*MODULES,'data_tools')
            condition+=' AND (SELECT count(DISTINCT module) FROM auth_permissions WHERE role_uid=? AND module IN ('+','.join('?' for _ in modules)+') AND can_view=1 AND can_edit=1 AND can_export=1)=?'
            args+=(r.p['role_uid'],*modules,len(modules))
            if manual:
                # BackgroundAuth also binds the entire saved grant and task selection.
                rows=await sql.query('SELECT '+binding('read')+' AS binding FROM sync_tasks WHERE uid=?',(uid,))
                import json
                if not rows or json.loads(rows[0]['binding'])!=policy['binding']:
                    raise Error('已确认的任务范围发生变化，请重新确认',409,'sync_grant_changed')
            else:
                condition+=' AND EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?) AND NOT EXISTS(SELECT 1 FROM service_meta WHERE key=?)'
                args+=(STATE,before,PREFIX+uid)
            r.sql=GuardedSQL(sql,r,condition,args)
            await advance('business_step');started=True
            result=await tasks.advance_latest(r,uid)
            await advance('receipt_save')
            value.update(message='后台分批读取最新候选',updated_at=now())
            if manual:
                value.pop('error_code',None)
                # Like the full path, finishing the read never selects/approves content.
                if result.get('status')=='ready':value['message']='候选读取已完成，下一轮等待人工选择或确认'
                target=key
            else:
                target=STATE;value['task_uid']=uid
                for name in ('error','error_code','retry_after','retry_count','retryable','wait_reason','next_attempt_at'):value.pop(name,None)
            gid,guard=r.auth.guard(r.p,'data_tools','edit','EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(target,before))
            await sql.batch([guard,put(target,value),dispatch('manual' if manual else 'scheduled',now()),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
            return {'status':'ok','task_uid':uid,'manual':manual,'message':value['message']}
    except (Superseded,Unavailable):raise
    except Exception as exc:
        failed(exc)
        if isinstance(exc,Error) and exc.code in ('sync_busy','sync_retry_wait'):
            return {'skipped':'busy' if exc.code=='sync_busy' else 'interval','task_uid':uid}
        if not isinstance(exc,Error):raise  # independent runtime backoff; never silently revoke a grant
        row=await checkpoint(sql,uid) if started else None
        fresh=row and (row.get('work_attempt'),row.get('work_failed_at'))!=(row_before.get('work_attempt'),row_before.get('work_failed_at'))
        retry=retry_state(exc,old,base,checkpointed=True)
        if fresh and row.get('work_status')=='paused' and row.get('error_code')==exc.code:
            retry={name:row.get(name) for name in ('retryable','retry_after')}
        if manual:
            value.update(enabled=retry['retryable'],due=retry['retry_after'] or now(),message=exc.message[:500],error_code=exc.code)
            if 'retry_count' in retry:value['retry_count']=retry['retry_count']
            await sql.batch([('UPDATE service_meta SET value=? WHERE key=? AND value=?',(encoded(value).decode(),key,before))])
        else:
            value.update(retry,error=exc.message[:500],error_code=exc.code,updated_at=now())
            await sql.batch([('UPDATE service_meta SET value=? WHERE key=? AND value=? AND EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(encoded(value).decode(),STATE,before,KEY,encoded(policy).decode()))])
            if exc.status in (401,403):raise
        return {'status':'paused','task_uid':uid,'error':exc.message[:500],'error_code':exc.code}
