"""Real Uvicorn/SQLite/HTTP lifecycle; only host systemd/account/Git adapters are simulated."""
import hashlib,json,os,shutil,socket,subprocess,sys,time
from pathlib import Path
from types import SimpleNamespace
import sqlite3
from contextlib import closing
import httpx
import pytest
if os.name!='posix':pytest.skip('Linux managed-process acceptance',allow_module_level=True)
from deploy.linux.tweb import Manager,Layout,claim

ROOT=Path(__file__).resolve().parents[1]


def test_real_http_update_restart_reset_and_owned_uninstall(tmp_path,monkeypatch):
    l=Layout(tmp_path/'site',tmp_path/'config',tmp_path/'site/data',tmp_path/'site.service',tmp_path/'tweb')
    for path in (l.base,l.config,l.data):claim(path)
    (l.base/'releases').mkdir();(l.base/'transfer-data/files').mkdir(parents=True);(l.base/'transfer-data/cache').mkdir()
    l.unit.write_text('synthetic-test-unit');l.command.write_text('synthetic-test-command')
    db=l.data/'main.sqlite3'
    (l.config/'storage.toml').write_text(f'[storage]\ndata_dir="{l.data}"\ndatabase_path="{db}"\ntransfer_media_dir="{l.base}/transfer-data/files"\ntransfer_cache_dir="{l.base}/transfer-data/cache"\n')
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    origin=f'http://127.0.0.1:{port}';process=[None];logs=[];serial=[0]
    m=Manager(l)
    def stop():
        if process[0] and process[0].poll() is None:
            process[0].terminate();process[0].wait(timeout=15)
    def runner(args,**kw):
        args=list(map(str,args))
        if args[0]=='systemctl':
            if args[1] in ('stop','disable'):stop()
            if args[1]=='start':
                release=m.release();handle=(tmp_path/f'process-{len(logs)}.log').open('w');logs.append(handle)
                env={k:v for k,v in os.environ.items() if not k.startswith(('TEACHER_','TRANSFER_'))}
                env.update(TEACHER_CONFIG=str(l.config/'storage.toml'),TEACHER_ORIGIN=origin,PYTHONDONTWRITEBYTECODE='1')
                process[0]=subprocess.Popen([sys.executable,'-B','-m','uvicorn','backend.entrypoints.vps:app','--host','127.0.0.1','--port',str(port),'--no-access-log'],cwd=release,env=env,stdout=handle,stderr=handle)
            return SimpleNamespace(stdout='')
        if args[0]=='runuser':
            # Strip only the account switch. Keep real env -i, config, Python, CLI and lock.
            return subprocess.run(args[4:],check=True,input='acceptance-admin\nSynthetic-acceptance-only-077\nSynthetic-acceptance-only-077\n',text=True,capture_output=True,**kw)
        raise AssertionError('Unexpected host mutation: '+repr(args))
    m.run=runner
    def fetch(repo,branch):
        serial[0]+=1;dest=l.base/'releases'/str(serial[0]);dest.mkdir()
        for name in ('backend','frontend','transfer','database','deploy'):
            shutil.copytree(ROOT/name,dest/name,ignore=shutil.ignore_patterns('__pycache__','.venv','node_modules','transfer-data'))
        shutil.copyfile(ROOT/'pyproject.toml',dest/'pyproject.toml')
        return dest,'synthetic-local-'+str(serial[0])
    def prepare(release,python):
        (release/'.venv').symlink_to(Path(sys.prefix),target_is_directory=True)
        (release/'data').symlink_to(l.data,target_is_directory=True)
        (release/'transfer-data').symlink_to(l.base/'transfer-data',target_is_directory=True)
    def health():
        with httpx.Client(base_url=origin,trust_env=False,timeout=1) as c:
            for _ in range(80):
                assert process[0].poll() is None,'Real server exited'
                try:
                    if c.get('/health/ready').status_code==200:return
                except httpx.TransportError:pass
                time.sleep(.1)
        raise AssertionError('Health timeout')
    monkeypatch.setattr(m,'fetch',fetch);monkeypatch.setattr(m,'prepare',prepare)
    monkeypatch.setattr(m,'healthy',health);monkeypatch.setattr(m,'active',lambda:process[0] is not None and process[0].poll() is None)
    state=dict(repo='https://github.com/example/teacher',branch='main',domain='teacher.example.org',python=sys.executable,user_created=False,phase='ready',owned_files={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in (l.unit,l.command)})
    m.save(state)
    release,_=fetch(state['repo'],'main');prepare(release,sys.executable);m.switch(release)
    try:
        m.db(release,'init');m.start()
        with httpx.Client(base_url=origin,trust_env=False,timeout=5) as c:
            for route in ('/health/ready','/zh','/en','/zh/projects','/zh/students','/transfer/health'):
                assert c.get(route).status_code==200,route
            assert c.get('/admin').status_code in (302,303)
            with closing(sqlite3.connect(db)) as con,con:
                con.execute("INSERT INTO students(uid,name) VALUES ('acceptance-sentinel','Preserve on update')")
            payload=l.base/'transfer-data/files/synthetic-payload';payload.write_bytes(b'owned-file')
            m.update(SimpleNamespace(repo=None,branch=None,scope='all',reset=False,confirm=None))
            assert c.get('/health/ready').status_code==200
            with closing(sqlite3.connect(db)) as con:
                assert con.execute("SELECT name FROM students WHERE uid='acceptance-sentinel'").fetchone()[0]=='Preserve on update'
            assert payload.read_bytes()==b'owned-file'
            stop();m.start();assert c.get('/transfer/health').status_code==200
            m.database(True,'RESET')
            with closing(sqlite3.connect(db)) as con:
                assert con.execute('SELECT count(*) FROM students').fetchone()[0]==0
                assert con.execute('SELECT count(*) FROM auth_users').fetchone()[0]==1
                assert con.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
                assert not con.execute('PRAGMA foreign_key_check').fetchall()
            assert payload.exists() and c.get('/zh').status_code==200
            m.uninstall('DELETE')
            assert process[0].poll() is not None
            assert not l.base.exists() and not l.data.exists() and not l.config.exists()
            assert not l.command.exists() and not l.unit.exists()
            with socket.socket() as sock:assert sock.connect_ex(('127.0.0.1',port))!=0
    finally:
        stop()
        for handle in logs:handle.close()
