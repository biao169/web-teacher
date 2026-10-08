"""Authenticated metadata proposal; receiver owns approval policy."""
from site_sync.core.selection import is_restore,normalize,selected_tables
import hashlib,json,time
from .host import adapter,secret,grant_id,authorize_export
from site_sync.adapters.tasks import Tasks
from site_sync.core.authority import AuthorizationError,ConflictError
from site_sync.core.diagnostics import coded

async def receive(r,q):
    if set(q)!={'kind','version','request_id','scope'}:raise ValueError('Proposal cannot set receiver policy')
    if q.get('version')!='proposal-v1' or not isinstance(q.get('request_id'),str) or not 8<=len(q['request_id'])<=128:raise ValueError('Invalid proposal')
    allowed=await authorize_export(r);scope=normalize(q.get('scope'))
    if not isinstance(scope,list) or not scope or not set(scope)<=allowed:raise AuthorizationError('Proposal scope denied')
    db=adapter(r)
    connections=await db.query("SELECT c.owner_uid,c.incoming_auto_scope,c.incoming_auto_delete,g.revision FROM sync_connections c JOIN sync_grants g ON g.grant_id='website:'||c.owner_uid WHERE c.peer_id='peer'")
    if not connections:raise coded(AuthorizationError('Connection unavailable'),'SYNC_EXPORT_DISABLED')
    connection=connections[0]
    owner=connection['owner_uid']
    auto=set(scope)<=set(json.loads(connection['incoming_auto_scope']))
    if is_restore(scope) and not connection['incoming_auto_delete']:auto=False
    gid='website:'+owner;op='proposal:'+hashlib.sha256(q['request_id'].encode()).hexdigest()
    repo=Tasks(db,platform='local' if r.kind=='local' else 'worker')
    previous=await db.query('SELECT * FROM sync_tasks WHERE operation_id=?',(op,))
    if previous:
        row=previous[0]
        if row['scope_json']!=json.dumps(sorted(set(scope)),separators=(',',':')) or row['grant_id']!=gid:raise ConflictError('Proposal ID reused')
        return {'task_id':row['task_id'],'approval_required':not bool(row['auto_confirm'])}
    existing=await db.query("SELECT task_id,operation_id FROM sync_tasks WHERE peer_id='peer' AND mode='proposal' AND status NOT IN ('done','cancelled') LIMIT 1")
    if existing and existing[0]['operation_id']!=op:raise coded(ConflictError('An incoming proposal is already pending'),'SYNC_PROPOSAL_PENDING')
    row=await repo.create(peer_id='peer',grant_id=gid,scope=scope,operation_id=op,now=int(time.time()),mode='proposal',auto_confirm=auto,auto_delete=bool(connection['incoming_auto_delete']),expected_grant_revision=connection['revision'])
    return {'task_id':row['task_id'],'approval_required':not bool(row['auto_confirm'])}

async def send(r,data):
    from backend.app.native.data_tools import authorize
    from .host import runtime,scopes
    from . import outgoing
    from site_sync.core.journal import failure
    from site_sync.core.diagnostics import coded
    from backend.app.ports.operations import operation,current,emit
    import asyncio,re
    authorize(r,'edit')
    if set(data)!={'scope','request_id'} or not isinstance(data['request_id'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}',data['request_id']):raise ValueError('Invalid proposal')
    data=dict(data,scope=normalize(data['scope']))
    allowed=await authorize_export(r)
    if not data['scope'] or not set(data['scope'])<=allowed or not set(data['scope'])<=set(scopes(r.p)):raise AuthorizationError('Proposal scope denied')
    rows=await adapter(r).query("SELECT p.origin,c.owner_uid FROM sync_peers p JOIN sync_connections c ON c.peer_id=p.peer_id WHERE p.peer_id='peer' AND p.enabled=1")
    if not rows or rows[0]['owner_uid']!=r.p['uid']:raise coded(AuthorizationError('Connection unavailable'),'SYNC_LOCAL_CONNECTION')
    key,saved=await outgoing.begin(r,data,rows[0]['origin'])
    if saved['status']=='confirmed':return saved['result']
    try:
        peer=await runtime(r).peer_factory({'peer_id':'peer'})
        result=await asyncio.wait_for(peer.candidates(dict(kind='proposal',version='proposal-v1',**data)),25)
        if not isinstance(result,dict) or type(result.get('approval_required'))!=bool or not isinstance(result.get('task_id'),str) or not re.fullmatch('[a-f0-9]{32}',result['task_id']):raise ConflictError('Peer approval contract mismatch')
        result={k:result[k] for k in ('task_id','approval_required')}
    except Exception as exc:
        if isinstance(exc,asyncio.TimeoutError):coded(exc,'REQUEST_TIMEOUT')
        diagnostic=failure(exc)
        try:await outgoing.save(r,key,saved,status='unknown',diagnostic=diagnostic,trace_id=current().get('request_id'))
        except Exception as storage:emit('SYNC-PROPOSAL-RECEIPT-ERROR',stage='proposal-receipt',diagnostic=failure(storage))
        raise
    try:await outgoing.save(r,key,saved,status='confirmed',result=result,diagnostic=None,trace_id=current().get('request_id'))
    except Exception as exc:
        emit('SYNC-PROPOSAL-RECEIPT-ERROR',stage='proposal-receipt',diagnostic=failure(exc))
        raise coded(ConflictError('Peer accepted; delivery receipt persistence failed, retry same request ID'),'SYNC_PROPOSAL_FAILED') from exc
    return result
