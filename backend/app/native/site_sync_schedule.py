"""Opt-in durable sync grant and bounded scheduler shared by local lifespan and Worker Cron.

No session is fabricated. The saved administrator/role stamps and policy revision
are checked again inside existing transactional write guards. Pending proposals
are never approved here. Changing credentials/roles/peer requires renewed consent.
"""
import json,secrets,logging
from .catalog import Error,now
from .data_tools import authorize,encoded
from .media_locks import lease
from . import site_sync as core,site_sync_tasks as tasks,site_sync_apply as apply

from .site_sync_limits import AUTO_PULL_CANDIDATES
from .site_sync_initialization import advance as init_stage,failed as init_failed,Superseded,Unavailable

from .site_sync_gate import KEY, STATE, load,checkpoint,waiting,lease_until,TURN,dispatch,probe
CONFIRM='允许定时拉取并同步增删'

def put(key,value):
    return ('INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,encoded(value).decode()))

from .site_sync_schedule_status import status


def finish(s,uid,interval,message):
    s.pop('preview_uid',None);s.pop('auto_selection',None)
    s.update(task_uid=uid,last_task_uid=uid,last_finished=now(),next_due=now(seconds=interval*60),message=message)


async def finish_task(r,s,row,interval):
    from .site_sync_proposals import update_progress
    await update_progress(r,{'uid':row['uid'],'execution':{'phase':row['execution_phase'],'committed':bool(row.get('committed'))}})
    finish(s,row['uid'],interval,'执行阶段：'+row['execution_phase'])


def blocked(s,row):
    reason,deadline=waiting(row,now())
    if reason not in ('receipt_wait','retry_wait','needs_attention','missing'):return False
    s['wait_reason']=reason;s['next_attempt_at']=deadline
    s['message']={'receipt_wait':'等待上一步回执恢复窗口；到期后后台核对进度',
                  'retry_wait':'进度已保存；等待冷却结束后后台重试',
                  'needs_attention':'自动恢复已暂停；请检查错误后手动继续或取消',
                  'missing':'任务记录不存在或正在清理，请检查后重新保存后台策略'}[reason]
    return True


def creation_link(r,s,before):
    def link(uid):
        s.pop('auto_selection',None)
        s.update(preview_uid=uid,task_uid=uid,last_started=now(),updated_at=now(),message='分批读取最新差异')
        gid,guard=r.auth.guard(r.p,'data_tools','edit','EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(STATE,before))
        return [guard,put(STATE,s),dispatch('scheduled',now()),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))]
    return link

