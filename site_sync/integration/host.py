"""Shared teacher-site wiring; no independent account, database or HTTP port."""
import asyncio,hashlib,json,os,time,secrets
from .catalog import BASE_SCOPES
from site_sync.core.selection import RESTORE_SCOPES
from .database import adapter
from .website import TeacherWebsite
from site_sync.adapters.tasks import Tasks
from site_sync.adapters.worker_media import WorkerMedia
from site_sync.adapters.worker_peer import WorkerPeer
from site_sync.runtime.bridge import NativeBridge
from site_sync.runtime.service import Runtime
from site_sync.core.authority import AuthorizationError
from site_sync.core.diagnostics import coded


def environment(r,key,default=''):
    return str(getattr(r.sync_env,key,default)) if hasattr(r,'sync_env') else os.environ.get(key,default)
async def secret(r):
    from .credentials import require_secret
    return await require_secret(r)
def scopes(p):
    allowed=[t for t in BASE_SCOPES if all(p['permissions'].get(t,{}).get(k) for k in ('can_view','can_edit','can_create','can_export'))]
    if p.get('is_system') and all(p['permissions'].get('data_tools',{}).get(k) for k in ('can_view','can_edit','can_export')):allowed.extend(('site_clone',*RESTORE_SCOPES))
    return allowed
def grant_id(p):return 'website:'+p['uid']
async def authorize_export(r,module=None):
    db=adapter(r)
    rows=await db.query("SELECT c.export_scope_json,g.scopes_json FROM sync_connections c JOIN sync_peers p ON p.peer_id=c.peer_id JOIN sync_grants g ON g.principal_id=c.owner_uid WHERE p.enabled=1 AND g.enabled=1 AND g.can_write=1 AND (g.expires_at=0 OR g.expires_at>?) LIMIT 1",(int(time.time()),))
    if not rows:raise coded(AuthorizationError('Export disabled'),'SYNC_EXPORT_DISABLED')
    allowed=set(json.loads(rows[0]['export_scope_json']))&set(json.loads(rows[0]['scopes_json']))
    if module is not None and module not in allowed:raise coded(AuthorizationError('Module export denied'),'SYNC_SCOPE_DENIED')
    return allowed
