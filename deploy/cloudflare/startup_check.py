"""Isolated import check for project startup code; not a Workers SDK emulator."""
import argparse
import ast
import builtins
import datetime
import importlib.util
import json
import os
from pathlib import Path
import secrets
import random
import socket
import subprocess
import sys
import time
from types import ModuleType, SimpleNamespace
from unittest.mock import patch


def check(runtime, source=None, executor_only=False, executor_dependencies=False, admin_only=False):
    if source:
        sys.path.insert(0, str(source))
    def blocked(*args, **kwargs):
        raise RuntimeError('Startup side effect blocked / 启动阶段副作用被阻止')
    # SDK is supplied by Cloudflare; this test checks our import graph, not its internals.
    workers=ModuleType('workers')
    workers.WorkerEntrypoint=type('WorkerEntrypoint', (), {})
    workers.DurableObject=type('DurableObject', (), {})
    workers.asgi=SimpleNamespace(fetch=blocked)
    package=ModuleType('worker_runtime');package.__path__=[str(runtime)]
    sys.modules['workers']=workers;sys.modules['worker_runtime']=package
    original_import=builtins.__import__
    def guarded_import(name, *args, **kwargs):
        if name.split('.')[0] in {'js','pyodide'}:
            raise RuntimeError('Request-only module imported at startup / 请求模块提前导入: '+name)
        return original_import(name,*args,**kwargs)
    class NoClock(datetime.datetime):
        now=classmethod(blocked)
        utcnow=classmethod(blocked)
        today=classmethod(blocked)
    class NoDate(datetime.date):
        today=classmethod(blocked)
    def audit(event,args):
        if event in ('socket.connect','socket.bind','subprocess.Popen','os.system','sqlite3.connect'):
            blocked()
        if event=='open':
            _,mode,flags=args
            if (isinstance(mode,str) and any(c in mode for c in 'wax+')) or (flags & (os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)):
                blocked()
    sys.addaudithook(audit)
    with patch.object(builtins,'__import__',guarded_import), \
         patch.object(os,'urandom',blocked), patch.object(random,'_urandom',blocked), patch.object(secrets,'token_hex',blocked), \
         patch.object(secrets,'token_bytes',blocked), patch.object(secrets,'token_urlsafe',blocked), \
         patch.object(time,'time',blocked), patch.object(time,'monotonic',blocked), \
         patch.object(time,'perf_counter',blocked), patch.object(time,'sleep',blocked), \
         patch.object(datetime,'datetime',NoClock), patch.object(datetime,'date',NoDate):
        if admin_only:
            importlib.import_module('worker_runtime.admin_entrypoint')
            assert 'worker_runtime.entrypoint' not in sys.modules
            assert 'backend.app.native.web_public' not in sys.modules
            assert 'generated_public_templates' not in sys.modules
            assert 'generated_resources' not in sys.modules
            admin=sys.modules['worker_runtime.admin_entrypoint']
            assert admin.application.application is None
            assert not hasattr(admin.Default,'scheduled') and not hasattr(admin.Default,'sync_tick')
            assert 'worker_runtime.admin_resources' in sys.modules
            print('Admin snapshot checked; HTTP only, no public routes, no Cron.')
            return
        if not executor_only:
            spec=importlib.util.spec_from_file_location('worker_runtime.entrypoint',runtime/'entrypoint.py')
            module=importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            assert module.application.application is None, 'Application built during startup'
            assert 'backend.entrypoints.worker' not in sys.modules, 'Legacy entrypoint constructed an unused app'
            if (runtime/'snapshot.py').exists():
                for name in ('backend.app.native.web_public', 'worker_runtime.transfer', 'transfer.backend.codes'):
                    assert name in sys.modules, 'Snapshot preload missing: '+name
        if not executor_only:
            if (runtime/'public_resources.py').exists():assert 'worker_runtime.public_resources' in sys.modules
            forbidden=('backend.app.native.web','backend.app.native.web_admin','worker_runtime.admin_resources','generated_resources','generated_admin_templates','worker_runtime.setup','worker_runtime.media_upload')
            assert not any(n in sys.modules for n in forbidden),[n for n in forbidden if n in sys.modules]
        executor_spec=importlib.util.spec_from_file_location('worker_runtime.sync_executor',runtime/'sync_executor.py')
        executor=importlib.util.module_from_spec(executor_spec);executor_spec.loader.exec_module(executor)
        assert hasattr(executor.Default,'sync_tick')
        if executor_only:
            # Cold entrypoint must not preload peer HTTP or business catalogs.
            cold_forbidden=('worker_runtime.sync_resources','site_sync.integration.peer_api','starlette','backend.app.native.catalog')
            if any(n in sys.modules for n in cold_forbidden):
                raise AssertionError('Executor cold startup loaded request dependencies: '+', '.join(n for n in cold_forbidden if n in sys.modules))
            if executor_dependencies:
                # Exercise the actual deferred import graph, still without DB/network work.
                importlib.import_module('site_sync.integration.worker_schedule')
                importlib.import_module('site_sync.integration.host')
                cron_http=[n for n in ('worker_runtime.sync_resources','site_sync.integration.peer_api','starlette') if n in sys.modules]
                if cron_http:raise AssertionError('Executor Cron dependency loaded HTTP runtime: '+', '.join(cron_http))
                importlib.import_module('worker_runtime.sync_resources')
            forbidden=('backend.app.native.web','worker_runtime.resources','generated_resources','worker_runtime.transfer','backend.entrypoints.worker')
            loaded=[n for n in forbidden if n in sys.modules]
            if loaded:
                raise AssertionError('Executor isolation check failed.\nExecutor mode: separate\nLoaded forbidden modules:\n'+
                    '\n'.join('- '+n+' | '+str(getattr(sys.modules[n],'__file__','unknown')) for n in loaded)+
                    '\nAllowed generated modules: generated_native_resources\nThe separate executor must not import bundled website/template/transfer resources.\nCheck catalog imports and PACKAGE resource generation.')
            print(json.dumps({'executor_import_check':'dependencies' if executor_dependencies else 'cold','module_count':len(sys.modules),'project_module_count':sum(n.startswith(('site_sync','backend','worker_runtime','transfer','generated_')) for n in sys.modules),'generated_modules':[n for n in sys.modules if n.startswith('generated_')],'forbidden_modules':loaded,'backend_modules':sorted(n for n in sys.modules if n.startswith('backend'))}))
        else:
            assert hasattr(module.Default,'fetch') and hasattr(module.TransferCoordinator,'fetch')
    print('Snapshot imports checked; request application and transfer state remain uninitialized. SDK/cloud validation still required.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime',type=Path,default=Path(__file__).resolve().parent/'runtime')
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--admin-only',action='store_true')
    parser.add_argument('--executor-only',action='store_true',help='Check executor imports in a fresh process without warming the main site')
    parser.add_argument('--executor-dependencies',action='store_true',help='Check deferred sync/peer dependency graph without executing requests')
    parser.add_argument('--syntax-only', action='store_true', help='Dependency-free preflight; full import check runs after packaging')
    args=parser.parse_args()
    if args.syntax_only:
        for path in args.runtime.rglob('*.py'):
            ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
        print('Runtime syntax checked; snapshot import validation runs after dependencies are installed.')
    else:
        check(args.runtime.resolve(), args.source.resolve(),args.executor_only or args.executor_dependencies,args.executor_dependencies,args.admin_only)