async def save(r,data):
    authorize(r,'edit',core.SCOPES);authorize(r,'export',core.SCOPES)
    old=await load(r.sql)
    if data.get('revision')!=old.get('revision'):raise Error('后台策略已变化，请刷新后重试',409)
    enabled=bool(data.get('enabled'));auto=bool(data.get('auto_pull')) and enabled
    interval=data.get('interval',60);scopes=data.get('scopes',[])
    if type(interval) is not int or not 5<=interval<=10080:raise Error('间隔需为5至10080分钟')
    if not isinstance(scopes,list) or any(t not in core.SCOPES for t in scopes) or (auto and not scopes):raise Error('请选择有效的定时拉取模块')
    if auto and data.get('confirmation')!=CONFIRM:raise Error('请输入“'+CONFIRM+'”确认所选模块及依赖的新增、更新和删除')
    peer=await tasks.peer(r.sql,enabled=enabled)
    p={ 'enabled':enabled,'auto_pull':auto,'interval':interval,'scopes':list(dict.fromkeys(scopes)),
        'revision':secrets.token_hex(16),'peer_revision':peer['revision'],
        'owner':{k:r.p[k] for k in ('uid','role_uid','user_stamp','role_stamp')}}
    cond='NOT EXISTS(SELECT 1 FROM service_meta WHERE key=?)' if not old else 'EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)'
    args=(KEY,) if not old else (KEY,encoded(old).decode())
    gid,guard=r.auth.guard(r.p,'data_tools','edit',cond,args)
    # Leave running execution intact. A new preview will use the newly approved scope.
    await r.sql.batch([guard,put(KEY,p),put(STATE,{'next_due':now(),'message':'策略已保存；后台将在下一轮检查','updated_at':now()}),
        r.content.audit(r.p,'data_tools','sync_schedule_save','',{'enabled':enabled,'auto_pull':auto,'interval':interval,'scopes':p['scopes']}),
        ('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    return await status(r.sql)

from .site_sync_background import BackgroundAuth,context

async def reconcile_pending(r,s,row):
    if not row or row.get('work_status')!='running':return False
    if blocked(s,row):return True
    from .site_sync_work import reconcile
    work=await reconcile(r,row['uid'])
    s.update(wait_reason='retry_wait' if work.get('retryable') else 'complete' if work['status']=='saved' else 'needs_attention',
             next_attempt_at=work.get('retry_after'),message='已核对中断检查点；本轮不重复执行业务，下一轮按保存状态推进')
    return True


async def step(r,policy,s):
    """One persisted page/chunk/commit per tick; do not start unapproved push jobs."""
    jobs=await apply.active(r.sql)
    if jobs:
        uid=jobs[0]['uid']
        from .site_sync_manual_gate import PREFIX
        if await load(r.sql,PREFIX+uid):
            s['message']='该手动任务由独立授权管理；定时策略不接管或解除暂停';return
        if s.get('task_uid')!=uid:
            before=encoded(await load(r.sql,STATE)).decode()
            s.update(task_uid=uid,message='已接管已确认任务，下一轮继续推进',updated_at=now())
            gid,guard=r.auth.guard(r.p,'data_tools','edit','EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(STATE,before))
            await r.sql.batch([guard,put(STATE,s),dispatch('scheduled',now()),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
            return True
        row=await checkpoint(r.sql,uid)
        if await reconcile_pending(r,s,row):return
        if blocked(s,row):return
        result=await apply.tick(r,uid)
        from .site_sync_proposals import update_progress
        await update_progress(r,result)
        s['message']='执行阶段：'+result['execution']['phase']
        if result['execution']['phase'] in apply.TERMINAL:
            finish(s,uid,policy['interval'],s['message'])
        return
    pending=s.get('task_uid')
    if pending and pending!=s.get('last_task_uid'):
        row=await checkpoint(r.sql,pending)
        if await reconcile_pending(r,s,row):return
        if row and row.get('execution_phase') in apply.TERMINAL:
            await finish_task(r,s,row,policy['interval']);return
    if not policy['auto_pull']:s['message']='等待已确认任务；不自动拉取或批准推送';return
    if not s.get('preview_uid'):
        if s.get('next_due','')>now():return
        await tasks.start(r,'pull',policy['scopes'],lightweight=True,latest_only=True,on_create=creation_link(r,s,encoded(await load(r.sql,STATE)).decode()))
        return True  # Task and scheduler pointer were committed in the same batch.
    uid=s['preview_uid'];s['task_uid']=uid
    row=await checkpoint(r.sql,uid)
    if await reconcile_pending(r,s,row):return
    if row and row.get('execution_phase') in apply.TERMINAL:
        await finish_task(r,s,row,policy['interval']);return
    if blocked(s,row):return
    if row and (row.get('restart_uid') or row.get('prepared_uid')):
        child=row.get('restart_uid') or row['prepared_uid']
        s.update(preview_uid=child,task_uid=child,message='已衔接保存的子任务');s.pop('auto_selection',None);return
    if blocked(s,row):return
    job=await tasks.get(r.sql,uid)
    if job['status']=='reading':
        await tasks.advance(r,uid);s['message']='分批读取最新差异';return
    if job['status']!='ready':raise Error('定时预览已失效，将在下一周期重新读取',409)
    state=job['state']
    if state.get('lightweight'):
        if not state.get('incremental'):
            from . import site_sync_preview as preview
            selection=s.setdefault('auto_selection',{'ids':[],'after':['',''],'ready':False})
            if not selection['ready']:
                part=await preview.listing(r.sql,job,{'after':selection['after']})
                ids=selection['ids']+[v['id'] for v in part['items']]
                if len(ids)>AUTO_PULL_CANDIDATES:raise Error('定时候选超过500项，请缩小模块范围或手动分批；尚未执行业务写入',409)
                selection.update(ids=ids,after=part['next'],ready=part['next'] is None)
                s['message']='分批收集候选：'+str(len(ids))+' 项';return
            if not selection['ids']:
                finish(s,uid,policy['interval'],'无可同步候选');return
            if not state.get('prepared_uid') and state['selection']['selected']!=sorted(selection['ids']):
                await tasks.choose(r,uid,selection['ids']);s['message']='已保存定时选择';return
            child=await preview.prepare(r,uid)
            s['preview_uid']=child['uid'];s['task_uid']=child['uid'];s.pop('auto_selection',None);s['message']='逐条准备所选内容和依赖';return
        result=await apply.begin(r,uid,'从对端同步到本站')
        s['task_uid']=uid;s['message']='按预先授权策略逐条执行';return
    # Existing detailed tasks retain their checkpoints; newly created jobs use the path above.
    items=state['items'];ids=[x['id'] for x in items if x['in_scope']]
    if not ids:
        finish(s,uid,policy['interval'],'无差异');return
    # Never partial silent success: blocked dependencies/limits stop for review.
    await tasks.choose(r,uid,ids)
    result=await apply.begin(r,uid,'从对端同步到本站')
    if result.get('checking'):
        s['message']='分批复核确认前版本，尚未开始执行';return
    s['task_uid']=uid;s['message']='按本站预先授权的定时拉取策略开始执行'

async def tick(base, *, prune_history=True,dispatch_uid=None):
    await init_stage('dispatch')
    from .site_sync_manual import tick as manual_tick
    from .site_sync_manual_gate import candidate
    selected=await candidate(base.sql,now(),dispatch_uid=dispatch_uid)
    if selected:
        # Alternate ready classes, without spending a turn on a cooling/locked job.
        previous=await load(base.sql,TURN)
        scheduled_ready=previous.get('kind')=='manual' and not await probe(base.sql,include_manual=False)
        if not scheduled_ready:
            manual_result=await manual_tick(base,selected)
            if manual_result is not None:return manual_result
    if prune_history:
        from .site_sync_history import prune
        await prune(base.sql)
    policy=await load(base.sql)
    if not policy.get('enabled'):return {'skipped':'disabled'}
    s=await load(base.sql,STATE)
    if not await apply.active(base.sql):
        if not policy['auto_pull'] and (not s.get('task_uid') or s.get('task_uid')==s.get('last_task_uid')):return {'skipped':'waiting'}
        if not s.get('preview_uid') and s.get('task_uid')==s.get('last_task_uid') and s.get('next_due','')>now():return {'skipped':'interval'}
    before=encoded(s).decode()
    try:
        r=await context(base,policy)
        peer=await tasks.peer(r.sql)
        if peer['revision']!=policy['peer_revision']:raise Error('连接已变化，请重新保存后台策略',409)
        # Distinct scheduler lease; apply.tick still shares its lock with browser actions.
        busy=await r.sql.query("SELECT 1 FROM admin_mutation_guards WHERE uid IN ('site-sync:schedule-run','site-sync:run') AND created_at>=?",(now(seconds=-300),))
        if busy:return {'skipped':'busy'}
        await init_stage('execution_lease')
        async with lease(r,'site-sync:schedule-run','edit'):
            # Re-read state inside the lease, so simultaneous schedulers cannot regress it.
            s=await load(r.sql,STATE);before=encoded(s).decode()
            jobs=await apply.active(r.sql)
            linked=jobs[0]['uid'] if jobs else s.get('preview_uid') if policy['auto_pull'] and s.get('preview_uid') else s.get('task_uid') if s.get('task_uid')!=s.get('last_task_uid') else None
            if not linked and s.get('retry_after','')>now():return {'skipped':'interval'}
            for key in ('error','error_code','retry_after','retry_count','retryable','wait_reason','next_attempt_at'):s.pop(key,None)
            await init_stage('business_step')
            committed=await step(r,policy,s)
            if committed:return {'status':'ok',**s}
            await init_stage('receipt_save')
            s['updated_at']=now()
            gid,guard=r.auth.guard(r.p,'data_tools','edit','EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(STATE,before))
            await r.sql.batch([guard,put(STATE,s),dispatch('scheduled',now()),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
        return {'status':'ok',**s}
    except (Superseded,Unavailable):raise
    except Exception as exc:
        init_failed(exc)
        if isinstance(exc,Error) and exc.code in ('sync_busy','sync_retry_wait'):return {'skipped':'interval' if exc.code=='sync_retry_wait' else 'busy'}
        # Persist bounded diagnostics without logging peer bodies or secret URLs.
        # A disabled/replaced policy must not have its new state overwritten.
        if (await load(base.sql)).get('revision')!=policy['revision']:return {'skipped':'policy-changed'}
        if await base.sql.query("SELECT 1 FROM admin_mutation_guards WHERE uid IN ('site-sync:schedule-run','site-sync:run') AND created_at>=?",(now(seconds=-300),)):
            return {'skipped':'busy'}
        s['error_code']=exc.code if isinstance(exc,Error) else 'sync_runtime'
        s['error']=exc.message if isinstance(exc,Error) else '后台步骤未完成；请检查连接或打开任务重试'
        from .site_sync_work import retry_state
        retry=retry_state(exc,s,base) if isinstance(exc,Error) else {'retry_count':1,'retryable':False,'retry_after':None}
        # A task owns its recovery budget; do not add an independent three-error ceiling.
        uid=s.get('task_uid') or s.get('preview_uid')
        if uid and isinstance(exc,Error):
            try:
                work=(await tasks.header(base.sql,uid))['state']['work']
                if work.get('status')=='paused' and work.get('error_code')==exc.code:
                    retry={key:work.get(key) for key in ('retry_count','retryable','retry_after')}
            except Exception:pass
        s.update(retry);s['updated_at']=now();s['retry_after']=retry['retry_after'] or now(seconds=policy['interval']*60)
        # Keep the same preview checkpoint after failure; never silently start over.
        s['next_due']=s['retry_after']
        await base.sql.batch([('UPDATE service_meta SET value=? WHERE key=? AND value=? AND EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(encoded(s).decode(),STATE,before,KEY,encoded(policy).decode()))])
        logging.getLogger(__name__).warning('Site sync background paused (%s)',type(exc).__name__)
        return {'status':'paused','error':s['error']}


def install_local(app,base,interval=15):
    """One bounded step per interval; persistent DB leases coordinate other processes."""
    import asyncio
    from contextlib import asynccontextmanager,suppress
    original=app.router.lifespan_context
    async def loop():
        while True:
            try:
                from .site_sync_dispatch import run as dispatch
                await dispatch(base.sql,lambda uid:tick(base,dispatch_uid=uid),kind=base.kind)
            except Exception:logging.getLogger(__name__).warning('Site sync scheduler unavailable')
            await asyncio.sleep(interval)
    @asynccontextmanager
    async def lifespan(application):
        async with original(application):
            task=asyncio.create_task(loop())
            try:yield
            finally:
                task.cancel()
                with suppress(asyncio.CancelledError):await task
    app.router.lifespan_context=lifespan
