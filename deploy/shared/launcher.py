"""Shared Windows/Linux launcher; explicit user storage configuration survives code updates."""
import argparse,asyncio,getpass,json,os,socket,subprocess,sys,time,webbrowser
from pathlib import Path
from urllib.request import build_opener,ProxyHandler
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
def state_root():
    """Keep launcher-managed data outside replaceable source directories."""
    root=Path(os.environ.get('TEACHER_LAUNCHER_HOME',str(Path(os.environ.get('LOCALAPPDATA',str(Path.home()/'.local/share')))/'TeacherSiteLauncher'))).expanduser().resolve();root.mkdir(parents=True,exist_ok=True);return root

def configure(profile='normal'):
    """TOML and explicit environment paths take precedence over launcher defaults."""
    from backend.app.config import Settings
    if profile=='demo':
        from deploy.shared.development import configure as development
        return development(ROOT/'data')
    if not os.environ.get('TEACHER_CONFIG') and not os.environ.get('TEACHER_DATA_DIR'):os.environ['TEACHER_DATA_DIR']=str(ROOT/'data')
    settings=Settings.from_env()
    if not os.environ.get('TEACHER_CONFIG') and settings.data_dir==(ROOT/'data').resolve():
        from deploy.shared.development import claim
        claim(settings)
    return settings

def check_ports(ports):
    """Reject live listeners; allow POSIX TIME_WAIT after an owned service stops."""
    for port in ports:
        with socket.socket() as sock:
            # POSIX reuse permits an orderly restart, not a second live listener.
            # Windows reuse can share a live port, so request exclusivity there instead.
            if os.name!='nt':sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
            elif hasattr(socket,'SO_EXCLUSIVEADDRUSE'):sock.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
            try:sock.bind(('127.0.0.1',port))
            except OSError:raise ValueError(f'Port {port} is in use; no unknown process was stopped.') from None

async def initialize(settings,both=False,development=False):
    """Preserve native records; only the first empty account set prompts for an administrator."""
    from backend.app.native.database import Database
    from backend.app.native.auth import Auth
    from backend.app.security.passwords import Passwords
    from backend.app.adapters.sqlite.passwords import LocalKDF
    db=Database(settings.database_path);db.initialize()
    if not await db.query('SELECT 1 FROM auth_users LIMIT 1'):
        username=(os.environ.get('TEACHER_DEV_ADMIN_USER','admin') if development else input('Administrator username [admin]: ').strip() or 'admin')
        password=os.environ.pop('TEACHER_DEV_ADMIN_PASSWORD','') if development else ''
        if not password:
            password=getpass.getpass('Password (6-128 characters): ')
            if password!=getpass.getpass('Confirm password: '):raise ValueError('Passwords differ')
        await Auth(db,Passwords(LocalKDF())).bootstrap(username,password)
    # Transfer defaults initialize on first access, after checking for legacy data.

def stop(process):
    """Stop only a child process owned by this launcher."""
    if process.poll() is not None:return
    process.terminate()
    try:process.wait(timeout=8)
    except subprocess.TimeoutExpired:process.kill();process.wait(timeout=3)

def serve(settings,both=False,open_browser=True,seconds=None):
    """Run the single integrated service, using the configured cache for logs."""
    from deploy.shared.http_limits import teacher_concurrency
    os.environ.pop('TEACHER_DEV_ADMIN_PASSWORD',None)
    main_concurrency=teacher_concurrency()
    main_port=int(os.environ.get('TEACHER_PORT','8003'));check_ports([main_port])
    main_origin=os.environ.setdefault('TEACHER_ORIGIN',f'http://127.0.0.1:{main_port}')
    items=[('teacher','backend.entrypoints.vps:app',main_port,'/health/ready')]
    logs=settings.data_dir/'logs';logs.mkdir(parents=True,exist_ok=True);processes=[];handles=[];opener=build_opener(ProxyHandler({}))
    try:
        for name,entry,port,health in items:
            # Logging is owned by the child service, including startup output.
            path=logs/'service.log'
            proc=subprocess.Popen([sys.executable,'-m','deploy.shared.service',entry,'--host','127.0.0.1','--port',str(port),'--limit-concurrency',str(main_concurrency if name=='teacher' else 8)],cwd=ROOT,env=os.environ|{'PYTHONUTF8':'1','PYTHONDONTWRITEBYTECODE':'1'});processes.append(proc)
            for _ in range(150):
                if proc.poll() is not None:raise RuntimeError(f'{name} failed; see {path}')
                try:
                    with opener.open(f'http://127.0.0.1:{port}{health}',timeout=1) as response:
                        if response.status==200:break
                except OSError:pass
                time.sleep(.1)
            else:raise RuntimeError(f'{name} readiness timed out; see {path}')
        print('Website: '+main_origin+'; admin: '+main_origin+'/admin',flush=True)
        if open_browser:webbrowser.open(main_origin+'/admin')
        started=time.monotonic()
        while all(p.poll() is None for p in processes):
            if seconds is not None and time.monotonic()-started>=seconds:return
            time.sleep(.25)
        raise RuntimeError('A service exited; inspect configured data/logs/service.log.')
    finally:
        for process in reversed(processes):stop(process)
        for handle in handles:handle.close()

