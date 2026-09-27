"""Mount the existing transfer application in the local teacher process."""
from types import SimpleNamespace
from contextlib import asynccontextmanager
import asyncio
from fastapi import Request
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment,FileSystemLoader,StrictUndefined,select_autoescape
from backend.app.native.catalog import Error
from backend.app.native.storage import LocalStore
from .identity import SessionSQL
from .native import Transfers,app_factory


def install(app,resources,root):
    templates=Environment(loader=FileSystemLoader(root/'transfer/frontend/native'),
                          autoescape=select_autoescape(),undefined=StrictUndefined)
    from .offline import DiskBudget,Maintenance
    disk=None;maintenance=None
    async def runtime(request):
        nonlocal disk
        main=await resources(request)
        # Refuse a silent fresh start while an unimported legacy database exists.
        if main.settings.transfer_database_path.is_file() and not await main.sql.query("SELECT 1 FROM service_meta WHERE key='integrated-source'"):
            raise Error('检测到旧快传数据库，请停服并执行快传迁移；原文件保持不变',503)
        p=main.p
        if p:main.auth.require(p,'transfer')
        if p:p={**p,'_integrated':True,'role_id':p['role_uid'],
                'send':bool(p['permissions'].get('transfer',{}).get('can_view') and p['permissions'].get('transfer',{}).get('can_create'))}
        store=DurableStore(main.settings.transfer_media_dir)
        if disk is None:disk=DiskBudget(store.root)
        if not await main.sql.query('SELECT 1 FROM tool_settings WHERE id=1'):
            await Transfers(main.sql,store).initialize()
        action='create' if request.method=='POST' and (request.url.path in ('/transfer/api/tasks','/transfer/api/examples') or (request.url.path.endswith('/chunk') and request.url.path!='/transfer/api/relay/chunk')) else 'view'
        sql=SessionSQL(main.sql,p,action)
        presentation={}
        if request.method=='GET' and request.url.path=='/transfer/':
            from .presentation import portal_context
            presentation=await portal_context(main,request,root)
        return SimpleNamespace(sql=sql,p=p,store=store,cache=LocalStore(main.settings.transfer_cache_dir),
            service=Transfers(sql,store,indexed=True,disk=disk),origin=main.config.origin,teacher_origin=main.config.origin,
            secret=p['csrf'] if p else '',
            render=lambda name,**values:templates.get_template(name).render(transfer_base='/transfer',**presentation,**values))
    async def admin_workspace(request):
        from .presentation import management_context
        r=await runtime(request)
        if not r.p:raise Error('请先登录',401)
        values=await management_context(r,dict(request.query_params))
        return {'transfer_content':r.render('management.html',embedded=True,**values),
                'transfer_manager':values['admin']}
    app.state.transfer_admin_workspace=admin_workspace
    original_lifespan=app.router.lifespan_context
    @asynccontextmanager
    async def lifespan(application):
        nonlocal disk,maintenance
        async with original_lifespan(application):
            worker=None
            try:
                try:
                    main=await resources(Request({'type':'http','method':'GET','path':'/transfer/','headers':[],'query_string':b'','server':('localhost',80),'scheme':'http'}))
                    legacy=main.settings.transfer_database_path.is_file() and not await main.sql.query("SELECT 1 FROM service_meta WHERE key='integrated-source'")
                    if not legacy:
                        store=DurableStore(main.settings.transfer_media_dir)
                        if disk is None:disk=DiskBudget(store.root)
                        maintenance=Maintenance(main.sql,store);application.state.transfer_maintenance=maintenance
                        worker=asyncio.create_task(maintenance.run())
                except Exception:
                    application.state.transfer_maintenance_error="离线缓存维护未能启动，请检查配置、磁盘权限及数据库；主站仍可使用。"
                yield
            finally:
                if worker:
                    maintenance.stopped.set()
                    # Finish the current bounded purge batch before releasing process locks.
                    await worker
    app.router.lifespan_context=lifespan
    app.mount('/transfer-static',StaticFiles(directory=root/'transfer/frontend/native'),name='transfer-static')
    from .resources import BoundedIO,Capacity,DurableStore
    capacity=Capacity.from_env()
    app.state.transfer_capacity=capacity
    @app.get('/transfer/api/storage-status')
    async def storage_status(request:Request):
        r=await runtime(request)
        if not await r.service.manager(r.p):raise Error('没有快传管理权限',403)
        _,settings=await r.service.settings()
        value=await disk.snapshot(r.sql,settings)
        value['cache_limit_bytes']=int(settings['temporaryStorageBytes'])
        value['cache_reserved_bytes']=int((await r.sql.query("SELECT coalesce(sum(CAST(reserved_bytes AS INTEGER)),0) n FROM temporary_shares WHERE state!='deleted'"))[0]['n'])
        value['cleanup']={**maintenance.status,'enabled':settings.get('temporaryAutoCleanup',True)} if maintenance else {'running':False,'error':'后台清理尚未启动，请核对主站启动方式。'}
        from fastapi.responses import JSONResponse
        return JSONResponse(value,headers={'Cache-Control':'no-store'})

    app.mount('/transfer',BoundedIO(app_factory(None,integrated=runtime,base='/transfer'),capacity),name='transfer')

