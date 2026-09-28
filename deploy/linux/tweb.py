"""Ubuntu/Debian lifecycle manager. Fixed owned paths; no shell interpolation.

Only CLI main requires root/systemd. Layout and injected command runner allow
isolated lifecycle tests without modifying the host or contacting GitHub.
"""
import argparse
from dataclasses import dataclass
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shlex
import shutil
import socket
import subprocess
import sys
import time
import uuid
from urllib.request import build_opener, ProxyHandler
from urllib.request import Request
from urllib.error import HTTPError, URLError

DEFAULT_REPOSITORY = 'https://github.com/biao169/web-teacher.git'
DEFAULT_BRANCH = 'web-py'

MARKER = 'teacher-site-managed-v1\n'
SERVICE = 'teacher-site.service'
USER = 'teacher-site'


def port_number(value):
    if isinstance(value,bool) or not str(value).isdigit() or not 1024<=int(value)<=65535:
        raise ValueError('端口须为 1024–65535 / Port must be 1024–65535')
    return int(value)


def color(text,code='36'):
    # Redirected logs and NO_COLOR never contain terminal escape sequences.
    if sys.stdout.isatty() and 'NO_COLOR' not in os.environ and os.environ.get('TERM')!='dumb':
        return f'\033[{code}m{text}\033[0m'
    return text


def heading(text):print(color('── '+text+' ──','1;36'))

@dataclass(frozen=True)
class Layout:
    base: Path = Path('/opt/teacher-site')
    config: Path = Path('/etc/teacher-site')
    data: Path = Path('/opt/teacher-site/data')
    unit: Path = Path('/etc/systemd/system/teacher-site.service')
    command: Path = Path('/usr/local/bin/tweb')

    @property
    def current(self): return self.base / 'current'
    @property
    def state(self): return self.config / 'install.json'


def run(argv, **kwargs):
    return subprocess.run([str(x) for x in argv], check=True, **kwargs)


def repository(value):
    if not re.fullmatch(r'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?', value):
        raise ValueError('仓库必须是无凭据的 https://github.com/OWNER/REPO 地址')
    return value


def branch_name(value):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_./-]{0,150}', value) or '..' in value or value.endswith(('/', '.', '.lock')):
        raise ValueError('分支名无效')
    return value


def hostname(value):
    if len(value)>253 or not re.fullmatch(r'[a-z0-9.-]+',value) or '.' not in value or any(not p or len(p)>63 or p.startswith('-') or p.endswith('-') for p in value.split('.')):
        raise ValueError('请输入有效域名，不带协议、端口或路径')
    return value


def no_symlinks(path):
    for item in (path, *path.parents):
        if item.is_symlink(): raise ValueError('管理路径不能经过符号链接: '+str(item))


def owned(path):
    no_symlinks(path)
    marker=path/'.tweb-owned'
    if marker.is_symlink() or not marker.is_file() or marker.read_text()!=MARKER:
        raise ValueError('拒绝操作未标记目录: '+str(path))


def claim(path):
    no_symlinks(path)
    if path.exists():
        if not path.is_dir() or any(path.iterdir()): raise ValueError('安装路径已存在且非空: '+str(path))
    path.mkdir(parents=True,exist_ok=True)
    (path/'.tweb-owned').write_text(MARKER)


def write(path, text, mode=0o644):
    no_symlinks(path)
    temp=path.with_name(path.name+'.tmp-'+uuid.uuid4().hex)
    try:
        temp.write_text(text,encoding='utf-8');temp.chmod(mode);os.replace(temp,path)
    finally: temp.unlink(missing_ok=True)


def confirm(token, supplied):
    if supplied==token:return
    if supplied is not None:raise ValueError('确认文本不匹配')
    if not sys.stdin.isatty():raise ValueError('需要终端确认或 --confirm '+token)
    if input(color('不可撤销 / Irreversible — 输入 / type '+token+': ','1;31')).strip()!=token:raise ValueError('已取消 / Cancelled')


def check_source(path):
    required=('pyproject.toml','database/schema.sql','backend/entrypoints/vps.py','deploy/linux/tweb.py','deploy/shared/launcher.py','deploy/shared/requirements/requirements-vps.lock','deploy/vps/release.py','release-manifest.json')
    if not all((path/n).is_file() for n in required):raise ValueError('仓库根目录不是完整教师网站源码')
    # Git symlinks must not escape the downloaded release, including pip lock includes.
    for p in path.rglob('*'):
        if '.git' in p.relative_to(path).parts:continue
        if p.is_symlink():raise ValueError('源码包不能包含符号链接: '+str(p.relative_to(path)))
    if any((path/name).exists() for name in ('data','transfer-data')):raise ValueError('源码包含运行数据 data/transfer-data')


def protected_digest(root,names=('backend','database','transfer','deploy','pyproject.toml')):
    result={}
    for name in names:
        p=root/name
        for f in ([p] if p.is_file() else p.rglob('*')):
            if f.is_file() and not any(x in ('__pycache__','.venv','node_modules') for x in f.relative_to(root).parts):
                data=f.read_bytes()
                if f.name=='pyproject.toml':
                    data=re.sub(rb'^version\s*=.*$',b'',data,flags=re.M)
                result[f.relative_to(root).as_posix()]=hashlib.sha256(data).hexdigest()
    return result