def main(argv=None):
    """Default missing mode to start; seed and reset remain explicit operations."""
    p=argparse.ArgumentParser();p.add_argument('mode',nargs='?',default='start',choices=['start','seed','examples','both','init','reset','migrate','fresh','rebuild','test','frontend-examples','cleanup-preview','cleanup-run','cleanup-status']);p.add_argument('--profile',choices=['normal','demo'],default='normal');p.add_argument('--ready',action='store_true');p.add_argument('--no-browser',action='store_true');p.add_argument('--dom',action='store_true');p.add_argument('--report');a=p.parse_args(argv)
    if not a.ready:
        from deploy.shared.bootstrap import prepare_environment
        python=prepare_environment();raise SystemExit(subprocess.call([str(python),str(Path(__file__).resolve()),*(sys.argv[1:] if argv is None else argv),'--ready'],cwd=ROOT))
    if a.mode=='test':
        from deploy.shared.testing import run
        raise SystemExit(run(a.dom,a.report))
    if a.mode in ('fresh','rebuild') and a.profile!='demo':
        raise ValueError('Fresh development requires --profile demo')
    s=configure(a.profile)
    if a.mode.startswith('cleanup-'):
        from backend.cli import main as maintenance
        asyncio.run(maintenance([a.mode]));return
    if a.mode in ('fresh','rebuild'):
        check_ports([int(os.environ.get('TEACHER_PORT',8003))])
        from deploy.shared.development import reset
        reset(s)
        asyncio.run(initialize(s,development=True))
        from backend.app.native.demo import seed
        from backend.app.native.database import Database
        print(json.dumps(asyncio.run(seed(Database(s.database_path))),ensure_ascii=False))
        print('Fresh development database: '+str(s.database_path),flush=True)
        if a.mode=='fresh':serve(s,open_browser=not a.no_browser)
        return
    if a.mode=='frontend-examples':
        check_ports([int(os.environ.get('TEACHER_PORT',8003))])
        from backend.app.native.frontend_examples import main as add_examples
        raise SystemExit(add_examples(['add'],settings=s))
    if a.mode in ('examples','reset','migrate'):check_ports([int(os.environ.get('TEACHER_PORT',8003))])
    if a.mode=='reset':
        from backend.cli import main as maintenance
        asyncio.run(maintenance(['reset-data','--include-transfer']));return
    from backend.app.native.database import Database
    if a.mode=='migrate':
        from backend.app.native.schema_upgrade import migrate
        print(json.dumps(migrate(Database(s.database_path)),ensure_ascii=False,indent=2));return
    if a.mode=='examples':
        from backend.app.native.example_cli import run
        asyncio.run(run(s));return
    if a.mode=='seed':
        from backend.app.native.demo import seed
        db=Database(s.database_path);db.initialize();result=asyncio.run(seed(db));print(json.dumps(result,ensure_ascii=False,indent=2));print('Database: '+str(s.database_path));print('Examples appended. Refresh the website; no service restart is required.');return
    asyncio.run(initialize(s,a.mode=='both'))
    print('Database: '+str(s.database_path));print('Cache: '+str(s.cache_dir));print('Media: '+str(s.media_dir))
    if a.mode!='init':serve(s,a.mode=='both',not a.no_browser)
if __name__=='__main__':
    try:main()
    except KeyboardInterrupt:print('Stopped owned services.')
    except Exception as exc:print('Operation failed: '+str(exc),file=sys.stderr);sys.exit(1)
