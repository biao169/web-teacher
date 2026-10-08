"""Signed, bounded metadata handshake; never scans business data or creates tasks."""
import asyncio
from site_sync.core.authority import AuthorizationError,ConflictError
from site_sync.core.selection import RESTORE_SCOPES,descriptions
from site_sync.core.receiver import selection
from site_sync.core.diagnostics import RELEASE,coded
from site_sync.core.journal import failure

from site_sync.core.preflight_errors import PreflightError

async def published(r):
    from .host import authorize_export
    try:
        allowed=await authorize_export(r);enabled=True
    except AuthorizationError as exc:
        if getattr(exc,'code',None)!='SYNC_EXPORT_DISABLED':raise
        allowed=set();enabled=False
    return {'ok':True,'protocol':'probe-v2','release':RELEASE,
            'export_enabled':enabled,'allowed_scopes':sorted(allowed),
            'authorization_code':None if enabled else 'SYNC_EXPORT_DISABLED'}

async def handshake(peer):
    value=await peer.candidates({'kind':'probe','version':'probe-v2'})
    if not isinstance(value,dict) or value.get('ok') is not True or value.get('protocol')!='probe-v2':
        raise coded(ConflictError('Peer capabilities protocol differs'),'SYNC_REQUEST_INVALID')
    scopes=value.get('allowed_scopes')
    if type(value.get('export_enabled'))!=bool or not isinstance(scopes,list) or len(scopes)>64 or any(not isinstance(x,str) or not 1<=len(x)<=64 for x in scopes) or len(set(scopes))!=len(scopes):
        raise coded(ConflictError('Invalid peer capability response'),'SYNC_REQUEST_INVALID')
    if not value['export_enabled'] and scopes:raise coded(ConflictError(),'SYNC_REQUEST_INVALID')
    return value

def compare(value,requested):
    needed=selection(requested);allowed=set(value['allowed_scopes'])
    missing=[s for s in needed if s not in allowed];labels=descriptions(missing)
    return {'ok':value['export_enabled'] and not missing,'export_enabled':value['export_enabled'],
            'requested_scopes':needed,'allowed_scopes':value['allowed_scopes'],
            'missing_scopes':missing,'missing_scope_details':[{'scope':s,'label':labels.get(s,{}).get('label',s)} for s in missing]}

async def preflight(r,peer_id,requested):
    from .host import runtime
    needed=selection(requested)
    async def run():
        peer=await runtime(r).peer_factory({'peer_id':peer_id})
        return await handshake(peer)
    try:value=await asyncio.wait_for(run(),10)
    except Exception as exc:
        if isinstance(exc,asyncio.TimeoutError):coded(exc,'REQUEST_TIMEOUT')
        raise PreflightError({'error':'未能完成对端签名握手，未创建新任务；请测试连通性并查看诊断。旧版对端需同时升级。',
            'code':'SYNC_PREFLIGHT_UNAVAILABLE','stage':'signed_handshake','retryable':True,'diagnostic':failure(exc)},503) from exc
    result=compare(value,needed)
    if not result['ok']:
        names='、'.join(x['label'] for x in result['missing_scope_details'])
        raise PreflightError({'error':('对端同步导出已停用；' if not result['export_enabled'] else '')+'对端缺少授权：'+names+'。请在对端以有权限的管理员保存连接或更新同步授权，然后重试。',
            'code':'SYNC_PEER_SCOPE_MISSING','stage':'peer_authorization','retryable':False,'connectivity_ok':True,
            'peer_release':value.get('release'),**result})
    return result
