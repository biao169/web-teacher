"""Keep both peers and their code lookup in the same short-lived coordinator."""
from urllib.parse import unquote, urlsplit


def coordinated(url):
    path = unquote(urlsplit(url).path)
    return path == '/transfer' or path.startswith('/transfer/') or path == '/admin/transfer'


async def dispatch(application, request, env, ctx, fetch):
    path=unquote(urlsplit(request.url).path)
    if path in ('/api/admin/site-sync/monitor','/api/admin/site-sync/wake'):
        from worker_runtime.sync_http import monitor
        return await fetch(monitor,request,env,ctx)
    if path.startswith('/api/admin/site-sync/') or path=='/api/site-sync/peer':
        from worker_runtime.sync_http import application as sync
        return await fetch(sync,request,env,ctx)
    if coordinated(request.url):
        namespace = env.TRANSFER_COORDINATOR
        return await namespace.get(namespace.idFromName('teacher-transfer-v1')).fetch(request)
    return await fetch(application, request, env, ctx)
