"""Authenticated metadata proposal; receiver owns approval policy."""
from site_sync.core.selection import is_restore,normalize,selected_tables
import hashlib,json,time
from .host import adapter,secret,grant_id,authorize_export
from site_sync.adapters.tasks import Tasks
from site_sync.core.authority import AuthorizationError,ConflictError

async def receive(r,q):
    if set(q)!={'kind','version','request_id','scope'}:raise ValueError('Proposal cannot set receiver policy')
    if q.get('version')!='proposal-v1' or not isinstance(q.get('request_id'),str) or not 8<=len(q['request_id'])<=128:raise ValueError('Invalid proposal')
    allowed=await authorize_export(r);scope=normalize(q.get('scope'))
    if not isinstance(scope,list) or not scope or not set(scope)<=allowed:raise AuthorizationError('Proposal scope denied')
    db=adapter(r)
    connection=(await db.query("SELECT c.owner_uid,c.incoming_auto_scope,c.incoming_auto_delete,g.revision FROM sync_connections c JOIN sync_grants g ON g.grant_id='website:'||c.owner_uid WHERE c.peer_id='peer'"))[0]
    owner=connection['owner_uid']
    auto=set(scope)<=set(json.loads(connection['incoming_auto_scope']))
    if is_restore(scope) and not connection['incoming_auto_delete']:auto=False
    gid='website:'+owner;op='proposal:'+hashlib.sha256(q['request_id'].encode()).hexdigest()
    existing=await db.query("SELECT task_id,operation_id FROM sync_tasks WHERE peer_id='peer' AND mode='proposal' AND status NOT IN ('done','cancelled') LIMIT 1")
    if existing and existing[0]['operation_id']!=op:raise ConflictError('An incoming proposal is already pending')
    repo=Tasks(db,platform='local' if r.kind=='local' else 'worker')
    previous=await db.query('SELECT * FROM sync_tasks WHERE operation_id=?',(op,))
    if previous:
        row=previous[0]
        if row['scope_json']!=json.dumps(sorted(set(scope)),separators=(',',':')) or row['grant_id']!=gid:raise ConflictError('Proposal ID reused')
        return {'task_id':row['task_id'],'approval_required':not bool(row['auto_confirm'])}
    row=await repo.create(peer_id='peer',grant_id=gid,scope=scope,operation_id=op,now=int(time.time()),mode='proposal',auto_confirm=auto,auto_delete=bool(connection['incoming_auto_delete']),expected_grant_revision=connection['revision'])
    return {'task_id':row['task_id'],'approval_required':not bool(row['auto_confirm'])}

async def send(r,data):
    from backend.app.native.data_tools import authorize
    authorize(r,'edit')
    if set(data)!={'scope','request_id'} or not isinstance(data['request_id'],str) or not 8<=len(data['request_id'])<=128:raise ValueError('Invalid proposal')
    data=dict(data,scope=normalize(data['scope']))
    allowed=await authorize_export(r)
    if not isinstance(data['scope'],list) or not data['scope'] or not set(data['scope'])<=allowed:raise AuthorizationError('Proposal scope denied')
    db=adapter(r);p=(await db.query("SELECT origin,secret_ref FROM sync_peers WHERE peer_id='peer' AND enabled=1"))[0]
    q=dict(kind='proposal',version='proposal-v1',**data)
    if r.kind=='local':
        import asyncio
        from site_sync.transport.http import HTTPPeer
        raw=await asyncio.to_thread(HTTPPeer(p['origin'],await secret(r)).open,q)
    else:
        from site_sync.runtime.bridge import NativeBridge
        raw=await NativeBridge(r.sync_env.SYNC_NATIVE,db,p).read(q)
    result=json.loads(raw)
    if type(result.get('approval_required'))!=bool or not isinstance(result.get('task_id'),str):raise ConflictError('Peer approval contract mismatch')
    return result
