"""Opt-in durable sync grant and bounded scheduler shared by local lifespan and Worker Cron.

No session is fabricated. The saved administrator/role stamps and policy revision
are checked again inside existing transactional write guards. Pending proposals
are never approved here. Changing credentials/roles/peer requires renewed consent.
"""
import copy,json,secrets,logging
from .auth import Auth
from .catalog import Error,now
from .data_tools import authorize,encoded
from .media_locks import lease
from . import site_sync as core,site_sync_tasks as tasks,site_sync_apply as apply

KEY='site-sync:schedule'
STATE='site-sync:schedule-state'
CONFIRM='允许定时拉取并同步增删'

async def load(sql,key=KEY):
    rows=await sql.query('SELECT value FROM service_meta WHERE key=?',(key,))
    return json.loads(rows[0]['value']) if rows else {}

def put(key,value):
    return ('INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,encoded(value).decode()))

async def status(sql):
    p=await load(sql)
    return {**{k:p.get(k) for k in ('enabled','auto_pull','interval','scopes','revision')},'state':await load(sql,STATE)}

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

class BackgroundAuth(Auth):
    """Narrow service grant: business sync only, no account/session/admin access."""
    def __init__(self,sql,passwords,policy):
        super().__init__(sql,passwords);self.policy=policy
    def require(self,p,module,action='view'):
        if module not in (*core.SCOPES,'data_tools') or action not in ('view','export','create','edit','delete'):raise Error('后台同步授权范围无效',403)
        super().require(p,module,action)
    def guard(self,p,module,action,condition='1',args=()):
        self.require(p,module,action)
        uid=secrets.token_hex(16);at=now()
        clause="EXISTS(SELECT 1 FROM auth_users u JOIN auth_roles r ON r.uid=u.role_uid JOIN auth_permissions a ON a.role_uid=r.uid WHERE u.uid=? AND u.role_uid=? AND u.updated_at=? AND u.status='active' AND u.must_change_password=0 AND r.updated_at=? AND r.is_active=1 AND r.is_system=1 AND a.module=? AND a.can_view=1 AND a.can_"+action+"=1) AND EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM sync_peers WHERE id=1 AND enabled=1 AND revision=?) AND ("+condition+')'
        params=(p['uid'],p['role_uid'],p['user_stamp'],p['role_stamp'],module,KEY,encoded(self.policy).decode(),self.policy['peer_revision'],*args,uid,module,uid,at,at)
        return uid,('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) SELECT CASE WHEN '+clause+" THEN ? ELSE '' END,?,?,?,?",params)

async def context(base,policy):
    owner=policy['owner']
    rows=await base.sql.query("SELECT u.uid,u.display_name,u.username,u.role_uid,u.must_change_password,u.updated_at user_stamp,r.updated_at role_stamp,r.is_system,r.visibility_scopes FROM auth_users u JOIN auth_roles r ON r.uid=u.role_uid WHERE u.uid=? AND u.status='active' AND r.is_active=1 AND r.is_system=1",(owner['uid'],))
    if not rows or any(rows[0][k]!=v for k,v in owner.items()):raise Error('后台授权已失效，请管理员重新保存策略',403)
    p=rows[0];p['scopes']=json.loads(p['visibility_scopes']);p['permissions']={x['module']:x for x in await base.sql.query('SELECT * FROM auth_permissions WHERE role_uid=?',(p['role_uid'],))}
    r=copy.copy(base);r.p=p;r.auth=BackgroundAuth(r.sql,r.passwords,policy)
    from .content import Content
    from .media import Media
    r.content=Content(r.sql,r.auth);r.media=Media(r.sql,r.auth,r.content,r.media_store,r.kind)
    authorize(r,'edit',core.SCOPES);authorize(r,'export',core.SCOPES)
    return r

async def step(r,policy,s):
    """One persisted page/chunk/commit per tick; do not start unapproved push jobs."""
    jobs=await apply.active(r.sql)
    if jobs:
        uid=jobs[0]['uid'];s['task_uid']=uid
        task=await tasks.get(r.sql,uid)
        if task['state']['execution'].get('error'):
            s['message']='执行已暂停，请打开任务重试或取消';return
        result=await apply.tick(r,uid)
        from .site_sync_proposals import update_progress
        await update_progress(r,result)
        s['message']='执行阶段：'+result['execution']['phase']
        if result['execution']['phase'] in apply.TERMINAL:
            s.pop('preview_uid',None);s['last_finished']=now();s['next_due']=now(seconds=policy['interval']*60)
        return
    if not policy['auto_pull']:s['message']='等待已确认任务；不自动拉取或批准推送';return
    if not s.get('preview_uid'):
        if s.get('next_due','')>now():return
        job=await tasks.start(r,'pull',policy['scopes']);s['preview_uid']=job['uid'];s['last_started']=now();s['message']='分批读取最新差异';return
    uid=s['preview_uid'];job=await tasks.get(r.sql,uid)
    if job['status']=='reading':
        await tasks.advance(r,uid);s['message']='分批读取最新差异';return
    if job['status']!='ready':raise Error('定时预览已失效，将在下一周期重新读取',409)
    items=job['state']['items'];ids=[x['id'] for x in items if x['in_scope']]
    if not ids:
        s.pop('preview_uid',None);s['next_due']=now(seconds=policy['interval']*60);s['last_finished']=now();s['message']='无差异';return
    # Never partial silent success: blocked dependencies/limits stop for review.
    await tasks.choose(r.sql,uid,ids)
    result=await apply.begin(r,uid,'从对端同步到本站')
    if result.get('checking'):
        s['message']='分批复核确认前版本，尚未开始执行';return
    s['task_uid']=uid;s['message']='按本站预先授权的定时拉取策略开始执行'

async def tick(base):
    policy=await load(base.sql)
    if not policy.get('enabled'):return {'skipped':'disabled'}
    s=await load(base.sql,STATE)
    if not await apply.active(base.sql):
        if not policy['auto_pull']:return {'skipped':'waiting'}
        if not s.get('preview_uid') and s.get('next_due','')>now():return {'skipped':'interval'}
    before=encoded(s).decode()
    try:
        r=await context(base,policy)
        peer=await tasks.peer(r.sql)
        if peer['revision']!=policy['peer_revision']:raise Error('连接已变化，请重新保存后台策略',409)
        # Distinct scheduler lease; apply.tick still shares its lock with browser actions.
        busy=await r.sql.query("SELECT 1 FROM admin_mutation_guards WHERE uid IN ('site-sync:schedule-run','site-sync:run') AND created_at>=?",(now(seconds=-300),))
        if busy:return {'skipped':'busy'}
        async with lease(r,'site-sync:schedule-run','edit'):
            # Re-read state inside the lease, so simultaneous schedulers cannot regress it.
            s=await load(r.sql,STATE);before=encoded(s).decode()
            if s.get('retry_after','')>now():return {'skipped':'interval'}
            await step(r,policy,s)
            s.pop('error',None);s.pop('retry_after',None);s['updated_at']=now()
            gid,guard=r.auth.guard(r.p,'data_tools','edit')
            await r.sql.batch([guard,put(STATE,s),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
        return {'status':'ok',**s}
    except Exception as exc:
        # Persist bounded diagnostics without logging peer bodies or secret URLs.
        # A disabled/replaced policy must not have its new state overwritten.
        if (await load(base.sql)).get('revision')!=policy['revision']:return {'skipped':'policy-changed'}
        if await base.sql.query("SELECT 1 FROM admin_mutation_guards WHERE uid IN ('site-sync:schedule-run','site-sync:run') AND created_at>=?",(now(seconds=-300),)):
            return {'skipped':'busy'}
        s['error']=exc.message if isinstance(exc,Error) else '后台步骤未完成；请检查连接或打开任务重试'
        s['updated_at']=now();s['retry_after']=now(seconds=policy['interval']*60)
        if not await apply.active(base.sql):s.pop('preview_uid',None)
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
            try:await tick(base)
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
