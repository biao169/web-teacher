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
import shutil
import socket
import subprocess
import sys
import time
import uuid
from urllib.request import build_opener, ProxyHandler

DEFAULT_REPOSITORY = 'https://github.com/biao169/web-teacher.git'
DEFAULT_BRANCH = 'web-py'

MARKER = 'teacher-site-managed-v1\n'
SERVICE = 'teacher-site.service'
USER = 'teacher-site'

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
        raise ValueError('仓库必须是无凭据的 GitHub HTTPS 地址，例如 https://github.com/biao169/web-teacher.git')
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

def chmod_tree(root, dir_mode, file_mode):
    if not root.exists(): return
    for path in (root, *root.rglob('*')):
        if path.is_symlink(): continue
        if path.is_dir(): path.chmod(dir_mode)
        elif path.is_file(): path.chmod(0o755 if path.stat().st_mode & 0o111 else file_mode)


def confirm(token, supplied):
    if supplied==token:return
    if supplied is not None:raise ValueError('确认文本不匹配')
    if not sys.stdin.isatty():raise ValueError('需要终端确认或 --confirm '+token)
    if input('不可撤销，请输入 '+token+' 确认: ').strip()!=token:raise ValueError('已取消')


def check_source(path):
    required=('pyproject.toml','database/schema.sql','backend/entrypoints/vps.py','deploy/linux/tweb.py','deploy/shared/launcher.py','deploy/shared/requirements/requirements-vps.lock','deploy/vps/release.py','release-manifest.json')
    if not all((path/n).is_file() for n in required):raise ValueError('仓库根目录不是完整教师网站源码')
    # Git symlinks must not escape the downloaded release, including pip lock includes.
    for p in path.rglob('*'):
        if '.git' in p.relative_to(path).parts:continue
        if p.is_symlink():raise ValueError('源码包不能包含符号链接: '+str(p.relative_to(path)))
    if any((path/name).exists() for name in ('data','transfer-data')):raise ValueError('源码包含运行数据 data/transfer-data')


def protected_digest(root):
    result={}
    for name in ('backend','database','transfer','deploy','pyproject.toml'):
        p=root/name
        for f in ([p] if p.is_file() else p.rglob('*')):
            if f.is_file() and not any(x in ('__pycache__','.venv','node_modules') for x in f.relative_to(root).parts):
                result[f.relative_to(root).as_posix()]=hashlib.sha256(f.read_bytes()).hexdigest()
    return result


