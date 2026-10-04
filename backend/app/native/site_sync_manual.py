"""Per-task grants for manually requested work; never grant future synchronizations."""
import json,secrets
from .catalog import Error,now
from .data_tools import authorize,encoded
from . import site_sync as core,site_sync_tasks as tasks,site_sync_apply as apply,site_sync_proposals as proposals
from .site_sync_manual_gate import PREFIX,binding,candidate
from .site_sync_gate import load,checkpoint,waiting,lease_until,dispatch
from .media_locks import lease

MODES=('read','prepare','pull','approve','send','receipt','execute','cancel')

def put(key,value):
    return ('INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,encoded(value).decode()))

def grant(r,uid,state,mode):
    values=[state.get(k) for k in ('direction','scopes','remote_id','peer_revision')]
    if mode!='read':values += [state.get('selection',{}).get('selected'),state.get('approval',{}).get('request_id')]
    return {'enabled':True,'task_uid':uid,'mode':mode,'binding':values,'peer_revision':state['peer_revision'],
            'owner':{k:r.p[k] for k in ('uid','role_uid','user_stamp','role_stamp')},
            'revision':secrets.token_hex(16),'due':now(),'updated_at':now(),'message':'本任务已登记后台续跑'}

def creation(r,uid,state,condition='1',args=()):
    """Put the read-only continuation grant in the task creation transaction."""
    authorize(r,'export',core.SCOPES)
    value=grant(r,uid,state,'read');gid,guard=r.auth.guard(r.p,'data_tools','edit',condition,args)
    return [guard,put(PREFIX+uid,value),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))]

