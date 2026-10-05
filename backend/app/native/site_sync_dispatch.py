"""Durable scheduler receipts independent of business task receipts."""
import secrets
from types import SimpleNamespace
from .site_sync_gate import load,probe,KEY as POLICY
from .site_sync_recovery import now,encoded,selected,reconcile
from .site_sync_initialization import Timeline,recording,Superseded,previous
KEY='site-sync:scheduler-health'
PREFIX='site-sync:scheduler-attempt:'

def put(key,value):
    return ('INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,encoded(value)))

async def _run(sql,execute,*,kind):
    at=now()
    # A separate arrival timestamp survives even if eligibility checks fail.
    await sql.batch([put(KEY,{'arrived_at':at,'source':kind})])
    choice=await selected(sql);uid=choice[0] if choice else None
    key=PREFIX+(uid or 'scheduled');prior=await load(sql,key)
    token=secrets.token_hex(16)
    health={'arrived_at':at,'source':kind,'task_uid':uid}
    await sql.batch([put(KEY,health)])
    # A grant replacement is a deliberate administrator recovery action.
    revision=choice[2].get('revision') if choice else (await load(sql,POLICY)).get('revision')
    if prior.get('grant_revision')==revision and (prior.get('retry_after','')>at or prior.get('retryable') is False):
        health.update(skipped='recovery-backoff' if prior.get('retryable') is not False else 'needs-attention')
        await sql.batch([put(KEY,health)])
        return {'skipped':health['skipped']}
    result=await probe(sql)
    if result.get('skipped'):
        health.update(result);await sql.batch([put(KEY,health)]);return result
    interrupted=bool(prior.get('started_at') and not prior.get('finished_at') and prior.get('grant_revision')==revision)
    failures=prior.get('failures',0)+int(interrupted)
    receipt={**health,'token':token,'grant_revision':revision,'stage':'reconcile','started_at':at,
             'retryable':True,'retry_after':now(min(3600,300*2**min(failures,4))),'failures':failures}
    if prior.get('initialization'):
        receipt['previous_initialization']=previous(prior['initialization'])
    timeline=Timeline(receipt);timeline.begin('receipt_reconcile')
    before=encoded(receipt)
    # Only one scheduler can own this receipt until it ends or its window expires.
    old=encoded(prior)
    if prior:
        changed=await sql.batch([('UPDATE service_meta SET value=? WHERE key=? AND value=? RETURNING key',(before,key,old))])
    else:
        changed=await sql.batch([('INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING RETURNING key',(key,before))])
    if not changed[0]:return {'skipped':'busy'}
    timeline.ready()
    async def save():
        nonlocal before
        value=encoded(receipt)
        changed=await sql.batch([('UPDATE service_meta SET value=? WHERE key=? AND value=? RETURNING key',(value,key,before))])
        if not changed[0]:return False
        before=value;return True
    try:
        with recording(timeline,save):
            result=await reconcile(sql,choice,SimpleNamespace(kind=kind))
            timeline.close()
            if result is None:
                receipt.update(stage='initialize',reconcile_finished_at=now())
                if not await save():return {'skipped':'busy'}
                result=await execute(uid)
        timeline.finish('paused' if result.get('status')=='paused' else 'completed')
        receipt.update(stage='finished',finished_at=now(),result=result.get('status') or result.get('skipped') or 'ok',failures=0,retry_after='',retryable=True)
        if result.get('status')=='paused':
            receipt.update(error_code=result.get('error_code','sync_background'),error=result.get('error') or result.get('message','后台步骤暂停'))
        await save();return result
    except Superseded:
        return {'skipped':'busy'}
    except Exception as exc:
        timeline.fail(exc);timeline.finish('paused')
        count=failures+1
        permanent=isinstance(exc,PermissionError) or getattr(exc,'status',None) in (401,403)
        receipt.update(finished_at=now(),failures=count,error_code=str(getattr(exc,'code',None) or type(exc).__name__),
                       error='后台授权或任务状态已变化，请检查后恢复后台' if permanent else '后台初始化或核对未完成；已安排独立退避重试',
                       retryable=not permanent,retry_after='' if permanent else now(min(3600,60*2**min(count-1,6))))
        await save()
        return {'status':'paused','error':receipt['error'],'error_code':receipt['error_code']}


async def run(sql,execute,*,kind):
    health=await load(sql,KEY)
    if health.get('gate_retry_after','')>now():
        health.update(arrived_at=now(),source=kind,skipped='recovery-backoff')
        await sql.batch([put(KEY,health)])
        return {'skipped':'recovery-backoff'}
    try:return await _run(sql,execute,kind=kind)
    except Exception as exc:
        # Eligibility/storage failures must not disappear behind a task's running badge.
        count=health.get('gate_failures',0)+1
        health={'arrived_at':now(),'source':kind,'stage':'eligibility','gate_failures':count,
                'error_code':type(exc).__name__,'error':'后台资格检查未完成；稍后自动重试',
                'gate_retry_after':now(min(3600,60*2**min(count-1,6)))}
        # If storage itself is unavailable, let the runtime record the failure.
        await sql.batch([put(KEY,health)])
        return {'status':'paused','error':health['error'],'error_code':health['error_code']}