class Manager:
    def __init__(self, layout=Layout(), runner=run):self.l=layout;self.run=runner

    def load(self):
        for p in (self.l.base,self.l.config,self.l.data):owned(p)
        no_symlinks(self.l.state)
        state=json.loads(self.l.state.read_text())
        repository(state['repo']);branch_name(state['branch']);hostname(state['domain'])
        return state

    def save(self,state):write(self.l.state,json.dumps(state,ensure_ascii=False,indent=2)+'\n',0o600)

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

    def fix_permissions(self, release=None):
        for p in (self.l.base,self.l.data,self.l.config): owned(p)
        (self.l.base/'releases').mkdir(exist_ok=True)
        for p in (self.l.data/'database',self.l.data/'cache',self.l.data/'media',self.l.base/'transfer-data/files',self.l.base/'transfer-data/cache'):
            p.mkdir(parents=True,exist_ok=True)
        self.run(['chown','-R',f'{USER}:{USER}',self.l.data,self.l.base/'transfer-data'])
        chmod_tree(self.l.data,0o700,0o600);chmod_tree(self.l.base/'transfer-data',0o700,0o600)
        for p in (self.l.config,self.l.config/'storage.toml',self.l.config/'teacher-site.env'):
            if p.exists(): self.run(['chown',f'root:{USER}',p])
        if self.l.config.exists(): self.l.config.chmod(0o750)
        for p in (self.l.config/'storage.toml',self.l.config/'teacher-site.env'):
            if p.exists(): p.chmod(0o640)
        if release is None and self.l.current.is_symlink(): release=self.release()
        if release is not None and release.exists(): chmod_tree(release,0o755,0o644)

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
        self.fix_permissions(release)
        env=['env','-i','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','PYTHONUTF8=1','PYTHONDONTWRITEBYTECODE=1',f'TEACHER_CONFIG={self.l.config}/storage.toml']
        prefix=['runuser','-u',USER,'--',*env,release/'.venv/bin/python']
        if mode=='reset':self.run([*prefix,'-m','backend.cli','reset-data','--include-transfer'],cwd=release)
        self.run([*prefix,release/'deploy/shared/launcher.py','init','--ready','--no-browser'],cwd=release)

    def healthy(self):
        opener=build_opener(ProxyHandler({}))
        for _ in range(60):
            try:
                with opener.open('http://127.0.0.1:8003/health/ready',timeout=1) as r:
                    if r.status==200:return
            except OSError:pass
            time.sleep(.5)
        raise RuntimeError('健康检查失败；使用 tweb logs 检查')

    def start(self):
        self.fix_permissions()
        self.run(['systemctl','start',SERVICE]);self.healthy()

    def generate(self, release, state):
        # Existing shared renderer keeps service and bounded HTTP defaults consistent.
        output=self.l.config/'generated'
        if output.exists():shutil.rmtree(output)
        self.run([release/'.venv/bin/python','-m','deploy.vps.release','render','--output',output,'--base',self.l.base,'--python',self.l.current/'.venv/bin/python','--teacher-domain',state['domain']],cwd=release)
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
        unit=unit.replace('Restart=on-failure',f'StandardOutput=append:{self.l.data}/service.log\nStandardError=append:{self.l.data}/service.log\nRestart=on-failure')
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
    proxy_pass http://127.0.0.1:8003;
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
    reverse_proxy 127.0.0.1:8003 {{
        flush_interval 10ms
    }}
}}
''')
        self.run(['systemctl','daemon-reload'])

    def install(self,args):
        repository(args.repo);branch_name(args.branch);hostname(args.domain)
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
        with socket.socket() as sock:sock.bind(('127.0.0.1',8003))
        state={'format':1,'repo':args.repo,'branch':args.branch,'domain':args.domain,'python':args.python,'user_created':False,'phase':'preparing','owned_files':{}}
        for p in (self.l.base,self.l.config,self.l.data):claim(p)
        self.save(state)
        # Install manager early so failed/interrupted setup can be cleanly uninstalled.
        write(self.l.base/'tweb.py',Path(__file__).read_text())
        write(self.l.command,f'#!/bin/sh\n# Teacher website manager\nexec /usr/bin/python3 {self.l.base}/tweb.py "$@"\n',0o755)
        state['owned_files'][str(self.l.command)]=hashlib.sha256(self.l.command.read_bytes()).hexdigest();self.save(state)
        try:
            self.run(['useradd','--system','--user-group','--home-dir',self.l.data,'--no-create-home','--shell','/usr/sbin/nologin',USER])
            state['user_created']=True;self.save(state)
            (self.l.base/'releases').mkdir()
            release,commit=self.fetch(args.repo,args.branch)
            self.prepare(release,args.python);self.switch(release)
            self.generate(release,state)
            state['owned_files'][str(self.l.unit)]=hashlib.sha256(self.l.unit.read_bytes()).hexdigest();self.save(state)
            self.db(release,'init')
            self.run(['systemctl','enable',SERVICE]);self.start()
            state.update(phase='ready',commit=commit);self.save(state)
            print('安装完成。应用健康检查通过；公网 HTTPS 需按 tweb proxy 输出接入。')
            self.paths(state)
        except BaseException:
            print('安装未完成。已保留管理入口；修复后可 tweb db-init / start，或 tweb uninstall 完全清理。',file=sys.stderr)
            raise

    def update(self,args):
        state=self.load();previous_state=json.loads(json.dumps(state));old=self.release()
        repo=repository(args.repo or state['repo']);branch=branch_name(args.branch or state['branch'])
        if args.reset:confirm('RESET',args.confirm)
        if args.scope=='frontend' and args.reset:raise ValueError('前台局部更新不能同时重置数据库')
        release,commit=self.fetch(repo,branch)
        stopped=False;switched=False;was_active=self.active()
        try:
            if args.scope=='frontend' and protected_digest(old)!=protected_digest(release):raise ValueError('后端、数据库或部署代码发生变化；请使用 update --scope all')
            self.prepare(release,state['python'])
            self.run(['systemctl','stop',SERVICE]);stopped=True
            self.db(release,'reset' if args.reset else 'init')
            self.switch(release);switched=True
            if was_active:self.start()
            state.update(repo=repo,branch=branch,commit=commit,phase='ready');self.save(state)
            write(self.l.base/'tweb.py',(release/'deploy/linux/tweb.py').read_text())
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
                self.save(previous_state)
                if stopped and was_active:self.start()
                if release.exists():shutil.rmtree(release)
            raise
        # No backups: cleanup after committing a healthy release, outside rollback handling.
        shutil.rmtree(old)
        print('更新完成: '+args.scope+' '+commit)

    def database(self,reset=False,supplied=None):
        self.load();release=self.release()
        if reset:confirm('RESET',supplied)
        was_active=self.active();self.run(['systemctl','stop',SERVICE])
        # Failure deliberately leaves the service stopped, never live with an empty account set.
        self.db(release,'reset' if reset else 'init')
        if was_active:self.start()
        print('数据库重建完成；磁盘媒体保留。' if reset else '数据库初始化/结构核验完成。')

    def uninstall(self,supplied=None):
        state=self.load();confirm('DELETE',supplied)
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

    def paths(self,state=None):
        state=state or self.load()
        print(json.dumps({'website':'https://'+state['domain'],'admin':'https://'+state['domain']+'/admin','transfer':'https://'+state['domain']+'/transfer','repository':state['repo'],'branch':state['branch'],'phase':state['phase'],'code':str(self.l.current),'config':str(self.l.config),'database':str(self.l.data/'database/site.sqlite3'),'media':str(self.l.data/'media'),'transfer_files':str(self.l.base/'transfer-data'),'logs':str(self.l.data/'service.log'),'service':str(self.l.unit),'command':str(self.l.command)},ensure_ascii=False,indent=2))

    def doctor(self):
        self.paths()
        commands=[['systemctl','status','--no-pager',SERVICE],['ss','-ltn'],['ufw','status','verbose'],['firewall-cmd','--state'],['nft','list','ruleset'],['iptables','-S'],['nginx','-t'],['caddy','version']]
        for command in commands:
            if not shutil.which(command[0]):print(command[0]+': 未安装');continue
            print('\n$ '+' '.join(command),flush=True)
            subprocess.run(command,check=False,timeout=20)
        print('检查云平台安全组；公网只开放实际 SSH 端口与 TCP 80/443，不开放 8003。此命令未修改防火墙或代理。')

    def proxy(self):
        self.load()
        for name in ('Caddyfile.fragment','nginx-location.conf'):
            p=self.l.config/'generated'/name
            print('\n# '+str(p)+'\n'+p.read_text())
        print('任选一个代理。Caddy: 合并片段后 caddy validate --config /etc/caddy/Caddyfile，再 systemctl reload caddy。')
        print('Nginx: 配置域名的 TLS server/certificate，包含 location 片段；nginx -t 后 systemctl reload nginx。')
        print('不自动改写已有代理、防火墙或证书。域名 DNS 应指向本机；云安全组允许 80/443。')


def parser():
    p=argparse.ArgumentParser(description='教师网站管理；不带命令显示菜单')
    sub=p.add_subparsers(dest='action')
    install=sub.add_parser('install');install.add_argument('--repo',default=DEFAULT_REPOSITORY,help='默认：'+DEFAULT_REPOSITORY);install.add_argument('--branch',default=DEFAULT_BRANCH,help='默认：'+DEFAULT_BRANCH);install.add_argument('--domain',required=True);install.add_argument('--python',default='/usr/bin/python3')
    update=sub.add_parser('update');update.add_argument('--repo');update.add_argument('--branch');update.add_argument('--scope',choices=('all','frontend'),default='all');update.add_argument('--reset',action='store_true');update.add_argument('--confirm')
    for name in ('db-reset','uninstall'):sub.add_parser(name).add_argument('--confirm')
    for name in ('start','stop','restart','status','logs','db-init','db-update','doctor','paths','proxy'):sub.add_parser(name)
    return p


def main(argv=None):
    p=parser();a=p.parse_args(argv)
    if not a.action:
        if not sys.stdin.isatty():p.print_help();return 0
        choices=['status','start','stop','restart','logs','update','db-init','db-reset','doctor','paths','proxy','uninstall']
        print('\n'.join(f'{i+1}. {name}' for i,name in enumerate(choices)))
        choice=input('选择编号（回车退出）: ').strip()
        if not choice:return 0
        if not choice.isdigit() or not 1<=int(choice)<=len(choices):raise ValueError('无效选择')
        a=p.parse_args([choices[int(choice)-1]])
    if os.geteuid()!=0:raise ValueError('请使用 sudo tweb '+a.action)
    if not Path('/run/systemd/system').is_dir():raise ValueError('需要运行 systemd 的 Ubuntu/Debian 主机')
    os_release=Path('/etc/os-release').read_text()
    if not re.search(r'^ID=(?:"?)(ubuntu|debian)(?:"?)$',os_release,re.M):raise ValueError('仅支持 Ubuntu/Debian')
    # Predictable public code traversal, explicit restrictive modes for state/data.
    os.umask(0o022)
    # Serialize all management, including reset/uninstall, across concurrent terminals.
    with open('/run/lock/teacher-site-manager.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        m=Manager()
        if a.action=='install':m.install(a)
        elif a.action=='update':m.update(a)
        elif a.action in ('db-init','db-update','db-reset'):m.database(a.action=='db-reset',getattr(a,'confirm',None))
        elif a.action=='uninstall':m.uninstall(a.confirm)
        elif a.action in ('paths','doctor','proxy'):getattr(m,a.action)()
        else:
            m.load()
            if a.action=='logs':m.run(['tail','-n','100','-F',m.l.data/'service.log'])
            elif a.action=='start':m.start()
            elif a.action=='restart':m.run(['systemctl','stop',SERVICE]);m.start()
            else:m.run(['systemctl',a.action,'--no-pager',SERVICE])
    return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except KeyboardInterrupt:raise SystemExit(130)
    except Exception as exc:print('tweb: '+str(exc),file=sys.stderr);raise SystemExit(1)