class Manager:
    def __init__(self, layout=Layout(), runner=run):
        self.l=layout;self.runner=runner;self.sequence=0

    def step(self,label,action,*args,**kwargs):
        self.sequence+=1;number=self.sequence;started=time.monotonic()
        print(color(f'[{number:02}] 开始 / START — '+label,'36'),flush=True)
        try:result=action(*args,**kwargs)
        except BaseException:
            print(color(f'[{number:02}] 失败或中断 / FAILED or INTERRUPTED — '+label,'31'),flush=True)
            raise
        print(color(f'[{number:02}] 完成 / OK — {label} ({time.monotonic()-started:.1f}s)','32'),flush=True)
        return result

    def run(self,argv,**kwargs):
        # Describe operations without echoing environment values, inline code or secrets.
        args=list(map(str,argv));program=Path(args[0]).name
        if program=='systemctl':
            labels={'stop':'停止服务 / Stop service','start':'启动服务 / Start service',
                    'daemon-reload':'重新加载服务定义 / Reload service definitions',
                    'enable':'启用开机启动 / Enable on boot','disable':'停止并禁用服务 / Stop and disable service',
                    'status':'查看服务状态 / Inspect service','show':'检查服务定义 / Inspect service definition'}
            label=labels.get(args[1],'服务操作 / Service operation')
        elif program=='git':label='下载源码 / Download source' if 'clone' in args else '读取版本信息 / Read revision'
        elif 'pip' in args:label='同步 Python 依赖 / Synchronize Python dependencies'
        elif 'venv' in args:label='准备 Python 环境 / Prepare Python environment'
        elif 'backend.cli' in args:label='数据库或维护操作 / Database or maintenance: '+args[args.index('backend.cli')+1]
        elif any(a.endswith('/launcher.py') for a in args):label='初始化并核验数据库 / Initialize and verify database'
        elif 'deploy.vps.release' in args or any(a.endswith('/release.py') for a in args):label='校验或生成部署文件 / Verify or generate deployment files'
        elif program=='runuser':label='验证服务账号访问权限 / Verify service-account access'
        elif program in ('chown','useradd','userdel','groupdel'):label='更新受管账号或权限 / Update managed account or permissions: '+program
        elif program=='tail':label='跟踪运行日志（Ctrl+C 结束） / Follow logs (Ctrl+C to exit)'
        else:label='执行部署检查 / Run deployment check'
        return self.step(label,self.runner,argv,**kwargs)

    def load(self):
        for p in (self.l.base,self.l.config,self.l.data):owned(p)
        no_symlinks(self.l.state)
        state=json.loads(self.l.state.read_text())
        port_number(state.get('port',8003))
        repository(state['repo']);branch_name(state['branch']);hostname(state['domain'])
        return state

    def save(self,state):write(self.l.state,json.dumps(state,ensure_ascii=False,indent=2)+'\n',0o600)

    def write_command(self,state):
        no_symlinks(self.l.command)
        if self.l.command.exists() and hashlib.sha256(self.l.command.read_bytes()).hexdigest()!=state['owned_files'].get(str(self.l.command)):
            raise ValueError('tweb 入口已被外部修改 / Manager entry was modified externally')
        command=shlex.quote(state['python'])+' '+shlex.quote(str(self.l.base/'tweb.py'))+' "$@"'
        write(self.l.command,'#!/bin/sh\n# Teacher website manager; sudo may request your OS password.\n'
              'if [ "$(id -u)" -ne 0 ]; then exec sudo -- '+command+'; fi\nexec '+command+'\n',0o755)
        state['owned_files'][str(self.l.command)]=hashlib.sha256(self.l.command.read_bytes()).hexdigest();self.save(state)

    def active(self):
        return subprocess.run(['systemctl','is-active','--quiet',SERVICE],check=False).returncode==0

    def switch(self, release):
        if release.parent!=self.l.base/'releases' or release.is_symlink() or not release.is_dir():raise ValueError('无效版本目录')
        temp=self.l.base/('.current-'+uuid.uuid4().hex)
        temp.symlink_to(release);os.replace(temp,self.l.current)

    def release(self):
        if not self.l.current.is_symlink():raise ValueError('current 不是管理的版本链接')
        release=self.l.current.resolve(strict=True)
        if release.parent!=self.l.base/'releases':raise ValueError('current 指向管理范围外')
        return release

    def fetch(self, repo, branch):
        repository(repo);branch_name(branch)
        release=self.l.base/'releases'/uuid.uuid4().hex
        try:
            self.run(['git','-c','core.hooksPath=/dev/null','clone','--depth','1','--single-branch','--branch',branch,'--',repo,release],env=os.environ|{'GIT_TERMINAL_PROMPT':'0'})
            check_source(release)
            # Reuse the release verifier before preparing or activating the downloaded release.
            self.run([sys.executable,'-B',release/'deploy/vps/release.py','verify','--root',release])
            # Runtime source is immutable and has no repository credentials or hooks.
            commit=self.run(['git','-C',release,'rev-parse','HEAD'],capture_output=True,text=True).stdout.strip()
            shutil.rmtree(release/'.git')
            return release,commit
        except BaseException:
            if release.exists() and not release.is_symlink():shutil.rmtree(release)
            raise

    def prepare(self, release, python):
        self.run([python,'-c','import sys; assert sys.version_info >= (3,12), "Python 3.12+ required"'])
        self.run([python,'-m','venv',release/'.venv'])
        self.run([release/'.venv/bin/python','-m','pip','install','--disable-pip-version-check','--no-cache-dir','-r',release/'deploy/shared/requirements/requirements-vps.lock'])
        (release/'data').symlink_to(self.l.data,target_is_directory=True)
        (release/'transfer-data').symlink_to(self.l.base/'transfer-data',target_is_directory=True)

    def db(self, release, mode):
        # Reset and init both reuse the native schema, lock and admin prompt.
        env=['env','-i','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','PYTHONUTF8=1','PYTHONDONTWRITEBYTECODE=1',f'TEACHER_CONFIG={self.l.config}/storage.toml']
        prefix=['runuser','-u',USER,'--',*env,release/'.venv/bin/python']
        if mode=='update':self.run([*prefix,'-m','backend.cli','migrate'],cwd=release)
        if mode=='reset':self.run([*prefix,'-m','backend.cli','reset-data','--include-transfer'],cwd=release)
        self.run([*prefix,release/'deploy/shared/launcher.py','init','--ready','--no-browser'],cwd=release)

    def healthy(self):
        state=self.load();port=port_number(state.get('port',8003))
        # Connect locally, but preserve the configured production Host. The app
        # intentionally validates Host on ALL routes, including /health/ready.
        url=f'http://127.0.0.1:{port}/health/ready'
        request=Request(url,headers={'Host':hostname(state['domain']),'Accept':'application/json'})
        opener=build_opener(ProxyHandler({}))
        last='尚未响应 / No response'
        for attempt in range(60):
            try:
                with opener.open(request,timeout=1) as r:
                    if r.status==200:
                        try:data=json.loads(r.read(4097))
                        except (ValueError,UnicodeDecodeError):data={}
                        if isinstance(data,dict) and data.get('status')=='ok' and data.get('schema')=='academic-cms-native':return
                        raise RuntimeError('健康接口返回了非预期内容，请核对端口对应的服务 / Unexpected health response; check the service bound to this port')
                    last='HTTP '+str(r.status)
            except HTTPError as exc:
                last='HTTP '+str(exc.code);exc.close()
                if exc.code in (400,401,403,404):
                    raise RuntimeError(f'健康检查 {last}；本地端口 {port}，Host={state["domain"]}。请核对 tweb paths 与 teacher-site.env 的 TEACHER_ORIGIN / Verify configured domain and port') from None
            except URLError as exc:last=str(exc.reason)
            except OSError as exc:last=str(exc)
            if attempt in (0,19,39):
                print(color(f'等待服务就绪 / Waiting: {url}; Host={state["domain"]}; {last}','33'),flush=True)
            time.sleep(.5)
        raise RuntimeError(f'健康检查失败 / Health check failed: {url}; Host={state["domain"]}; {last}。检查 tweb logs；若无应用日志，执行 sudo journalctl -u teacher-site.service -n 80 --no-pager')

    def start(self):
        self.run(['systemctl','start',SERVICE])
        self.step('检查网站健康状态 / Check website health',self.healthy)

    def restart(self):
        self.run(['systemctl','stop',SERVICE]);self.refresh_logging(self.load());self.start()
        print(color('[跳过 / SKIP] 防火墙 / Firewall — 规则未变，无需重启 / Rules unchanged; no restart needed','33'),flush=True)
        print(color('[跳过 / SKIP] nginx/Caddy — 配置未变，无需重启 / Configuration unchanged; no restart needed','33'),flush=True)

    def generate(self, release, state):
        # Existing shared renderer keeps service and bounded HTTP defaults consistent.
        output=self.l.config/'generated'
        if output.exists():shutil.rmtree(output)
        self.run([release/'.venv/bin/python','-m','deploy.vps.release','render','--output',output,'--base',self.l.base,'--python',self.l.current/'.venv/bin/python','--teacher-domain',state['domain'],'--port',str(state.get('port',8003))],cwd=release)
        storage=f'''[storage]
data_dir = "{self.l.data}"
database_path = "{self.l.data}/database/site.sqlite3"
cache_dir = "{self.l.data}/cache"
media_dir = "{self.l.data}/media"
# Legacy source only; active transfer records are in main.sqlite3.
transfer_database_path = "{self.l.data}/legacy-transfer.sqlite3"
transfer_media_dir = "{self.l.base}/transfer-data/files"
transfer_cache_dir = "{self.l.base}/transfer-data/cache"
'''
        write(self.l.config/'storage.toml',storage,0o640)
        write(self.l.config/'teacher-site.env',f'TEACHER_CONFIG={self.l.config}/storage.toml\nTEACHER_ORIGIN=https://{state["domain"]}\nTEACHER_ASSET_MODE=local\nPYTHONDONTWRITEBYTECODE=1\n',0o640)
        unit=(output/SERVICE).read_text().replace('/etc/teacher-site',str(self.l.config)).replace('/var/lib/teacher-site',str(self.l.data)).replace(f'{self.l.base}/data',str(self.l.data))
        unit=unit.replace(f'{self.l.base}/current/transfer-data',f'{self.l.base}/transfer-data')
        write(output/SERVICE,unit)
        write(self.l.unit,unit)
        state['owned_files'][str(self.l.unit)]=hashlib.sha256(self.l.unit.read_bytes()).hexdigest();self.save(state)
        # All paths the account can write are outside root-owned code/config files.
        self.run(['chown',f'root:{USER}',self.l.config,self.l.config/'storage.toml',self.l.config/'teacher-site.env'])
        self.l.config.chmod(0o750)
        nginx=f'''# HTTPS snippet: include INSIDE an existing TLS server for {state['domain']}.
# Configure listen 443 ssl and valid certificates in that server; do not publish HTTP login.
# Forward full paths; transfer and website use this same upstream.
location / {{
    proxy_pass http://127.0.0.1:{state.get('port',8003)};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    # File sizes/quota are governed by the existing application settings.
    client_max_body_size 0;
}}
'''
        write(output/'nginx-location.conf',nginx)
        # Proxy all static assets too: avoids granting nginx/caddy filesystem access.
        write(output/'Caddyfile.fragment',f'''{state['domain']} {{
    encode zstd gzip
    reverse_proxy 127.0.0.1:{state.get('port',8003)} {{
        flush_interval 10ms
    }}
}}
''')
        self.run(['systemctl','daemon-reload'])

    def install(self,args):
        repository(args.repo);branch_name(args.branch);hostname(args.domain)
        port=port_number(getattr(args,'port',8003))
        # Preflight every destination before claiming anything. Do not adopt existing users.
        for p in (self.l.base,self.l.config,self.l.data):
            no_symlinks(p)
            if p.exists() and (not p.is_dir() or any(p.iterdir())):raise ValueError('目标非空: '+str(p))
        for p in (self.l.command,self.l.unit):
            no_symlinks(p)
            if p.exists():raise ValueError('入口已存在，拒绝覆盖: '+str(p))
        loaded=self.run(['systemctl','show','--property=LoadState','--value',SERVICE],capture_output=True,text=True).stdout.strip()
        if loaded!='not-found':raise ValueError('系统已存在同名服务，拒绝覆盖')
        try:pwd.getpwnam(USER)
        except KeyError:pass
        else:raise ValueError('teacher-site 用户已存在，拒绝接管')
        self.run([args.python,'-c','import sys; assert sys.version_info >= (3,12), "Python 3.12+ required"'])
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
        state={'format':1,'port':port,'repo':args.repo,'branch':args.branch,'domain':args.domain,'python':args.python,'user_created':False,'phase':'preparing','owned_files':{}}
        for p in (self.l.base,self.l.config,self.l.data):claim(p)
        self.save(state)
        # Install manager early so failed/interrupted setup can be cleanly uninstalled.
        write(self.l.base/'tweb.py',Path(__file__).read_text())
        self.write_command(state)
        try:
            self.run(['useradd','--system','--user-group','--home-dir',self.l.data,'--no-create-home','--shell','/usr/sbin/nologin',USER])
            state['user_created']=True;self.save(state)
            (self.l.base/'releases').mkdir()
            for p in (self.l.data/'cache',self.l.data/'media',self.l.base/'transfer-data/files',self.l.base/'transfer-data/cache'):p.mkdir(parents=True)
            self.run(['chown','-R',f'{USER}:{USER}',self.l.data,self.l.base/'transfer-data'])
            self.l.data.chmod(0o700);(self.l.base/'transfer-data').chmod(0o700)
            release,commit=self.fetch(args.repo,args.branch)
            self.prepare(release,args.python);self.switch(release)
            self.generate(release,state)
            state['owned_files'][str(self.l.unit)]=hashlib.sha256(self.l.unit.read_bytes()).hexdigest();self.save(state)
            self.db(release,'init')
            self.permissions()
            self.run(['systemctl','enable',SERVICE]);self.start()
            state.update(phase='ready',commit=commit);self.save(state)
            print('安装完成。应用健康检查通过；公网 HTTPS 需按 tweb proxy 输出接入。')
            self.paths(state)
        except BaseException:
            print('安装未完成。已保留管理入口；修复后可 tweb db-init / start，或 tweb uninstall 完全清理。',file=sys.stderr)
            raise

    def update(self,args):
        if args.scope in ('source','frontend'):return self.update_source(args)
        if args.scope=='dependencies':return self.dependencies()
        if args.scope=='database':return self.database(update=True)
        if args.scope=='config':return self.configure()
        if self.load().get('phase')=='source-removed':return self.restore_source(args)
        state=self.load();previous_state=json.loads(json.dumps(state));old=self.release()
        repo=repository(args.repo or state['repo']);branch=branch_name(args.branch or state['branch'])
        if args.reset:confirm('RESET',args.confirm)
        if args.scope=='frontend' and args.reset:raise ValueError('前台局部更新不能同时重置数据库')
        release,commit=self.fetch(repo,branch)
        previous_unit=self.l.unit.read_text()
        stopped=False;switched=False;was_active=self.active()
        try:
            if args.scope=='frontend' and protected_digest(old)!=protected_digest(release):raise ValueError('后端、数据库或部署代码发生变化；请使用 update --scope all')
            self.prepare(release,state['python'])
            self.run(['systemctl','stop',SERVICE]);stopped=True
            self.db(release,'reset' if args.reset else 'init')
            self.switch(release);switched=True
            self.refresh_logging(state)
            if was_active:self.start()
            state.update(repo=repo,branch=branch,commit=commit,phase='ready');self.save(state)
            write(self.l.base/'tweb.py',(release/'deploy/linux/tweb.py').read_text())
            self.write_command(state)
        except BaseException:
            if args.reset and stopped:
                # The old schema may no longer match. Keep the new code stopped for repair.
                if not switched:self.switch(release)
                self.run(['systemctl','stop',SERVICE])
                state.update(repo=repo,branch=branch,commit=commit,phase='reset-failed');self.save(state)
                print('重置后的启动失败，服务保持停止；使用 tweb db-init / start 修复。',file=sys.stderr)
            else:
                if switched:
                    self.run(['systemctl','stop',SERVICE]);self.switch(old)
                    write(self.l.unit,previous_unit)
                    self.run(['systemctl','daemon-reload'])
                self.save(previous_state)
                if stopped and was_active:self.start()
                if release.exists():shutil.rmtree(release)
            raise
        # No backups: cleanup after committing a healthy release, outside rollback handling.
        shutil.rmtree(old)
        print('更新完成: '+args.scope+' '+commit)

    def check_unit(self,state):
        no_symlinks(self.l.unit)
        if hashlib.sha256(self.l.unit.read_bytes()).hexdigest()!=state['owned_files'].get(str(self.l.unit)):
            raise ValueError('服务文件已被外部修改 / Service file was modified externally')

    def data_paths(self):
        """Only the managed default layout is eligible for destructive operations."""
        import tomllib
        self.load();config=self.l.config/'storage.toml';no_symlinks(config)
        values=tomllib.loads(config.read_text())['storage']
        paths={'data_dir':self.l.data,'database_path':self.l.data/'database/site.sqlite3',
               'media_dir':self.l.data/'media','cache_dir':self.l.data/'cache',
               'transfer_media_dir':self.l.base/'transfer-data/files','transfer_cache_dir':self.l.base/'transfer-data/cache'}
        for key,path in paths.items():
            no_symlinks(path)
            if values.get(key)!=str(path):raise ValueError('非默认数据路径，拒绝自动删除/修复 / Custom storage path: '+key)
        return paths

    def permissions(self,repair=False):
        """Test actual service-account access; never grant public write permissions."""
        paths=self.data_paths();release=self.release()
        for name in ('storage.toml','teacher-site.env'):no_symlinks(self.l.config/name)
        directories=[self.l.data,self.l.data/'database',paths['media_dir'],paths['cache_dir'],self.l.data/'logs',
                     self.l.base/'transfer-data',paths['transfer_media_dir'],paths['transfer_cache_dir']]
        for path in directories:
            no_symlinks(path)
        if repair:
            was_active=self.active();self.run(['systemctl','stop',SERVICE])
            for path in directories:
                path.mkdir(parents=True,exist_ok=True);path.chmod(0o700)
            # Do not follow links inside writable user-data directories.
            account=pwd.getpwnam(USER)
            for root in (self.l.data,self.l.base/'transfer-data'):
                for parent,dirs,files in os.walk(root,followlinks=False):
                    for path in [Path(parent),*[Path(parent)/n for n in dirs+files]]:
                        if path.is_symlink():continue
                        os.chown(path,account.pw_uid,account.pw_gid)
                        path.chmod(0o700 if path.is_dir() else 0o600)
            self.run(['chown',f'root:{USER}',self.l.config,self.l.config/'storage.toml',self.l.config/'teacher-site.env'])
            self.l.config.chmod(0o750)
            for name in ('storage.toml','teacher-site.env'):(self.l.config/name).chmod(0o640)
        # Creation/removal, not just os.access(), verifies ACL and effective identity.
        code='import pathlib,tempfile,os,sys\nfor n in sys.argv[1:]:\n p=pathlib.Path(n);p.mkdir(parents=True,exist_ok=True)\n fd,name=tempfile.mkstemp(prefix=".tweb-check-",dir=p);os.close(fd);os.unlink(name)\n'
        self.run(['runuser','-u',USER,'--',release/'.venv/bin/python','-c',code,*directories])
        self.run(['runuser','-u',USER,'--',release/'.venv/bin/python','-c',
                  'import pathlib,sys;[pathlib.Path(p).open("rb").close() for p in sys.argv[1:]]',
                  release/'backend/entrypoints/vps.py',self.l.config/'storage.toml',self.l.config/'teacher-site.env'])
        if paths['database_path'].exists():
            self.run(['runuser','-u',USER,'--',release/'.venv/bin/python','-c',
                      'import os,sys;fd=os.open(sys.argv[1],os.O_RDWR|os.O_NOFOLLOW);os.close(fd)',paths['database_path']])
        if repair and was_active:self.start()
        print(color('读写权限检查通过 / Service read/write checks passed','32'))

    def dependencies(self):
        self.load();release=self.release();was_active=self.active()
        self.run(['systemctl','stop',SERVICE])
        # Updating in place is deliberate: no extra virtual environments or backups.
        # On failure keep the service stopped; re-running retries the same lock file.
        self.run([release/'.venv/bin/python','-m','pip','install','--disable-pip-version-check','--no-cache-dir',
                  '-r',release/'deploy/shared/requirements/requirements-vps.lock'])
        if was_active:self.start()
        print(color('依赖同步完成 / Dependencies synchronized','32'))

    def update_source(self,args):
        if args.reset:raise ValueError('局部更新不能重置数据库 / Partial update cannot reset the database')
        state=self.load();old=self.release()
        repo=repository(args.repo or state['repo']);branch=branch_name(args.branch or state['branch'])
        fresh,commit=self.fetch(repo,branch);stopped=False
        try:
            names=('database','deploy/shared/requirements','pyproject.toml')
            if args.scope=='frontend':names=('backend','database','transfer','deploy','pyproject.toml')
            if protected_digest(old,names)!=protected_digest(fresh,names):
                raise ValueError('后端/结构/依赖不兼容，请整站更新 / Incompatible schema or dependencies; use --scope all')
            was_active=self.active();self.run(['systemctl','stop',SERVICE]);stopped=True
            # Keep the installed venv at its original path; console-script shebangs stay valid.
            # Only canonical source objects are replaced. Runtime paths are never traversed.
            names=['frontend'] if args.scope=='frontend' else [p.name for p in fresh.iterdir()]
            for name in names:
                if name in ('data','transfer-data','.venv','.git'):raise ValueError('源码包含运行目录 / Source contains runtime paths')
                target=old/name;no_symlinks(target)
                if target.is_dir():shutil.rmtree(target)
                else:target.unlink(missing_ok=True)
                source=fresh/name
                if source.is_dir():shutil.copytree(source,target)
                else:shutil.copy2(source,target)
            # Regenerate the inventory for a deliberate mixed frontend-only release.
            self.run([old/'.venv/bin/python','-B','-m','deploy.vps.release','manifest','--root',old,'--refresh'],cwd=old)
            if args.scope=='source':
                write(self.l.base/'tweb.py',(old/'deploy/linux/tweb.py').read_text());self.write_command(state)
            if was_active:self.start()
            state.update(repo=repo,branch=branch,phase='ready')
            state['frontend_commit' if args.scope=='frontend' else 'commit']=commit;self.save(state)
        except BaseException:
            if stopped:
                self.run(['systemctl','stop',SERVICE]);state['phase']='partial-update-failed';self.save(state)
                print('局部更新失败，服务保持停止；重试或整站更新 / Partial update failed; service remains stopped',file=sys.stderr)
            raise
        finally:
            if fresh.exists():shutil.rmtree(fresh)
        print(color('更新完成 / Updated: '+args.scope+' '+commit,'32'))

    def configure(self,port=None):
        state=self.load();self.check_unit(state)
        current=port_number(state.get('port',8003));port=current if port is None else port_number(port)
        if port!=current:
            with socket.socket() as sock:sock.bind(('127.0.0.1',port))
        paths=[self.l.unit,self.l.config/'generated'/SERVICE,self.l.config/'generated/Caddyfile.fragment',self.l.config/'generated/nginx-location.conf']
        saved={}
        for path in paths:
            no_symlinks(path);saved[path]=path.read_text() if path.exists() else None
        unit,n=re.subn(r'--port\s+\d+',f'--port {port}',saved[self.l.unit])
        if n!=1:raise ValueError('无法识别服务端口 / Cannot identify service port')
        before=dict(state);before['owned_files']=dict(state['owned_files']);was_active=self.active()
        self.run(['systemctl','stop',SERVICE])
        try:
            write(self.l.unit,unit);write(paths[1],unit)
            write(paths[2],f"{state['domain']} {{\n    encode zstd gzip\n    reverse_proxy 127.0.0.1:{port} {{\n        flush_interval 10ms\n    }}\n}}\n")
            # Reuse the existing nginx template while refreshing only its upstream port.
            if saved[paths[3]] is None:raise ValueError('缺少 nginx 示例 / Missing nginx template')
            write(paths[3],re.sub(r'127\.0\.0\.1:\d+',f'127.0.0.1:{port}',saved[paths[3]]))
            state['port']=port;state['owned_files'][str(self.l.unit)]=hashlib.sha256(self.l.unit.read_bytes()).hexdigest();self.save(state)
            self.run(['systemctl','daemon-reload'])
            if was_active:self.start()
        except BaseException:
            self.run(['systemctl','stop',SERVICE])
            for path,text in saved.items():
                if text is None:path.unlink(missing_ok=True)
                else:write(path,text)
            self.save(before);self.run(['systemctl','daemon-reload'])
            if was_active:self.start()
            raise
        print(color(f'应用端口 / Application port: {port}','32'))
        print('请同步外部代理配置并检查后重载 / Update and reload your external proxy: tweb proxy')

    def restore_source(self,args):
        if args.reset:raise ValueError('先恢复源码，再单独重建数据库 / Restore source before resetting data')
        state=self.load();repo=repository(args.repo or state['repo']);branch=branch_name(args.branch or state['branch'])
        fresh,commit=self.fetch(repo,branch)
        try:
            self.prepare(fresh,state['python']);self.db(fresh,'init');self.switch(fresh)
            self.refresh_logging(state)
            state.update(repo=repo,branch=branch,commit=commit,phase='ready');self.save(state)
            write(self.l.base/'tweb.py',(fresh/'deploy/linux/tweb.py').read_text())
        except BaseException:
            if not self.l.current.is_symlink() and fresh.exists():shutil.rmtree(fresh)
            raise
        print(color('源码已恢复，使用 tweb start 启动 / Source restored; run tweb start','32'))

    def remove(self,scope,supplied=None):
        if scope=='all':return self.uninstall(supplied)
        state=self.load();self.check_unit(state);paths=self.data_paths()
        targets={'cache':[paths['cache_dir'],paths['transfer_cache_dir']],
                 'logs':[self.l.data/'logs',self.l.data/'service.log'],
                 'media':[paths['media_dir']], 'transfer':[paths['transfer_media_dir'],paths['transfer_cache_dir']],
                 'database':[paths['database_path'].parent], 'source':[self.l.base/'releases']}
        if scope not in targets:raise ValueError('无效删除范围 / Invalid removal scope')
        selected=targets[scope]
        for path in selected:no_symlinks(path)
        heading('删除范围 / Removal targets')
        for path in selected:print(str(path))
        print('媒体/快传文件删除后，已有引用不可用；数据库删除将清除所有账号和条目。 / File references may break; database removal erases all accounts and records.')
        confirm('DELETE-'+scope.upper(),supplied)
        was_active=self.active();self.run(['systemctl','stop',SERVICE])
        # Keep the service stopped on any filesystem failure.
        for path in selected:
            if path.is_dir():shutil.rmtree(path)
            else:path.unlink(missing_ok=True)
            if path.name!='service.log':
                path.mkdir(parents=True,exist_ok=True);path.chmod(0o755 if scope=='source' else 0o700)
                if scope!='source':self.run(['chown',f'{USER}:{USER}',path])
        if scope=='source':
            self.l.current.unlink(missing_ok=True);state['phase']='source-removed';self.save(state)
            print('保留数据、配置和 tweb；使用 update --scope all 恢复 / Data retained; restore with update --scope all')
        elif scope=='database':
            state['phase']='database-removed';self.save(state)
            print('服务保持停止；运行 tweb db-init 后 tweb start / Service stopped; run db-init then start')
        elif was_active:self.start()
        print(color('删除完成 / Removed: '+scope,'32'))

    def database(self,reset=False,supplied=None,update=False):
        self.load();release=self.release()
        if reset:confirm('RESET',supplied)
        was_active=self.active();self.run(['systemctl','stop',SERVICE])
        # Failure deliberately leaves the service stopped, never live with an empty account set.
        self.db(release,'reset' if reset else ('update' if update else 'init'))
        if was_active:self.start()
        state=self.load();state['phase']='ready';self.save(state)
        print('数据库重建完成；磁盘媒体保留。' if reset else '数据库初始化/结构核验完成。')

    def uninstall(self,supplied=None):
        state=self.load()
        heading('完整卸载范围 / Complete uninstall targets')
        for path in (self.l.base,self.l.config,self.l.unit,self.l.command):print(str(path))
        confirm('DELETE',supplied)
        # Refuse altered external files before stopping service or removing anything.
        for name,digest in state['owned_files'].items():
            p=Path(name)
            if p not in (self.l.command,self.l.unit):raise ValueError('无效卸载清单')
            no_symlinks(p)
            if p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise ValueError('管理文件已修改，未删除: '+name)
        self.run(['systemctl','disable','--now',SERVICE]) if self.l.unit.exists() else None
        for name in state['owned_files']:Path(name).unlink(missing_ok=True)
        self.run(['systemctl','daemon-reload'])
        if state['user_created']:
            self.run(['userdel',USER])
            import grp
            try:grp.getgrnam(USER)
            except KeyError:pass
            else:self.run(['groupdel',USER])
        for p in (self.l.data,self.l.config,self.l.base):owned(p);shutil.rmtree(p)
        print('已删除本工具管理的源码、依赖、数据库、媒体、快传缓存、配置、服务及命令。系统共用软件/日志、外部代理配置不删除。')

    def refresh_logging(self,state):
        """Upgrade only the owned service command; preserve storage/env/proxy settings."""
        text=self.l.unit.read_text()
        if hashlib.sha256(self.l.unit.read_bytes()).hexdigest()!=state['owned_files'].get(str(self.l.unit)):
            raise ValueError('服务配置已被外部修改，请核对后再更新日志入口')
        if '-m uvicorn backend.entrypoints.vps:app' in text:
            text=text.replace('-m uvicorn backend.entrypoints.vps:app','-m deploy.shared.service backend.entrypoints.vps:app').replace(' --workers 1','').replace(' --timeout-keep-alive 5 --no-access-log','')
        elif '-m deploy.shared.service backend.entrypoints.vps:app' not in text:
            raise ValueError('无法识别服务启动入口')
        text='\n'.join(line for line in text.split('\n') if line not in (f'StandardOutput=append:{self.l.data}/service.log',f'StandardError=append:{self.l.data}/service.log'))
        write(self.l.unit,text)
        state['owned_files'][str(self.l.unit)]=hashlib.sha256(self.l.unit.read_bytes()).hexdigest();self.save(state)
        self.run(['systemctl','daemon-reload'])

    def paths(self,state=None):
        state=state or self.load()
        print(json.dumps({'website':'https://'+state['domain'],'admin':'https://'+state['domain']+'/admin','transfer':'https://'+state['domain']+'/transfer','repository':state['repo'],'branch':state['branch'],'phase':state['phase'],'application_port':state.get('port',8003),'code':str(self.l.current),'config':str(self.l.config),'database':str(self.l.data/'database/site.sqlite3'),'media':str(self.l.data/'media'),'transfer_files':str(self.l.base/'transfer-data'),'logs':str(self.l.data/'logs/service.log'),'service':str(self.l.unit),'command':str(self.l.command)},ensure_ascii=False,indent=2))

    def doctor(self):
        self.paths()
        commands=[['systemctl','status','--no-pager',SERVICE],['ss','-ltn'],['ufw','status','verbose'],['firewall-cmd','--state'],['nft','list','ruleset'],['iptables','-S'],['nginx','-t'],['caddy','version']]
        for command in commands:
            if not shutil.which(command[0]):print(command[0]+': 未安装');continue
            print('\n$ '+' '.join(command),flush=True)
            subprocess.run(command,check=False,timeout=20)
        print('检查云平台安全组；公网只开放实际 SSH 端口与 TCP 80/443，不开放内部应用端口。此命令未修改防火墙或代理。')

    def proxy(self):
        self.load()
        for name in ('Caddyfile.fragment','nginx-location.conf'):
            p=self.l.config/'generated'/name
            print('\n# '+str(p)+'\n'+p.read_text())
        print('任选一个代理。Caddy: 合并片段后 caddy validate --config /etc/caddy/Caddyfile，再 systemctl reload caddy。')
        print('Nginx: 配置域名的 TLS server/certificate，包含 location 片段；nginx -t 后 systemctl reload nginx。')
        print('不自动改写已有代理、防火墙或证书。域名 DNS 应指向本机；云安全组允许 80/443。')


