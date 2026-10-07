"""Bounded, read-only diagnostic using the production peer transport."""
import asyncio,time,json
from site_sync.integration.host import adapter,runtime,scopes,grant_id
from site_sync.core.journal import failure
from site_sync.core.authority import AuthorizationError,ConflictError

async def probe(r):
    started=time.monotonic();steps=[];stage='local_connection'
    async def run():
        nonlocal stage
        db=adapter(r)
        rows=await db.query("SELECT p.peer_id,g.scopes_json FROM sync_peers p JOIN sync_connections c ON c.peer_id=p.peer_id JOIN sync_grants g ON g.grant_id=? AND g.principal_id=c.owner_uid WHERE p.peer_id='peer' AND p.enabled=1 AND g.enabled=1 AND (g.expires_at=0 OR g.expires_at>?)",(grant_id(r.p),int(time.time())))
        if not rows:raise AuthorizationError('Connection unavailable')
        allowed=sorted(set(scopes(r.p)) & set(json.loads(rows[0]['scopes_json'])))
        allowed=[x for x in allowed if x!='site_clone'] or (['site_clone'] if 'site_clone' in allowed else [])
        if not allowed:raise AuthorizationError('No permitted scope')
        steps.append({'stage':stage,'ok':True})
        stage='peer_factory'
        peer=await runtime(r).peer_factory({'peer_id':'peer'})
        steps.append({'stage':stage,'ok':True})
        stage='signed_candidates'
        page=await peer.candidates({'kind':'candidates','version':'catalog-v1','scope':allowed,'cursor':None})
        if not isinstance(page,dict) or set(page)!={'item','cursor'}:raise ConflictError('Invalid candidate page')
        steps.append({'stage':stage,'ok':True,'has_candidate':page['item'] is not None})
    try:
        await asyncio.wait_for(run(),timeout=15)
        ok=True
    except Exception as exc:
        ok=False;steps.append({'stage':stage,'ok':False,'diagnostic':failure(exc)})
    return {'ok':ok,'steps':steps,'elapsed_ms':round((time.monotonic()-started)*1000),'checked_at':int(time.time()),'message':'已通过真实同步链路读取候选页；未创建任务或传输文件' if ok else '测试失败，请展开诊断；未取得错误码不代表发生 1101/1102'}
