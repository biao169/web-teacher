"""Isolated import check for project startup code; not a Workers SDK emulator."""
import argparse
import ast
import builtins
import datetime
import importlib.util
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


def check(runtime, source=None):
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
        spec=importlib.util.spec_from_file_location('worker_runtime.entrypoint',runtime/'entrypoint.py')
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        assert module.application.application is not None, 'Website routes not prebuilt'
        site = sys.modules['worker_runtime.web_application'].site
        assert site.middleware_stack is not None, 'Middleware not prebuilt'
        assert not hasattr(site.state, 'worker_transfer'), 'Transfer state built during startup'
        assert 'backend.entrypoints.worker' not in sys.modules, 'Legacy entrypoint constructed an unused app'
        if (runtime/'snapshot.py').exists():
            for name in ('backend.app.adapters.d1.sql','backend.app.native.site_sync_dispatch',
                         'backend.app.native.web','backend.app.native.catalog','worker_runtime.http_snapshot',
                         'worker_runtime.transfer','fastapi','worker_runtime.routing'):
                assert name in sys.modules, 'Snapshot definition missing: '+name
            for name in ('generated_resources','worker_runtime.resources','worker_runtime.sync_resources',
                         'worker_runtime.cron_entry','worker_runtime.watchdog'):
                assert name not in sys.modules, 'Execution-only module on startup path: '+name
        assert hasattr(module.Default,'fetch') and hasattr(module.TransferCoordinator,'fetch')
    print('Website routes/middleware prebuilt without startup I/O, entropy or transfer state. SDK/cloud validation still required.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime',type=Path,default=Path(__file__).resolve().parent/'runtime')
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--syntax-only', action='store_true', help='Dependency-free preflight; full import check runs after packaging')
    args=parser.parse_args()
    if args.syntax_only:
        for path in args.runtime.rglob('*.py'):
            ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
        print('Runtime syntax checked; snapshot import validation runs after dependencies are installed.')
    else:
        check(args.runtime.resolve(), args.source.resolve())