# Both languages are displayed together; no separate locale state is needed.
MENU = [
 ('status','服务状态 / Status','查看网站运行状态 / Inspect service state'),
 ('start','启动 / Start','启动教师网站与快传 / Start website and transfer'),
 ('stop','停止 / Stop','停止服务，不删除文件 / Stop without deleting data'),
 ('restart','重启 / Restart','重新载入网站进程 / Reload the website process'),
 ('logs','运行日志 / Logs','持续查看，Ctrl+C 结束 / Follow logs; Ctrl+C to exit'),
 ('update','分项更新 / Update','选择源码、依赖、数据库或配置 / Choose update scope'),
 ('port','修改端口 / Port','修改内部端口及代理示例 / Change internal port and proxy examples'),
 ('db-init','初始化数据库 / Initialize database','空库创建管理员；已有库核验 / Create admin for empty database; verify existing'),
 ('db-reset','重建数据库 / Reset database','清空记录后创建新站 / Erase records and initialize a new site'),
 ('cleanup-preview','预览到期清理 / Preview cleanup','查看下一批候选，不删除 / Preview next batch without deletion'),
 ('cleanup-run','执行到期清理 / Run cleanup','按保留策略处理一批 / Process one batch using retention rules'),
 ('cleanup-status','清理状态 / Cleanup status','查看最近清理结果 / Show last cleanup result'),
 ('permissions','权限检查与修复 / Permissions','检查服务账号读写权限 / Check service-account access'),
 ('doctor','环境诊断 / Diagnostics','检查端口、防火墙与代理 / Inspect ports, firewall and proxy'),
 ('paths','文件与网址 / Paths and URLs','查看目录与访问地址 / Show directories and URLs'),
 ('proxy','代理示例 / Proxy examples','查看 nginx / Caddy 配置 / Show nginx / Caddy snippets'),
 ('remove','分项删除 / Remove','选择文件类别或完整卸载 / Choose data category or uninstall'),
]
UPDATE_MENU = [
 ('all','整站更新 / Full update','源码、锁定依赖和数据库核验 / Source, locked dependencies and DB verification'),
 ('source','仅源码 / Source only','不装依赖、不改数据库；不兼容则拒绝 / Preserve dependencies and DB; reject incompatibility'),
 ('frontend','仅界面资源 / Frontend only','替换模板、CSS、JS；后台代码须兼容 / Templates, CSS, JS; backend must match'),
 ('dependencies','仅依赖 / Dependencies only','按当前源码锁文件同步 / Synchronize installed lock file'),
 ('database','仅数据库 / Database only','核验/升级已支持结构；不下载源码 / Verify or upgrade supported schema; no source download'),
 ('config','仅部署配置 / Deployment config','刷新受管服务与代理示例 / Refresh managed service and proxy examples'),
]
REMOVE_MENU = [
 ('cache','清空缓存 / Clear caches','主站及快传缓存，保留数据库译文 / Keep database and stored translations'),
 ('logs','清空运行日志 / Clear logs','仅本站文件日志，不清系统日志 / Website file logs only'),
 ('media','删除媒体文件 / Delete media','图片/PDF等原文件；数据库引用仍保留 / Originals removed; DB references remain'),
 ('transfer','删除快传文件 / Delete transfer files','所有暂存文件和缓存；任务记录保留 / Payloads/cache removed; task records remain'),
 ('database','删除数据库 / Delete database','全部账号和记录；停服等待初始化 / All accounts/records; remain stopped'),
 ('source','删除源码与依赖 / Delete source and dependencies','保留数据、配置和 tweb 便于重装 / Retain data, config and manager'),
 ('all','完整卸载 / Uninstall all','删除本站全部受管文件及服务账号 / Remove all managed website files and account'),
]