async def configure(r,body):
    from backend.app.native.data_tools import authorize
    authorize(r,'edit');await secret(r)
    origin=str(body.get('origin','')).rstrip('/')
    from urllib.parse import urlsplit
    u=urlsplit(origin)
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.path or u.query or u.fragment:raise ValueError('Explicit HTTPS origin required')
    enabled=body.get('enabled',True)
    if type(enabled)!=bool:raise ValueError('enabled must be boolean')
    allowed=scopes(r.p)
    if not allowed:raise AuthorizationError('No editable/exportable modules')
    incoming=body.get('incoming_auto_scope',[])
    delete=body.get('incoming_auto_delete',False)
    if not isinstance(incoming,list) or any(not isinstance(x,str) for x in incoming) or not set(incoming)<=set(allowed) or type(delete)!=bool:raise ValueError('Invalid incoming approval policy')
    db=adapter(r);repo=Tasks(db)
    owner=await db.query("SELECT owner_uid FROM sync_connections WHERE peer_id='peer'")
    if owner and owner[0]['owner_uid']!=r.p['uid']:raise AuthorizationError('Connection belongs to another administrator')
    gid,guard=r.auth.guard(r.p,'data_tools','edit')
    revision=hashlib.sha256(json.dumps([origin,enabled],separators=(',',':')).encode()).hexdigest()
    await db.batch([guard,("INSERT INTO sync_peers VALUES('peer',?,'env:TEACHER_SYNC_KEY',?,?) ON CONFLICT(peer_id) DO UPDATE SET origin=excluded.origin,revision=excluded.revision,enabled=excluded.enabled",(origin,revision,int(enabled))),
       ("INSERT INTO sync_connections VALUES('peer',?,?,?,?) ON CONFLICT(peer_id) DO UPDATE SET export_scope_json=excluded.export_scope_json,incoming_auto_scope=excluded.incoming_auto_scope,incoming_auto_delete=excluded.incoming_auto_delete",(r.p['uid'],json.dumps(allowed),json.dumps(sorted(set(incoming))),int(delete))),
       ('INSERT INTO sync_grants VALUES(?,?,?,?,?,?,?,0) ON CONFLICT(grant_id) DO UPDATE SET revision=excluded.revision,enabled=excluded.enabled,scopes_json=excluded.scopes_json,can_write=excluded.can_write,can_delete=excluded.can_delete WHERE principal_id=excluded.principal_id',
        (grant_id(r.p),r.p['uid'],secrets.token_hex(16),int(enabled),json.dumps(allowed),1,int(all(r.p['permissions'][t]['can_delete'] for t in allowed if t in BASE_SCOPES)))),
       ('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    return {'saved':True}

def runtime(r):
    db=adapter(r);kind='local' if r.kind=='local' else 'worker'
    async def peer(t):
        rows=await db.query('SELECT origin,secret_ref FROM sync_peers WHERE peer_id=? AND enabled=1',(t['peer_id'],))
        if not rows:raise AuthorizationError('Peer disabled')
        if kind=='local':
            from site_sync.transport.http import HTTPPeer
            try:key=await secret(r)
            except AuthorizationError as exc:
                from site_sync.core.authority import CredentialRetryError
                raise CredentialRetryError('Sync credential unavailable') from exc
            return HTTPPeer(rows[0]['origin'],key)
        return WorkerPeer(NativeBridge(r.sync_env.SYNC_NATIVE,db,rows[0]))
    if kind=='local':
        from site_sync.adapters.local_media import LocalMedia
        factory=lambda repo:LocalMedia(repo,r.settings.media_dir/'sync')
    else:factory=lambda repo:WorkerMedia(repo,NativeBridge(r.sync_env.SYNC_NATIVE,db))
    rt=Runtime(db,TeacherWebsite(db,r),peer,factory,platform=kind,history_days=int(environment(r,'SYNC_HISTORY_DAYS','90')))
    rt.repo.admission="NOT EXISTS(SELECT 1 FROM service_meta WHERE key='site_sync.paused.v1' AND value!='0')"
    return rt

async def tick(r):
    from .control import stopped
    if await stopped(r):return {'action':'disabled','skipped':'sync-paused'}
    engine=runtime(r)
    result=await engine.tick()
    if result['action']=='idle':
        await engine.repo.db.batch([('DELETE FROM sync_exports WHERE rowid IN (SELECT rowid FROM sync_exports WHERE expires_at<? ORDER BY expires_at LIMIT 1)',(int(time.time()),))])
    return result

def install_local(app,r):
    # I/O runs off the web event loop; one bounded phase per tick, global DB lease.
    # No stdout heartbeat. Reuse the existing rotating application log handler.
    async def loop():
        import logging
        while True:
            try:await tick(r)
            except asyncio.CancelledError:raise
            except Exception as e:logging.getLogger('teacher-site').warning('sync tick: %s',type(e).__name__)
            await asyncio.sleep(5)
    @app.on_event('startup')
    async def start():app.state.sync_task=asyncio.create_task(loop())
    @app.on_event('shutdown')
    async def stop():
        task=getattr(app.state,'sync_task',None)
        if task:
            task.cancel()
            try:await task
            except asyncio.CancelledError:pass

async def refresh_scopes(r):
    """Explicit owner action; expand saved scope without changing task revisions.
    GETs never write grants. Revocations/policy changes use normal connection save.
    """
    from backend.app.native.data_tools import authorize
    authorize(r,'edit')
    db=adapter(r);gid=grant_id(r.p);now=int(time.time())
    rows=await db.query("SELECT g.*,p.revision peer_revision,c.owner_uid,c.export_scope_json FROM sync_connections c JOIN sync_peers p ON p.peer_id=c.peer_id JOIN sync_grants g ON g.grant_id=? AND g.principal_id=c.owner_uid WHERE c.peer_id='peer' AND c.owner_uid=? AND p.enabled=1 AND g.enabled=1 AND g.can_write=1 AND (g.expires_at=0 OR g.expires_at>?)",(gid,r.p['uid'],now))
    if not rows:raise AuthorizationError('连接未启用、已过期或不属于当前管理员，请检查连接设置')
    old=rows[0];allowed=set(scopes(r.p))
    deletion=int(all(r.p['permissions'][t].get('can_delete') for t in allowed if t in BASE_SCOPES))
    if not (set(json.loads(old['scopes_json']))|set(json.loads(old['export_scope_json'])))<=allowed or (old['can_delete'] and not deletion):
        raise AuthorizationError('当前权限已收缩，请使用保存连接更新策略；不会自动扩大或忽略权限变更')
    condition="EXISTS(SELECT 1 FROM sync_grants g JOIN sync_connections c ON c.owner_uid=g.principal_id JOIN sync_peers p ON p.peer_id=c.peer_id WHERE g.grant_id=? AND g.revision=? AND p.revision=? AND c.peer_id='peer' AND c.owner_uid=? AND p.enabled=1 AND g.enabled=1 AND g.can_write=1 AND (g.expires_at=0 OR g.expires_at>?))"
    guard_id,guard=r.auth.guard(r.p,'data_tools','edit',condition,(gid,old['revision'],old['peer_revision'],r.p['uid'],now))
    encoded=json.dumps(sorted(allowed))
    await db.batch([guard,('UPDATE sync_grants SET scopes_json=?,can_delete=? WHERE grant_id=?',(encoded,deletion,gid)),("UPDATE sync_connections SET export_scope_json=? WHERE peer_id='peer' AND owner_uid=?",(encoded,r.p['uid'])),('DELETE FROM admin_mutation_guards WHERE uid=?',(guard_id,))])
    return {'saved':True,'scope_count':len([s for s in RESTORE_SCOPES if s in allowed]),'task_revisions_preserved':True}
