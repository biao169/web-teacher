"""Same-origin transfer adapter; existing services own authorization and quotas."""
import copy
import json
from types import SimpleNamespace
from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse
from jinja2 import Environment, DictLoader, StrictUndefined, select_autoescape
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from backend.app.native.media import Media
from backend.app.native.catalog import Error
from backend.app.native.storage import R2Store
from transfer.backend.identity import SessionSQL
from transfer.backend.native import Transfers, app_factory
from transfer.backend.presentation import portal_context, management_context
from transfer.backend.resources import BoundedIO, Capacity


class CatalogRoot:
    """The existing presentation helper reads just this bundled catalog."""
    def __init__(self, text): self.text = text
    def __truediv__(self, path):
        if path != 'transfer/frontend/native/transfer-i18n-catalog.js':
            raise ValueError('Unexpected bundled resource')
        return self
    def read_text(self, **kwargs): return self.text


class TransferStore(R2Store):
    async def prune_task(self, task, limit=8):
        import re
        import js
        from pyodide.ffi import to_js
        if not re.fullmatch('[a-f0-9]{32}', task): raise Error('无效任务地址')
        prefix = self.prefix + task + '/'
        result = await self.bucket.list(to_js({'prefix': prefix, 'limit': limit}, dict_converter=js.Object.fromEntries))
        objects = list(result.objects)
        for obj in objects:
            if not str(obj.key).startswith(prefix): raise Error('对象地址不匹配', 409)
            await self.bucket.delete(obj.key)
        return {'removed': len(objects), 'done': not bool(result.truncated)}


def install(app, factory, templates, catalog, stores=None):
    renderer = Environment(loader=DictLoader(templates), autoescape=select_autoescape(), undefined=StrictUndefined)
    original = len(app.router.routes)

    async def runtime(request):
        main = copy.copy(factory(request))
        main.auth = Auth(main.sql, main.passwords)
        main.p = await main.auth.principal(request.cookies.get(main.config.name('session')))
        main.content = Content(main.sql, main.auth)
        main.media = Media(main.sql, main.auth, main.content, main.media_store, main.kind)
        p = main.p
        if p:
            main.auth.require(p, 'transfer')
            p = {**p, '_integrated': True, 'role_id': p['role_uid'],
                 'send': bool(p['permissions']['transfer'].get('can_create'))}
        if stores:
            store, cache = stores(main)
        else:
            store = TransferStore(main.media_store.bucket, 'transfer/media/')
            cache = R2Store(main.cache_store.bucket, 'transfer/cache/')
        if not await main.sql.query('SELECT 1 FROM tool_settings WHERE id=1'):
            await Transfers(main.sql, store).initialize()
        action = 'create' if request.method == 'POST' and (
            request.url.path in ('/transfer/api/tasks', '/transfer/api/examples') or
            request.url.path.endswith('/chunk') and request.url.path != '/transfer/api/relay/chunk') else 'view'
        sql = SessionSQL(main.sql, p, action)
        presentation = await portal_context(main, request, CatalogRoot(catalog)) if request.method == 'GET' and request.url.path == '/transfer/' else {}
        return SimpleNamespace(sql=sql, p=p, store=store, cache=cache,
            service=Transfers(sql, store, indexed=True), origin=main.config.origin,
            teacher_origin=main.config.origin, secret=p['csrf'] if p else '',
            render=lambda name, **values: renderer.get_template(name).render(transfer_base='/transfer', **presentation, **values))

    async def workspace(request):
        r = await runtime(request)
        if not r.p: raise Error('请先登录', 401)
        values = await management_context(r, dict(request.query_params))
        return {'transfer_content': r.render('management.html', embedded=True, **values), 'transfer_manager': values['admin']}
    app.state.transfer_admin_workspace = workspace

    @app.get('/transfer')
    @app.get('/transfer/login')
    async def enter(request: Request):
        if request.url.path == '/transfer/login' and not (await runtime(request)).p:
            return RedirectResponse('/auth/login?next=%2Ftransfer%2F', 303)
        return RedirectResponse('/transfer/', 303)

    @app.get('/transfer/api/storage-status')
    async def status(request: Request):
        r = await runtime(request)
        if not await r.service.manager(r.p): raise Error('没有快传管理权限', 403)
        _, settings = await r.service.settings()
        reserved = int((await r.sql.query("SELECT coalesce(sum(CAST(reserved_bytes AS INTEGER)),0) n FROM temporary_shares WHERE state!='deleted'"))[0]['n'])
        rows = await r.sql.query("SELECT value FROM service_meta WHERE key='worker:transfer-cleanup-status'")
        cleanup = json.loads(rows[0]['value']) if rows else {}
        return JSONResponse({'storage_kind': 'r2', 'cache_reserved_bytes': reserved,
            'cache_limit_bytes': int(settings['temporaryStorageBytes']),
            'cleanup': {**cleanup, 'enabled': settings.get('temporaryAutoCleanup', True)}}, headers={'Cache-Control':'no-store'})

    capacity = Capacity(slots=2, budget=8*1048576)
    child = app_factory(None, integrated=runtime, base='/transfer')
    app.state.worker_transfer = child
    app.mount('/transfer', BoundedIO(child, capacity), name='worker-transfer')
    app.router.routes[:] = app.router.routes[original:] + app.router.routes[:original]
    return child