def choose(title,entries):
    heading(title)
    for n,(_,label,description) in enumerate(entries,1):
        print(color(f'{n:2}. ','33')+label+'\n    '+color(description,'2'))
    print(color(' 0. 退出 / Exit','2'))
    choice=input('选择编号 / Number [0]: ').strip()
    if choice in ('','0'):return None
    if not choice.isdigit() or not 1<=int(choice)<=len(entries):raise ValueError('无效选择 / Invalid selection')
    return entries[int(choice)-1][0]


def parser():
    p=argparse.ArgumentParser(description='教师网站管理 / Teacher website manager; no command opens menu')
    sub=p.add_subparsers(dest='action')
    install=sub.add_parser('install');install.add_argument('--repo',default=DEFAULT_REPOSITORY);install.add_argument('--branch',default=DEFAULT_BRANCH);install.add_argument('--domain',required=True);install.add_argument('--python',default='/usr/bin/python3');install.add_argument('--port',type=port_number,default=8003)
    update=sub.add_parser('update');update.add_argument('--repo');update.add_argument('--branch');update.add_argument('--scope',choices=tuple(x[0] for x in UPDATE_MENU),default='all');update.add_argument('--reset',action='store_true');update.add_argument('--confirm')
    for name in ('db-reset','uninstall'):sub.add_parser(name).add_argument('--confirm')
    remove=sub.add_parser('remove');remove.add_argument('--scope',choices=tuple(x[0] for x in REMOVE_MENU),required=True);remove.add_argument('--confirm')
    port=sub.add_parser('port');port.add_argument('number',type=port_number,nargs='?')
    permissions=sub.add_parser('permissions');permissions.add_argument('--repair',action='store_true')
    for name in ('start','stop','restart','status','logs','db-init','db-update','doctor','paths','proxy','cleanup-preview','cleanup-run','cleanup-status'):sub.add_parser(name)
    return p


