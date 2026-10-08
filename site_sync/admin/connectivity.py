"""Bounded, read-only diagnostic using the production peer transport."""
import asyncio,time,json,re
from site_sync.integration.host import adapter,runtime,scopes,grant_id
from site_sync.core.journal import failure
from site_sync.core.selection import visible_scopes,normalize
from site_sync.core.diagnostics import coded,RELEASE
from site_sync.core.authority import AuthorizationError,ConflictError

from backend.app.ports.operations import operation,current

@operation('sync-connectivity')
async def probe(r):
    started=time.monotonic();steps=[];stage='local_connection';details={}
    async def run():
        nonlocal stage,details
        db=adapter(r)
        rows=await db.query("SELECT p.peer_id,g.scopes_json FROM sync_peers p JOIN sync_connections c ON c.peer_id=p.peer_id JOIN sync_grants g ON g.grant_id=? AND g.principal_id=c.owner_uid WHERE p.peer_id='peer' AND p.enabled=1 AND g.enabled=1 AND (g.expires_at=0 OR g.expires_at>?)",(grant_id(r.p),int(time.time())))
        if not rows:raise coded(AuthorizationError('Connection unavailable'),'SYNC_LOCAL_CONNECTION')
        allowed=sorted(set(scopes(r.p)) & set(json.loads(rows[0]['scopes_json'])))
        choices=visible_scopes(allowed)
        choices=sorted(choices,key=lambda x:(x!='restore_media_assets',x))
        selected=next((normalize([x]) for x in choices if set(normalize([x]))<=set(allowed)),None)
        if selected is None and 'site_clone' in allowed:selected=['site_clone']
        allowed=selected or []
        if not allowed:raise AuthorizationError('No permitted scope')
        steps.append({'stage':stage,'ok':True})
        if getattr(r,'kind',None)=='r2':
            stage='native_status'
            from site_sync.runtime.bridge import NativeBridge
            from site_sync.integration.host import secret
            import hashlib
            native=await NativeBridge(r.sync_env.SYNC_NATIVE,db).call('status',{})
            if isinstance(native,dict) and isinstance(native.get('release'),str) and re.fullmatch(r'0\.\d{1,3}\.\d{1,4}',native['release']):details={'native_release':native['release'][:32]}
            if not isinstance(native,dict) or native.get('release')!=RELEASE:raise coded(ConflictError(),'SYNC_NATIVE_VERSION')
            if native.get('credential_fingerprint')!=hashlib.sha256(await secret(r)).hexdigest()[:16]:raise coded(AuthorizationError(),'SYNC_NATIVE_KEY_MISMATCH')
            steps.append({'stage':stage,'ok':True,'native_release':native['release'],'credential_matches':True});details={}
        stage='peer_factory'
        peer=await runtime(r).peer_factory({'peer_id':'peer'})
        steps.append({'stage':stage,'ok':True})
        stage='signed_handshake'
        handshake=await peer.candidates({'kind':'probe','version':'probe-v1','scope':allowed})
        if not isinstance(handshake,dict) or handshake.get('ok') is not True or handshake.get('protocol')!='probe-v1':raise coded(ConflictError('Peer diagnostic version differs'),'SYNC_REQUEST_INVALID')
        steps.append({'stage':stage,'ok':True,'peer_release':handshake['release'],'scope':allowed})
        stage='signed_candidates'
        page=await peer.candidates({'kind':'candidates','version':'catalog-v1','scope':allowed,'cursor':None})
        if not isinstance(page,dict) or set(page)!={'item','cursor'}:raise ConflictError('Invalid candidate page')
        steps.append({'stage':stage,'ok':True,'has_candidate':page['item'] is not None})
    try:
        await asyncio.wait_for(run(),timeout=15)
        ok=True
    except Exception as exc:
        if isinstance(exc,asyncio.TimeoutError):coded(exc,'REQUEST_TIMEOUT')
        ok=False;steps.append({'stage':stage,'ok':False,'diagnostic':failure(exc),**details})
    return {'request_id':current().get('request_id'),'release':RELEASE,'transport':{'local':'ubuntu-http','r2':'worker-native-rpc'}.get(getattr(r,'kind',None),'unknown'),'executor_mode':str(getattr(getattr(r,'sync_env',None),'TEACHER_SYNC_EXECUTOR_MODE','local')),'ok':ok,'steps':steps,'elapsed_ms':round((time.monotonic()-started)*1000),'checked_at':int(time.time()),'message':'已通过真实同步链路读取候选页；未创建任务或传输文件' if ok else '测试失败，请展开诊断；未取得错误码不代表发生 1101/1102'}
