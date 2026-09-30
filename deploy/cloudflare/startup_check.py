"""Isolated import check for project startup code; not a Workers SDK emulator."""
import argparse
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


def check(runtime):
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
        if name.split('.')[0] in {'backend','transfer','generated_resources','sqlite3','_sqlite3','js','pyodide','fastapi'}:
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
        assert module.application.application is None, 'Application built during startup'
        assert hasattr(module.Default,'fetch') and hasattr(module.TransferCoordinator,'fetch')
    print('Project startup import checked; request application remains uninitialized. SDK/cloud validation still required.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime',type=Path,default=Path(__file__).resolve().parent/'runtime')
    args=parser.parse_args()
    check(args.runtime.resolve())