def execute(a):
    if os.geteuid()!=0:raise ValueError('需要管理权限，请运行 sudo tweb / Administrator required: sudo tweb')
    if not Path('/run/systemd/system').is_dir():raise ValueError('需要运行 systemd 的 Ubuntu/Debian 主机 / A running systemd host is required')
    os_release=Path('/etc/os-release').read_text()
    if not re.search(r'^ID=(?:"?)(ubuntu|debian)(?:"?)$',os_release,re.M):raise ValueError('仅支持 Ubuntu/Debian / Ubuntu or Debian required')
    os.umask(0o022)
    with open('/run/lock/teacher-site-manager.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        m=Manager()
        if a.action=='install':m.install(a)
        elif a.action=='update':
            if a.scope not in ('all','source','frontend') and (a.repo or a.branch or a.reset or a.confirm):
                raise ValueError('该模式不接受仓库、分支或重置参数 / This scope does not accept repository or reset options')
            m.update(a)
        elif a.action=='remove':m.remove(a.scope,a.confirm)
        elif a.action=='port':
            if a.number is None:
                if not sys.stdin.isatty():raise ValueError('请指定端口 / Specify a port')
                current=m.load().get('port',8003)
                a.number=port_number(input(f'应用端口 / Application port [{current}]: ').strip() or str(current))
            m.configure(a.number)
        elif a.action=='permissions':m.permissions(a.repair)
        elif a.action in ('db-init','db-update','db-reset'):m.database(a.action=='db-reset',getattr(a,'confirm',None),a.action=='db-update')
        elif a.action=='uninstall':m.uninstall(a.confirm)
        elif a.action.startswith('cleanup-'):
            m.load()
            m.run(['runuser','-u',USER,'--','env','-i','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','PYTHONUTF8=1','PYTHONDONTWRITEBYTECODE=1',f'TEACHER_CONFIG={m.l.config}/storage.toml',m.release()/'.venv/bin/python','-m','backend.cli',a.action],cwd=m.release())
        elif a.action in ('paths','doctor','proxy'):getattr(m,a.action)()
        else:
            m.load()
            if a.action=='logs':m.run(['tail','-n','100','-F',m.l.data/'logs/service.log'])
            elif a.action=='start':m.start()
            elif a.action=='restart':m.restart()
            else:m.run(['systemctl',a.action,'--no-pager',SERVICE])
    if a.action=='uninstall' or (a.action=='remove' and a.scope=='all'):
        Path('/run/lock/teacher-site-manager.lock').unlink(missing_ok=True)
    return 0


def perform(a):
    label=next((label for key,label,_ in MENU if key==a.action),a.action)
    if getattr(a,'scope',None):label+=' — '+a.scope
    started=time.monotonic();heading('开始执行 / Executing: '+label)
    try:result=execute(a)
    except BaseException:
        print(color('执行失败或中断，管理菜单已结束 / Failed or interrupted; menu closed','31'),flush=True)
        raise
    print(color(f'执行完成，管理菜单已结束 / Completed; menu closed ({time.monotonic()-started:.1f}s)','32'),flush=True)
    return result or 0


def main(argv=None):
    p=parser();a=p.parse_args(argv)
    # Older tweb wrappers used /usr/bin/python3 even when the app was installed
    # with a newer interpreter. Recover using the root-owned installation state.
    if sys.version_info<(3,12):
        interpreter=Manager().load()['python']
        run([interpreter,'-c','import sys; assert sys.version_info >= (3,12), "Python 3.12+ required"'])
        os.execvp(interpreter,[interpreter,str(Path(__file__).resolve()),*(sys.argv[1:] if argv is None else argv)])
    heading('教师网站管理 / Teacher Website Manager')
    if a.action:return perform(a)
    if not sys.stdin.isatty():p.print_help();return 0
    try:
        action=choose('管理菜单 / Management menu',MENU)
        if action is None:return 0
        args=[action]
        if action in ('update','remove'):
            scope=choose('更新范围 / Update scope' if action=='update' else '删除范围 / Removal scope',UPDATE_MENU if action=='update' else REMOVE_MENU)
            if scope is None:return 0
            args+=['--scope',scope]
        if action=='permissions':
            mode=choose('权限操作 / Permissions',[('check','检查 / Check','实际读写探测 / Actual access probe'),('repair','修复 / Repair','恢复受管数据目录权限 / Restore managed data permissions')])
            if mode is None:return 0
            if mode=='repair':args+=['--repair']
    except EOFError:return 0
    return perform(p.parse_args(args))

if __name__=='__main__':
    try:raise SystemExit(main())
    except KeyboardInterrupt:raise SystemExit(130)
    except Exception as exc:print(color('tweb: '+str(exc),'31'),file=sys.stderr);raise SystemExit(1)
