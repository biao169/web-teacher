"""Shared teacher-site wiring; no independent account, database or HTTP port."""
import asyncio,hashlib,json,os,time,secrets
from .catalog import SCOPES
from .database import adapter
from .website import TeacherWebsite
from site_sync.adapters.tasks import Tasks
from site_sync.adapters.worker_media import WorkerMedia
from site_sync.adapters.worker_peer import WorkerPeer
from site_sync.runtime.bridge import NativeBridge
from site_sync.runtime.service import Runtime
from site_sync.core.authority import AuthorizationError


def environment(r,key,default=''):
    return str(getattr(r.sync_env,key,default)) if hasattr(r,'sync_env') else os.environ.get(key,default)
async def secret(r):
    from .credentials import require_secret
    return await require_secret(r)
def scopes(p):
    allowed=[t for t in SCOPES if t!='site_clone' and all(p['permissions'].get(t,{}).get(k) for k in ('can_view','can_edit','can_create','can_export'))]
    if p.get('is_system') and all(p['permissions'].get('data_tools',{}).get(k) for k in ('can_view','can_edit','can_export')):allowed.append('site_clone')
    return allowed
def grant_id(p):return 'website:'+p['uid']
async def authorize_export(r,module=None):
    db=adapter(r)
    rows=await db.query("SELECT c.export_scope_json,g.scopes_json FROM sync_connections c JOIN sync_peers p ON p.peer_id=c.peer_id JOIN sync_grants g ON g.principal_id=c.owner_uid WHERE p.enabled=1 AND g.enabled=1 AND g.can_write=1 AND (g.expires_at=0 OR g.expires_at>?) LIMIT 1",(int(time.time()),))
    if not rows:raise AuthorizationError('Export disabled')
    allowed=set(json.loads(rows[0]['export_scope_json']))&set(json.loads(rows[0]['scopes_json']))
    if module is not None and module not in allowed:raise AuthorizationError('Module export denied')
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
        (grant_id(r.p),r.p['uid'],secrets.token_hex(16),int(enabled),json.dumps(allowed),1,int(all(r.p['permissions'][t]['can_delete'] for t in allowed if t!='site_clone')))),
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
    return Runtime(db,TeacherWebsite(db,r),peer,factory,platform=kind,history_days=int(environment(r,'SYNC_HISTORY_DAYS','90')))

async def tick(r):
    if environment(r,'TEACHER_SYNC_PAUSED','0')=='1':return {'action':'disabled','skipped':'sync-paused'}
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
