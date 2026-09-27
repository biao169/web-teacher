"""Explicit test command; dependencies and isolated tests use the selected interpreter."""
from pathlib import Path
import os,shutil,subprocess,sys
ROOT=Path(__file__).resolve().parents[2]

def run(dom=False,report=None):
    if not (ROOT/'tests/run_acceptance.py').is_file():raise ValueError('Test suite is absent from this package')
    subprocess.run([sys.executable,'-m','pip','install','--only-binary=:all:','--no-cache-dir','-r',str(ROOT/'deploy/shared/requirements/requirements-test.lock')],check=True)
    env=os.environ.copy();env.pop('TEACHER_DEV_ADMIN_PASSWORD',None)
    if dom:
        if not shutil.which('node'):raise ValueError('Node.js is required for --dom; Python-only tests do not need Node.js')
        if not env.get('JSDOM_PATH'):
            # npm.cmd is run through COMSPEC on Windows; no user text is interpolated.
            if not (ROOT/'tests/node_modules/jsdom').is_dir():
                npm=shutil.which('npm')
                if not npm:raise ValueError('npm is required to install optional DOM test dependencies')
                command=[npm,'ci','--ignore-scripts']
                if os.name=='nt':command=[os.environ.get('COMSPEC','cmd.exe'),'/d','/c','npm ci --ignore-scripts']
                subprocess.run(command,cwd=ROOT/'tests',check=True)
            env['JSDOM_PATH']=str(ROOT/'tests/node_modules/jsdom')
    return subprocess.call([sys.executable,'-B',str(ROOT/'tests/run_acceptance.py'),*(['--dom'] if dom else []),*(['--report',str(report)] if report else [])],cwd=ROOT,env=env)