async def enroll(r,uid,mode):
    if mode not in MODES:raise Error('续跑动作无效')
    authorize(r,'edit',core.SCOPES);authorize(r,'export',core.SCOPES)
    from .site_sync_work import task_lease,retry_gate,position
    async with task_lease(r,uid):
        row=await position(r.sql,uid,checkpoint=False)
        if row['status'] not in ('reading','ready'):raise Error('任务已过期，不能登记后台续跑',409)
        old=await load(r.sql,PREFIX+uid)
        # Repeated browser checking calls cannot renew a grant or reset its cooldown.
        rows=await r.sql.query('SELECT '+binding(mode)+" AS binding,json_extract(state,'$.lightweight') AS lightweight,json_extract(state,'$.prepared') AS prepared,json_extract(state,'$.approval.ready') AS approval_ready FROM sync_tasks WHERE uid=?",(uid,))
        bound=json.loads(rows[0]['binding'])
        if mode in ('prepare','pull','approve','send') and row['status']!='ready':raise Error('请先完成读取和准备，再确认此操作',409)
        if mode in ('pull','approve','send') and rows[0]['lightweight'] and not rows[0]['prepared']:raise Error('请先准备所选内容并核对依赖',409,'sync_prepare_required')
        if mode=='approve' and not rows[0]['approval_ready']:raise Error('审批准备尚未完成，请稍后核对再批准',409)
        if old.get('enabled') and old.get('owner')=={k:r.p[k] for k in ('uid','role_uid','user_stamp','role_stamp')} and old.get('binding')==bound and (old.get('mode')==mode or mode in ('pull','approve') and old.get('mode')=='execute' or mode=='send' and old.get('mode')=='receipt'):
            return old
        retry_gate(row,'execute' if mode=='cancel' else row['work'].get('operation'),cancel=mode=='cancel')
        peer=await tasks.peer(r.sql)
        if bound[3]!=peer['revision']:raise Error('对端连接已变化，请重新预览',409)
        if mode in ('pull','approve') and bound[0]!='pull' or mode=='send' and bound[0]!='push':raise Error('任务方向不匹配',409)
        if mode=='approve' and not bound[5] or mode=='pull' and bound[5]:raise Error('请通过对应的审批入口确认',409)
        value={'enabled':True,'task_uid':uid,'mode':mode,'binding':bound,'peer_revision':peer['revision'],
               'owner':{k:r.p[k] for k in ('uid','role_uid','user_stamp','role_stamp')},
               'revision':secrets.token_hex(16),'due':now(),'updated_at':now(),'message':'已确认本任务，后台可继续剩余步骤'}
        gid,guard=r.auth.guard(r.p,'data_tools','edit','EXISTS(SELECT 1 FROM sync_tasks WHERE uid=? AND '+binding(mode)+'=json(?))',(uid,encoded(bound).decode()))
        await r.sql.batch([guard,put(PREFIX+uid,value),r.content.audit(r.p,'data_tools','sync_manual_grant',uid,{'mode':mode}),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
        return value

async def pause(r,uid):
    authorize(r,'edit',core.SCOPES)
    old=await load(r.sql,PREFIX+uid)
    if not old:return {'paused':False}
    value={**old,'enabled':False,'paused_by_user':True,'updated_at':now(),'message':'本任务后台续跑已暂停'}
    gid,guard=r.auth.guard(r.p,'data_tools','edit','EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(PREFIX+uid,encoded(old).decode()))
    # A parent may have atomically created its preparation child before the browser got the ID.
    stop_children=("UPDATE service_meta SET value=json_set(value,'$.enabled',json('false'),'$.paused_by_user',json('true'),'$.updated_at',?,'$.message',?) WHERE key IN (SELECT ?||json_extract(state,'$.prepared_uid') FROM sync_tasks WHERE uid=? UNION SELECT ?||json_extract(state,'$.restart_uid') FROM sync_tasks WHERE uid=?)",(now(),'父任务已暂停，子任务停止续跑',PREFIX,uid,PREFIX,uid))
    await r.sql.batch([guard,put(PREFIX+uid,value),stop_children,('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    return {'paused':True,'uid':uid}

async def resume(r,uid):
    old=await load(r.sql,PREFIX+uid)
    if old and old.get('mode') in MODES and not old.get('finished'):
        rows=await r.sql.query('SELECT '+binding(old['mode'])+' AS binding FROM sync_tasks WHERE uid=?',(uid,))
        if not rows or json.loads(rows[0]['binding'])!=old['binding']:raise Error('原授权范围已变化，请重新核对并确认，不能直接恢复',409,'sync_grant_changed')
        return await enroll(r,uid,old['mode'])
    row=await checkpoint(r.sql,uid)
    if row and row.get('execution_phase') and row['execution_phase'] not in apply.TERMINAL:
        return await enroll(r,uid,'execute')
    if row and row['status']=='reading':return await enroll(r,uid,'read')

async def save(r,key,old,value):
    gid,guard=r.auth.guard(r.p,'data_tools','edit','EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(key,encoded(old).decode()))
    await r.sql.batch([guard,put(key,value),dispatch('manual',now()),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])

def finish(value,message):value.update(enabled=False,finished=True,message=message)

async def step(r,value):
    uid=value['task_uid'];mode=value['mode'];row=await checkpoint(r.sql,uid)
    if row['work_status']=='running':
        from .site_sync_work import reconcile
        work=await reconcile(r,uid)
        value.update(due=work.get('retry_after') or now(),message='中断进度已核对，等待下一轮推进')
        return
    reason,deadline=waiting(row,now())
    if deadline:value.update(due=deadline,message='等待冷却结束');return
    if reason=='needs_attention' and mode!='cancel':value.update(enabled=False,message='需要人工检查后继续');return
    if row.get('execution_phase') in apply.TERMINAL:
        await proposals.update_progress(r,{'uid':uid,'execution':{'phase':row['execution_phase'],'committed':bool(row.get('committed'))}})
        finish(value,'本次同步已结束');return
    if row.get('execution_phase'):
        if mode in ('read','prepare'):finish(value,'只读授权已结束，执行需单独确认授权');return
        result=await apply.tick(r,uid,cancel=mode=='cancel');await proposals.update_progress(r,result)
        value['message']='继续执行已确认范围：'+result['execution']['phase'];return
    if mode=='read':
        if row['status']=='reading':await tasks.advance(r,uid);value['message']='后台分批读取或准备';return
        header=await tasks.header(r.sql,uid);approval=header['state'].get('approval')
        if approval and not approval.get('ready'):await proposals.finish_review(r,uid);return
        # Detailed requested previews need the same selection finalization as the browser.
        legacy=await r.sql.query("SELECT json_type(state,'$.candidate_requested') AS requested,json_extract(state,'$.lightweight') AS lightweight FROM sync_tasks WHERE uid=?",(uid,))
        if legacy[0]['requested'] and not legacy[0]['lightweight']:
            task=await tasks.get(r.sql,uid);state=task['state']
            available={v['id'] for v in state.get('items',[])}
            await tasks.choose(r,uid,[v for v in state['candidate_requested'] if v in available])
        finish(value,'读取和准备已完成，等待人工选择或确认');return
    if mode=='prepare':
        from .site_sync_preview import prepare
        result=await prepare(r,uid,manual=True);value['child_uid']=result['uid'];finish(value,'准备子任务已登记后台读取');return
    if mode in ('pull','approve'):
        result=await apply.begin(r,uid,'从对端同步到本站',approval=mode=='approve')
        if 'execution' in result:await proposals.update_progress(r,result)
        value['message']='推进已确认的复核与执行';return
    if mode=='send':
        rows=await r.sql.query("SELECT json_extract(state,'$.outgoing.confirmed') AS confirmed FROM sync_tasks WHERE uid=?",(uid,))
        if rows[0]['confirmed']:value.update(mode='receipt',message='提案已送达，等待接收方批准',due=now(seconds=60));return
        await proposals.send(r,uid);value['message']='推进已确认的提案发送';return
    if mode=='receipt':
        result=await proposals.sent_status(r,uid);receipt=result['outgoing']
        value.update(receipt=receipt,due=now(seconds=60),message='已更新对端回执；待批准提案不会自动批准',retry_count=0)
        if receipt.get('phase') in apply.TERMINAL or receipt.get('status') in ('rejected','superseded','superseded_or_unknown'):finish(value,'提案流程已结束')
        return
    raise Error('任务尚未进入执行阶段，请重新确认',409)

async def tick(base,selected=None):
    selected=selected or await candidate(base.sql,now())
    if not selected:return None
    uid=selected['uid'];key=selected['key'];old=json.loads(selected['value'])
    deadline=await lease_until(base.sql,uid)
    if deadline and deadline>now():return {'skipped':'busy','task_uid':uid}
    from .site_sync_schedule import context
    value={**old,'updated_at':now()}
    value.pop('error_code',None);started=False
    try:
        r=await context(base,old,policy_key=key)
        async with lease(r,'site-sync:schedule-run','edit'):
            rows=await r.sql.query('SELECT '+binding(old['mode'])+' AS binding FROM sync_tasks WHERE uid=?',(uid,))
            if not rows or json.loads(rows[0]['binding'])!=old['binding']:raise Error('已确认的任务范围发生变化，请重新确认',409,'sync_grant_changed')
            started=True
            await step(r,value)
            await save(r,key,old,value)
        return {'status':'ok','manual':True,'task_uid':uid,'message':value['message']}
    except Exception as exc:
        if isinstance(exc,Error) and exc.code in ('sync_busy','sync_retry_wait'):return {'skipped':'busy','task_uid':uid}
        # Never overwrite a concurrently revoked/replaced grant. No business writes here.
        from .site_sync_work import retry_state,RETRY_CODES
        row=await checkpoint(base.sql,uid) if started else None
        # A receipt/context failure must not inherit an older task's error or due date.
        fresh=row and (row.get('work_attempt'),row.get('work_failed_at'))!=(selected.get('work_attempt'),selected.get('work_failed_at'))
        if fresh and row.get('work_status')=='running' and isinstance(exc,Error) and exc.code in RETRY_CODES:
            return {'skipped':'reconcile','task_uid':uid}
        if fresh and row.get('work_status')=='paused' and isinstance(exc,Error) and row.get('error_code')==exc.code:
            retryable=bool(row.get('retryable'))
            value.update(enabled=retryable,due=row.get('retry_after') or now(),
                         message='临时错误，冷却后继续原任务' if retryable else '本任务已停止自动恢复：'+exc.message[:450])
        elif isinstance(exc,Error):
            retry=retry_state(exc,old,base,checkpointed=True)
            value.update(retry_count=retry['retry_count'],enabled=retry['retryable'],due=retry['retry_after'] or now(),message=exc.message[:500])
        else:value.update(enabled=False,message='后台步骤异常，请检查日志后继续')
        value['error_code']=exc.code if isinstance(exc,Error) else 'sync_internal'
        await base.sql.batch([('UPDATE service_meta SET value=? WHERE key=? AND value=?',(encoded(value).decode(),key,selected['value']))])
        return {'status':'paused','manual':True,'task_uid':uid,'message':value['message']}
