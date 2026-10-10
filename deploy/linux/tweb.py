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
PIP_SOURCES = {'tuna':'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple','pypi':'https://pypi.org/simple'}
DEFAULT_PIP_SOURCE = 'tuna'

MARKER = 'teacher-site-managed-v1\n'
SERVICE = 'teacher-site.service'
USER = 'teacher-site'
MULTI_LAYOUT_VERSION = 1


def site_origins(state, value=None):
    """Standalone manager validation; no dependency on installed application packages."""
    from urllib.parse import urlsplit
    value=state.get('allowed_origins','') if value is None else value
    if not isinstance(value,str) or len(value)>4096:raise ValueError('Invalid allowed origins')
    result=['https://'+hostname(state['domain'])]
    for item in re.split(r'[,\s]+',value.strip()) if value.strip() else []:
        if not item or re.search(r'[\s\\%*]',item):raise ValueError('Invalid allowed origin')
        p=urlsplit(item)
        if p.scheme!='https' or p.username is not None or p.password is not None or p.path not in ('','/') or p.query or p.fragment or '?' in item or '#' in item or p.port not in (None,443):
            raise ValueError('Allowed origins must be HTTPS root addresses on port 443')
        origin='https://'+hostname(p.hostname or '')
        if origin not in result:result.append(origin)
    if len(result)>32:raise ValueError('At most 32 allowed origins')
    return ','.join(result)


def site_domains(state):
    return [value.removeprefix('https://') for value in site_origins(state).split(',')]


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
    instance: str = ''
    user: str = USER

    @property
    def current(self): return self.base / 'current'
    @property
    def state(self): return self.config / 'install.json'


def layout_identity(layout):
    return {'instance':layout.instance,'base':str(layout.base),'command':layout.command.name}


def layout_arguments(layout):
    if not layout.instance:return []
    return ['--instance',layout.instance,'--base',str(layout.base),'--command',layout.command.name]


def instance_layout(instance,base=None,command=None):
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,18}',instance):
        raise ValueError('实例名须为小写字母开头，最多19位字母、数字、连字符')
    command=command or instance
    if not re.fullmatch(r'[a-z][a-z0-9_-]{0,30}',command) or command in ('sudo','sh','bash','python','python3','caddy','nginx','systemctl','test','true','false','echo','cd','exit','exec','eval','export','read','alias','set','source'):
        raise ValueError('管理关键字无效或为保留命令 / Invalid management command')
    base=base or ('/opt/teacher-site' if command=='tweb' else '/opt/teacher-site-'+instance)
    if not re.fullmatch(r'/(?:opt|srv)/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*',str(base)):
        raise ValueError('目录须为 /opt 或 /srv 下的独立目录，仅支持字母、数字、下划线、连字符')
    layout=Layout(base=Path(base),config=Path('/etc/teacher-site-'+instance),data=Path(base)/'data',
                  unit=Path('/etc/systemd/system/teacher-site-'+instance+'.service'),
                  command=Path('/usr/local/bin')/command,instance=instance,user='teacher-'+instance)
    no_symlinks(layout.base)
    # Forbid nesting inside, or enclosing, an existing managed instance.
    roots=[Path('/opt/teacher-site')]
    for marker in Path('/etc').glob('teacher-site*/.tweb-instance.json'):
        no_symlinks(marker)
        try:roots.append(Path(json.loads(marker.read_text())['base']))
        except (ValueError,KeyError):raise ValueError('实例标记损坏，请先人工核对: '+str(marker))
    for parent in layout.base.parents:
        if (parent/'.tweb-owned').exists() or (parent/'.tweb-instance.json').exists():
            raise ValueError('不能在已有实例内部安装另一个实例')
    for other in roots:
        if other!=layout.base and (other in layout.base.parents or layout.base in other.parents):
            raise ValueError('实例目录不可相互嵌套: '+str(other))
    return layout


def argument_layout(args):
    if not args.instance:
        if args.base or args.command_name:raise ValueError('--base/--command 需要 --instance')
        return Layout()
    return instance_layout(args.instance,args.base,args.command_name)


def check_identity(layout,recovery=False):
    if not layout.instance:return
    expected=layout_identity(layout);found=False
    for folder in (layout.base,layout.config):
        marker=folder/'.tweb-instance.json';no_symlinks(marker)
        if marker.exists():
            if json.loads(marker.read_text())!=expected:raise ValueError('实例身份不匹配 / Instance identity mismatch: '+str(folder))
            found=True
    if recovery:
        # Arbitrary user-selected directories must never inherit legacy cleanup rules.
        for folder in (layout.base,layout.config):
            if folder.exists() and any(folder.iterdir()):
                marker=folder/'.tweb-instance.json'
                state=layout.state
                evidence=marker.exists()
                if not evidence and state.is_file():
                    no_symlinks(state)
                    evidence=json.loads(state.read_text()).get('layout')==expected
                if not evidence:raise ValueError('无法确认目录属于本站，不自动删除；请选择新目录: '+str(folder))
    if not found and not recovery:raise ValueError('缺少实例身份文件，请通过安装入口修复')


def check_port(port):
    port=port_number(port)
    try:
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
    except OSError as exc:raise ValueError(f'端口 {port} 已被占用或不可用 / Port unavailable') from exc
    return port


def choose_port(port=8003):
    while True:
        try:return check_port(port)
        except ValueError:
            suggestion=next((p for p in range(port+1,min(port+101,65536)) if port_available(p)),None)
            if not sys.stdin.isatty():raise
            if suggestion is None:raise ValueError('附近没有可用端口，请指定 --port')
            print(color(f'端口 {port} 已被占用 / Port occupied','33'))
            port=port_number(input(f'应用端口 / Application port [{suggestion}]: ').strip() or suggestion)


def port_available(port):
    try:check_port(port);return True
    except ValueError:return False


def command_available(layout):
    existing=shutil.which(layout.command.name)
    if existing and Path(existing)!=layout.command:raise ValueError('关键字与现有命令冲突: '+existing)
    no_symlinks(layout.command)
    if layout.command.exists():
        check_identity(layout,recovery=True)
        text=layout.command.read_text()
        if str(layout.base/'tweb.py') not in text or '--instance '+layout.instance not in text:
            raise ValueError('管理关键字已被占用，请选择其他名称: '+str(layout.command))


def suggest_base(base):
    n=2
    while Path(str(base)+'-'+str(n)).exists():n+=1
    return str(base)+'-'+str(n)


def select_install_layout(args):
    interactive=sys.stdin.isatty()
    command=args.command_name or (input('管理关键字 / Management command [tweb]: ').strip() if interactive else '') or 'tweb'
    instance=args.instance or command.replace('_','-')
    base=args.base or ('/opt/teacher-site' if command=='tweb' else '/opt/teacher-site-'+instance)
    if interactive and not args.base:
        base=input(f'安装目录 / Installation directory [{base}]: ').strip() or base
    while True:
        layout=instance_layout(instance,base,command)
        try:command_available(layout)
        except ValueError as exc:
            if not interactive:raise
            print(color(str(exc),'33'))
            command=input('输入新的管理关键字 / New command [Enter = exit]: ').strip()
            if not command:raise ValueError('已取消 / Cancelled')
            instance=command.replace('_','-')
            base=args.base or '/opt/teacher-site-'+instance
            continue
        m=Manager(layout);paths,account,group,loaded=m.remnants()
        nonempty=any(p.is_file() or p.is_symlink() or (p.is_dir() and any(p.iterdir())) for p in paths)
        if not (nonempty or account or group or loaded):break
        if not interactive:raise ValueError('已有目录或实例；请交互选择新目录、恢复或重装')
        print(color('发现已有文件 / Existing files: '+str(layout.base),'33'))
        suggestion=suggest_base(layout.base)
        print(f'1. 使用新目录 / New directory [{suggestion}]\n2. 删除本实例后重装 / Delete instance and reinstall\n3. 修复或续装（保留数据） / Repair or resume\n0. 退出 / Exit')
        choice=input('选择 / Choice [0]: ').strip()
        if choice=='1':
            base=input(f'新目录 / New directory [{suggestion}]: ').strip() or suggestion
            # A live instance keeps its namespace; the new one needs another command/service.
            if layout.config.exists() or layout.command.exists() or account or group or loaded:
                command=input('新实例管理关键字 / New command [Enter = exit]: ').strip()
                if not command:raise ValueError('已取消 / Cancelled')
                instance=command.replace('_','-')
            continue
        if choice=='2':m.clean_remnants();break
        if choice=='3':
            m.recovery_guard(account,group)
            args.action='resume-install' if account is not None and layout.state.is_file() and json.loads(layout.state.read_text()).get('phase')=='preparing' and not layout.current.is_symlink() and not layout.unit.exists() else 'repair'
            break
        raise ValueError('已取消 / Cancelled')
    if args.action=='install':
        if interactive:
            args.port=port_number(input(f'应用端口 / Application port [{args.port}]: ').strip() or args.port)
        args.port=choose_port(args.port)
    args.instance=instance;args.base=str(layout.base);args.command_name=command
    return layout


def run(argv, **kwargs):
    kwargs.setdefault('check',True)
    return subprocess.run([str(x) for x in argv], **kwargs)


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


# Only prepackaged media may be imported from a release's data directory.
SEED_EXTENSIONS={'.jpg','.jpeg','.png','.gif','.webp','.avif','.bmp','.ico','.svg','.mp4','.webm','.mov','.mp3','.wav','.ogg','.m4a','.pdf'}

def seed_media(source):
    """Validate all source seeds before any copy; database/cache/credentials stay forbidden."""
    result={};root=source/'data';transfer=source/'transfer-data'
    for folder in (root,transfer):
        if folder.is_symlink():raise ValueError('预置数据目录不能为符号链接')
        if folder.exists() and not folder.is_dir():raise ValueError('预置 data/transfer-data 必须是目录')
    if transfer.exists():
        for p in transfer.rglob('*'):
            if p.is_symlink() or (p.is_file() and not (p.name=='.gitkeep' and p.stat().st_size==0)):
                raise ValueError('不能随源码分发快传运行数据；预置媒体请放 data/media/')
    if not root.exists():return []
    total=0
    for p in sorted(root.rglob('*')):
        rel=p.relative_to(root)
        if p.is_symlink():raise ValueError('预置媒体不能包含符号链接: '+str(rel))
        if p.is_dir():continue
        if not p.is_file():raise ValueError('预置媒体必须为普通文件: '+str(rel))
        if p.name=='.gitkeep' and p.stat().st_size==0:continue
        # Accept legacy data/photo.jpg as well as recommended data/media/photo.jpg.
        target=Path(*rel.parts[1:]) if rel.parts[0]=='media' else rel
        if rel.parts[0] in ('database','cache','logs','tmp','backups') or any(x.startswith('.') for x in target.parts) or p.suffix.lower() not in SEED_EXTENSIONS:
            raise ValueError('data 中仅允许预置媒体，不能包含数据库、缓存或配置: '+str(rel))
        size=p.stat().st_size;total+=size
        if size>512*1024*1024 or total>2*1024*1024*1024:raise ValueError('预置媒体超出单文件512MiB/合计2GiB，请安装后上传')
        key=target.as_posix()
        if key in result:raise ValueError('预置媒体目标路径重复: '+key)
        result[key]=(p,target)
    return list(result.values())

def file_digest(path):
    value=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1048576),b''):value.update(block)
    return value.digest()

def import_seed_media(source,destination):
    """Add only missing files, preserve existing bytes, and remain safe to retry."""
    files=seed_media(source);no_symlinks(destination)
    for original,rel in files:
        target=destination/rel;no_symlinks(target)
        if target.exists() and (not target.is_file() or file_digest(target)!=file_digest(original)):
            raise ValueError('预置媒体与现有文件冲突，未覆盖: '+str(rel))
        for parent in target.parents:
            if parent==destination.parent:break
            if parent.exists() and not parent.is_dir():raise ValueError('媒体目录与现有文件冲突: '+str(rel))
    created=[]
    for original,rel in files:
        target=destination/rel
        if target.exists():continue
        target.parent.mkdir(parents=True,exist_ok=True)
        temp=target.with_name('.seed-'+uuid.uuid4().hex)
        try:
            with original.open('rb') as src,temp.open('xb') as dst:shutil.copyfileobj(src,dst,1048576)
            temp.chmod(0o640)
            # link fails if an upload won the race; never overwrite a live file.
            try:os.link(temp,target)
            except FileExistsError:
                if not target.is_file() or file_digest(target)!=file_digest(original):raise ValueError('媒体导入期间文件已变化: '+str(rel))
            else:created.append(target)
        finally:temp.unlink(missing_ok=True)
    # Runtime paths will be replaced by the installer's existing persistent-data links.
    for name in ('data','transfer-data'):
        if (source/name).exists():shutil.rmtree(source/name)
    return created


def check_source(path):
    required=('pyproject.toml','database/schema.sql','backend/entrypoints/vps.py','deploy/linux/tweb.py','deploy/shared/launcher.py','deploy/shared/requirements/requirements-vps.lock','deploy/vps/release.py')
    missing=[n for n in required if not (path/n).is_file()]
    if missing:raise ValueError('缺少必要部署入口 / Missing deployment entry: '+', '.join(missing))
    # Git symlinks must not escape the downloaded release, including pip lock includes.
    for p in path.rglob('*'):
        if '.git' in p.relative_to(path).parts:continue
        if p.is_symlink():raise ValueError('源码包不能包含符号链接: '+str(p.relative_to(path)))
    seed_media(path)


def protected_digest(root,names=('backend','database','transfer','site_sync','deploy','pyproject.toml')):
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
        self.service=layout.unit.name if layout.instance else SERVICE;self.user=layout.user

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
        elif 'deploy.vps.release' in args or any(a.endswith('/release.py') for a in args):label='生成部署配置 / Generate deployment configuration'
        elif program=='runuser':label='验证服务账号访问权限 / Verify service-account access'
        elif program in ('chown','useradd','userdel','groupdel'):label='更新受管账号或权限 / Update managed account or permissions: '+program
        elif program=='tail':label='跟踪运行日志（Ctrl+C 结束） / Follow logs (Ctrl+C to exit)'
        else:label='执行部署检查 / Run deployment check'
        return self.step(label,self.runner,argv,**kwargs)

    def load(self):
        for p in (self.l.base,self.l.config,self.l.data):owned(p)
        no_symlinks(self.l.state)
        state=json.loads(self.l.state.read_text())
        check_identity(self.l)
        port_number(state.get('port',8003))
        repository(state['repo']);branch_name(state['branch']);hostname(state['domain'])
        return state

    def save(self,state):
        if self.l.instance:state['layout']=layout_identity(self.l)
        write(self.l.state,json.dumps(state,ensure_ascii=False,indent=2)+'\n',0o600)

    def write_command(self,state):
        no_symlinks(self.l.command)
        self.l.command.parent.mkdir(parents=True,exist_ok=True)
        if self.l.command.exists() and hashlib.sha256(self.l.command.read_bytes()).hexdigest()!=state['owned_files'].get(str(self.l.command)):
            raise ValueError('tweb 入口已被外部修改 / Manager entry was modified externally')
        command=shlex.join([state['python'],str(self.l.base/'tweb.py'),*layout_arguments(self.l)])+' "$@"'
        write(self.l.command,'#!/bin/sh\n# Teacher website manager; sudo may request your OS password.\n'
              'if [ "$(id -u)" -ne 0 ]; then exec sudo -- '+command+'; fi\nexec '+command+'\n',0o755)
        state['owned_files'][str(self.l.command)]=hashlib.sha256(self.l.command.read_bytes()).hexdigest();self.save(state)

    def active(self):
        return subprocess.run(['systemctl','is-active','--quiet',self.service],check=False).returncode==0

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
            if self.l.instance and 'MULTI_LAYOUT_VERSION = 1' not in (release/'deploy/linux/tweb.py').read_text():
                raise ValueError('目标分支缺少多实例管理支持；请先上传部署补丁 / Upload multi-instance patch first')
            print(color('跳过源码完整性校验 / Source integrity verification skipped','33'))
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
        self.install_dependencies(release)
        self.import_media(release)
        (release/'data').symlink_to(self.l.data,target_is_directory=True)
        (release/'transfer-data').symlink_to(self.l.base/'transfer-data',target_is_directory=True)

    def import_media(self,release):
        files=import_seed_media(release,self.l.data/'media')
        for path in files:
            self.run(['chown',f'{self.user}:{self.user}',path])
            parent=path.parent
            while parent!=self.l.data:
                self.run(['chown',f'{self.user}:{self.user}',parent]);parent.chmod(0o750);parent=parent.parent
        if files:print('预置媒体导入 / Seed media imported: '+str(len(files))+'；请在后台媒体目录核对中收录 / Register via media audit')

    def pip_source(self,value=None):
        state=self.load();selected=value or state.get('pip_source',DEFAULT_PIP_SOURCE)
        if selected not in PIP_SOURCES:raise ValueError('无效依赖源 / Invalid package source')
        if value is not None:state['pip_source']=selected;self.save(state)
        print('Python 依赖源 / Package source: '+selected+' — '+PIP_SOURCES[selected],flush=True)
        return PIP_SOURCES[selected]

    def install_dependencies(self,release):
        source=self.pip_source()
        # Match the successfully tested command without changing global pip config.
        # Preserve normal network proxies and an explicitly supplied CA bundle.
        env={k:v for k,v in os.environ.items() if not k.startswith('PIP_')}
        if os.environ.get('PIP_CERT'):env['PIP_CERT']=os.environ['PIP_CERT']
        env['PIP_CONFIG_FILE']=os.devnull
        self.run([release/'.venv/bin/python','-m','pip','install','--disable-pip-version-check','--no-cache-dir',
                  '--index-url',source,'--retries','2','--timeout','20',
                  '-r',release/'deploy/shared/requirements/requirements-vps.lock'],env=env)

    def db(self, release, mode):
        # Reset and init both reuse the native schema, lock and admin prompt.
        env=['env','-i','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','PYTHONUTF8=1','PYTHONDONTWRITEBYTECODE=1',f'TEACHER_CONFIG={self.l.config}/storage.toml']
        prefix=['runuser','-u',self.user,'--',*env,release/'.venv/bin/python']
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
        if self.l.instance and not self.active():check_port(self.load().get('port',8003))
        self.run(['systemctl','start',self.service])
        self.step('检查网站健康状态 / Check website health',self.healthy)

    def restart(self):
        self.run(['systemctl','stop',self.service]);self.refresh_logging(self.load());self.start()
        print(color('[跳过 / SKIP] 防火墙 / Firewall — 规则未变，无需重启 / Rules unchanged; no restart needed','33'),flush=True)
        print(color('[跳过 / SKIP] nginx/Caddy — 配置未变，无需重启 / Configuration unchanged; no restart needed','33'),flush=True)

    def generate(self, release, state):
        # Existing shared renderer keeps service and bounded HTTP defaults consistent.
        output=self.l.config/'generated'
        if output.exists():shutil.rmtree(output)
        self.run([release/'.venv/bin/python','-m','deploy.vps.release','render','--output',output,'--base',self.l.base,'--python',self.l.current/'.venv/bin/python','--teacher-domain',state['domain'],'--allowed-origins',site_origins(state),'--port',str(state.get('port',8003)),*(['--service-name',self.service,'--service-user',self.user,'--config-dir',str(self.l.config)] if self.l.instance else [])],cwd=release)
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
        preserved_keys=('TEACHER_SYNC_KEY','SYNC_HISTORY_DAYS','TEACHER_PUBLIC_CACHE_TTL_SECONDS','TEACHER_PUBLIC_STREAM_CONCURRENCY','TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS','TEACHER_PUBLIC_NAV_PREFETCH_CONCURRENCY','TEACHER_PUBLIC_CACHE_MB')
        preserved_env=''.join(line+'\n' for line in (self.l.config/'teacher-site.env').read_text().splitlines() if line.split('=',1)[0].strip() in preserved_keys) if (self.l.config/'teacher-site.env').exists() else ''
        write(self.l.config/'teacher-site.env',f'TEACHER_CONFIG={self.l.config}/storage.toml\nTEACHER_ORIGIN=https://{state["domain"]}\nTEACHER_ALLOWED_ORIGINS={site_origins(state)}\nTEACHER_ASSET_MODE=local\nPYTHONDONTWRITEBYTECODE=1\n'+preserved_env,0o640)
        unit=(output/self.service).read_text()
        if not self.l.instance:unit=unit.replace('/etc/teacher-site',str(self.l.config))
        unit=unit.replace('/var/lib/teacher-site',str(self.l.data)).replace(f'{self.l.base}/data',str(self.l.data))
        unit=unit.replace(f'{self.l.base}/current/transfer-data',f'{self.l.base}/transfer-data')
        write(output/self.service,unit)
        write(self.l.unit,unit)
        state['owned_files'][str(self.l.unit)]=hashlib.sha256(self.l.unit.read_bytes()).hexdigest();self.save(state)
        # All paths the account can write are outside root-owned code/config files.
        self.run(['chown',f'root:{self.user}',self.l.config,self.l.config/'storage.toml',self.l.config/'teacher-site.env'])
        self.l.config.chmod(0o750)
        nginx=f'''# HTTPS snippet: include INSIDE an existing TLS server for {', '.join(site_domains(state))}.
# Configure listen 443 ssl and valid certificates in that server; do not publish HTTP login.
# Forward full paths; transfer and website use this same upstream.
server_name {' '.join(site_domains(state))};
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
        write(output/'Caddyfile.fragment',f'''{', '.join(site_domains(state))} {{
    encode zstd gzip
    reverse_proxy 127.0.0.1:{state.get('port',8003)} {{
        flush_interval 10ms
    }}
}}
''')
        self.run(['systemctl','daemon-reload'])

    def remnants(self):
        """Read-only discovery also works when install.json or ownership markers were removed."""
        paths=[p for p in (self.l.base,self.l.config,self.l.unit,self.l.command)
               if p.exists() or p.is_symlink()]
        import grp
        try:account=pwd.getpwnam(self.user)
        except KeyError:account=None
        try:group=grp.getgrnam(self.user)
        except KeyError:group=None
        loaded=self.run(['systemctl','show','--property=LoadState','--value',self.service],capture_output=True,text=True).stdout.strip()
        return paths,account,group,loaded not in ('','not-found')

    def recovery_guard(self,account,group):
        check_identity(self.l, recovery=True)
        # Never adopt a normal login account or delete an unrelated service/command.
        fragment=self.run(['systemctl','show','--property=FragmentPath','--value',self.service],capture_output=True,text=True).stdout.strip()
        if fragment not in ('','not-found') and Path(fragment)!=self.l.unit:
            raise ValueError('同名服务来自其他位置，未接管: '+fragment)
        if account and (account.pw_uid==0 or account.pw_dir!=str(self.l.data) or
                        account.pw_shell not in ('/usr/sbin/nologin','/sbin/nologin','/bin/false')):
            raise ValueError('同名账号不是本站专用账号；未接管 / Account identity mismatch')
        if group and (group.gr_mem or any(u.pw_gid==group.gr_gid and u.pw_name!=self.user for u in pwd.getpwall())):
            raise ValueError('同名组有额外成员，未删除 / Group has additional members')
        no_symlinks(self.l.config/'generated')
        for p in (self.l.base,self.l.config,self.l.data):
            no_symlinks(p)
            if p.exists() and not p.is_dir():raise ValueError('安装目录不是目录: '+str(p))
            if p.exists():
                for parent,dirs,_ in os.walk(p,followlinks=False):
                    if os.path.ismount(parent):raise ValueError('安装目录包含挂载点，未自动处理: '+parent)
                    for name in dirs:
                        if os.path.ismount(Path(parent)/name):raise ValueError('安装目录包含挂载点')
        for p,required in ((self.l.command,str(self.l.base/'tweb.py')),(self.l.unit,str(self.l.base/'current'))):
            no_symlinks(p)
            if p.exists() and (not p.is_file() or required not in p.read_text()):
                raise ValueError('入口或服务不属于本站，未覆盖: '+str(p))

    def clean_remnants(self,supplied=None):
        paths,account,group,loaded=self.remnants();self.recovery_guard(account,group)
        heading('将删除全部本站数据 / Delete ALL website data')
        for p in (self.l.base,self.l.config,self.l.unit,self.l.command):print(p)
        print('包括数据库、媒体、快传文件及专用账号；不删除共享软件或代理配置。')
        if self.l.instance and supplied is None:
            if not sys.stdin.isatty() or input('确认删除以上实例全部数据？ / Delete this instance? [y/N]: ').strip().lower()!='y':
                raise ValueError('已取消 / Cancelled')
        else:confirm('DELETE',supplied)
        if loaded or self.l.unit.exists():self.run(['systemctl','disable','--now',self.service])
        if account:
            probe=self.run(['pgrep','-u',str(account.pw_uid)],check=False,capture_output=True,text=True)
            if probe.returncode==0:raise ValueError('专用账号仍有进程，已停止清理，请检查 PID: '+probe.stdout.strip())
            if probe.returncode!=1:raise ValueError('无法确认账号进程状态，停止清理')
        # Remove the account before data, so a failed userdel cannot leave half-deleted data.
        if account:self.run(['userdel',self.user])
        import grp
        try:grp.getgrnam(self.user)
        except KeyError:pass
        else:self.run(['groupdel',self.user])
        self.l.unit.unlink(missing_ok=True);self.l.command.unlink(missing_ok=True)
        # systemctl disable normally removes this link; also cover manually deleted units.
        link=self.l.unit.parent/'multi-user.target.wants'/self.service
        if link.is_symlink() and link.resolve()==self.l.unit.resolve():link.unlink()
        for p in dict.fromkeys((self.l.data,self.l.config,self.l.base)):
            if p.exists():shutil.rmtree(p)
        self.run(['systemctl','daemon-reload'])
        self.run(['systemctl','reset-failed',self.service],check=False)
        print('本站残留清理完成 / Website remnants removed')

    def repair_install(self):
        """Fetch verified source, preserve storage/env, recover missing local deployment files."""
        paths,account,group,loaded=self.remnants();self.recovery_guard(account,group)
        no_symlinks(self.l.state)
        try:state=json.loads(self.l.state.read_text())
        except (FileNotFoundError,ValueError):
            raise ValueError('安装记录缺失或损坏，无法猜测原配置；请选择清理重装 / Missing installation state')
        repository(state['repo']);branch_name(state['branch']);hostname(state['domain']);port_number(state.get('port',8003))
        if not Path(state['python']).is_absolute():raise ValueError('解释器路径无效')
        import tomllib
        storage=self.l.config/'storage.toml';no_symlinks(storage)
        if storage.exists():
            values=tomllib.loads(storage.read_text())['storage']
            defaults={'data_dir':self.l.data,'database_path':self.l.data/'database/site.sqlite3',
                'cache_dir':self.l.data/'cache','media_dir':self.l.data/'media',
                'transfer_media_dir':self.l.base/'transfer-data/files','transfer_cache_dir':self.l.base/'transfer-data/cache'}
            if any(values.get(k)!=str(v) for k,v in defaults.items()):
                raise ValueError('非默认存储路径，需要按原配置人工修复；不会改写 / Custom storage paths')
        # Fetch and check deployment entry paths before stopping a working service.
        (self.l.base/'releases').mkdir(parents=True,exist_ok=True)
        release,commit=self.fetch(state['repo'],state['branch'])
        if loaded or self.l.unit.exists():self.run(['systemctl','stop',self.service])
        if account is None:
            if group:self.run(['useradd','--system','--gid',self.user,'--home-dir',self.l.data,'--no-create-home','--shell','/usr/sbin/nologin',self.user])
            else:self.run(['useradd','--system','--user-group','--home-dir',self.l.data,'--no-create-home','--shell','/usr/sbin/nologin',self.user])
        # Repair markers only after checking the layout and obtaining a valid state.
        for p in dict.fromkeys((self.l.base,self.l.config,self.l.data)):
            p.mkdir(parents=True,exist_ok=True)
            no_symlinks(p/'.tweb-owned');(p/'.tweb-owned').write_text(MARKER)
        state.setdefault('owned_files',{});state['user_created']=True;state['phase']='repairing';self.save(state)
        for p in (self.l.data/'media',self.l.data/'cache',self.l.base/'transfer-data/files',self.l.base/'transfer-data/cache'):
            no_symlinks(p);p.mkdir(parents=True,exist_ok=True)
        saved={}
        for name in ('storage.toml','teacher-site.env'):
            p=self.l.config/name;no_symlinks(p)
            if p.exists():saved[name]=p.read_text()
        self.prepare(release,state['python']);self.switch(release);self.generate(release,state)
        for name,value in saved.items():write(self.l.config/name,value,0o640)
        self.permissions(repair=True)
        # init is idempotent; never resets existing user/content data.
        self.db(release,'init');self.run(['systemctl','enable',self.service]);self.start()
        state.update(phase='ready',commit=commit);self.save(state)
        write(self.l.base/'tweb.py',(release/'deploy/linux/tweb.py').read_text())
        if self.l.command.exists():state['owned_files'][str(self.l.command)]=hashlib.sha256(self.l.command.read_bytes()).hexdigest()
        self.write_command(state)
        print('修复完成；已有数据库和媒体保留。被手动删除的数据无法凭空恢复 / Repair complete; deleted data cannot be recovered')

    def install_entry(self,args):
        paths,account,group,loaded=self.remnants()
        if not (paths or account or group or loaded):return self.install(args)
        heading('检测到旧安装或残留 / Existing installation or remnants')
        for p in paths:print(p)
        if account:print('账号 / Account: '+self.user)
        if group:print('用户组 / Group: '+self.user)
        if not sys.stdin.isatty():raise ValueError('请在交互终端选择修复或清理重装；不会自动删除数据')
        print('1. 修复/续装，保留已有数据 / Repair, preserve data')
        print('2. 彻底清理后重新安装 / Delete all website data and reinstall')
        choice=input('选择 / Choice [Enter = exit]: ').strip()
        if not choice:return
        if choice=='1':return self.repair_install()
        if choice=='2':self.clean_remnants();return self.install(args)
        raise ValueError('无效选项，已退出 / Invalid choice; exited')

    def install(self,args):
        repository(args.repo);branch_name(args.branch);hostname(args.domain)
        site_origins({'domain':args.domain},getattr(args,'allowed_origins',''))
        port=port_number(getattr(args,'port',8003))
        pip_source=getattr(args,'pip_source',DEFAULT_PIP_SOURCE)
        if pip_source not in PIP_SOURCES:raise ValueError('无效依赖源 / Invalid package source')
        # Preflight every destination before claiming anything. Do not adopt existing users.
        for p in (self.l.base,self.l.config,self.l.data):
            no_symlinks(p)
            if p.exists() and (not p.is_dir() or any(p.iterdir())):raise ValueError('目标非空: '+str(p))
        for p in (self.l.command,self.l.unit):
            no_symlinks(p)
            if p.exists():raise ValueError('入口已存在，拒绝覆盖: '+str(p))
        loaded=self.run(['systemctl','show','--property=LoadState','--value',self.service],capture_output=True,text=True).stdout.strip()
        if loaded!='not-found':raise ValueError('系统已存在同名服务，拒绝覆盖')
        try:pwd.getpwnam(self.user)
        except KeyError:pass
        else:raise ValueError('teacher-site 用户已存在，拒绝接管')
        self.run([args.python,'-c','import sys; assert sys.version_info >= (3,12), "Python 3.12+ required"'])
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
        state={'format':1,'port':port,'pip_source':pip_source,'repo':args.repo,'branch':args.branch,'domain':args.domain,'allowed_origins':site_origins({'domain':args.domain},getattr(args,'allowed_origins','')),'python':args.python,'user_created':False,'phase':'preparing','owned_files':{}}
        for p in (self.l.base,self.l.config,self.l.data):claim(p)
        if self.l.instance:
            for folder in (self.l.base,self.l.config):write(folder/'.tweb-instance.json',json.dumps(layout_identity(self.l)),0o600)
        self.save(state)
        # Install manager early so failed/interrupted setup can be cleanly uninstalled.
        write(self.l.base/'tweb.py',Path(__file__).read_text())
        self.write_command(state)
        try:
            self.run(['useradd','--system','--user-group','--home-dir',self.l.data,'--no-create-home','--shell','/usr/sbin/nologin',self.user])
            state['user_created']=True;self.save(state)
            (self.l.base/'releases').mkdir()
            for p in (self.l.data/'cache',self.l.data/'media',self.l.base/'transfer-data/files',self.l.base/'transfer-data/cache'):p.mkdir(parents=True)
            self.run(['chown','-R',f'{self.user}:{self.user}',self.l.data,self.l.base/'transfer-data'])
            self.l.data.chmod(0o700);(self.l.base/'transfer-data').chmod(0o700)
            release,commit=self.fetch(args.repo,args.branch)
            self.prepare(release,args.python);self.switch(release)
            self.generate(release,state)
            state['owned_files'][str(self.l.unit)]=hashlib.sha256(self.l.unit.read_bytes()).hexdigest();self.save(state)
            self.db(release,'init')
            self.permissions()
            self.run(['systemctl','enable',self.service]);self.start()
            state.update(phase='ready',commit=commit);self.save(state)
            print('安装完成。应用健康检查通过；公网 HTTPS 需按 tweb proxy 输出接入。')
            self.paths(state)
        except BaseException:
            print('安装未完成。下载/校验/依赖阶段失败且尚未建立 current 时可用新版管理脚本 resume-install；已建立 current 时使用日志诊断 / Install incomplete; resume-install supports the pre-activation dependency stage.',file=sys.stderr)
            raise

    def resume_install(self):
        """Resume the dependency-stage failure without discarding the user's installation."""
        state=self.load()
        if state.get('phase')!='preparing' or not state.get('user_created'):
            raise ValueError('不是可续装阶段 / Not a resumable installation stage')
        if self.l.current.exists() or self.l.current.is_symlink() or self.l.unit.exists() or self.l.unit.is_symlink():
            raise ValueError('已有当前版本或服务，拒绝覆盖 / Existing active release or unit; refusing overwrite')
        directory=self.l.base/'releases';no_symlinks(directory)
        candidates=list(directory.iterdir())
        if not candidates:
            release,commit=self.fetch(state['repo'],state['branch']);state['commit']=commit;self.save(state)
            candidates=[release]
        if len(candidates)!=1 or candidates[0].is_symlink() or not candidates[0].is_dir():
            raise ValueError('无法唯一确定失败的源码目录 / Cannot identify a single staged release')
        release=candidates[0]
        for name in ('data','transfer-data'):
            if (release/name).is_symlink():raise ValueError('暂存版本已有数据链接，需检查安装阶段 / Staged data links already exist')
        check_source(release)
        loaded=self.run(['systemctl','show','--property=LoadState','--value',self.service],capture_output=True,text=True).stdout.strip()
        if loaded!='not-found':raise ValueError('系统已存在同名服务，拒绝覆盖 / Existing service; refusing overwrite')
        print(color('跳过源码完整性校验 / Source integrity verification skipped','33'))
        self.prepare(release,state['python']);self.switch(release);self.generate(release,state)
        self.db(release,'init');self.permissions()
        self.run(['systemctl','enable',self.service]);self.start()
        state['owned_files'][str(self.l.unit)]=hashlib.sha256(self.l.unit.read_bytes()).hexdigest()
        state['phase']='ready';self.save(state)
        write(self.l.base/'tweb.py',(release/'deploy/linux/tweb.py').read_text());self.write_command(state)
        print(color('续装完成 / Installation resumed successfully','32'))

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
            self.run(['systemctl','stop',self.service]);stopped=True
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
                self.run(['systemctl','stop',self.service])
                state.update(repo=repo,branch=branch,commit=commit,phase='reset-failed');self.save(state)
                print('重置后的启动失败，服务保持停止；使用 tweb db-init / start 修复。',file=sys.stderr)
            else:
                if switched:
                    self.run(['systemctl','stop',self.service]);self.switch(old)
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
            was_active=self.active();self.run(['systemctl','stop',self.service])
            for path in directories:
                path.mkdir(parents=True,exist_ok=True);path.chmod(0o700)
            # Do not follow links inside writable user-data directories.
            account=pwd.getpwnam(self.user)
            for root in (self.l.data,self.l.base/'transfer-data'):
                for parent,dirs,files in os.walk(root,followlinks=False):
                    for path in [Path(parent),*[Path(parent)/n for n in dirs+files]]:
                        if path.is_symlink():continue
                        os.chown(path,account.pw_uid,account.pw_gid)
                        path.chmod(0o700 if path.is_dir() else 0o600)
            self.run(['chown',f'root:{self.user}',self.l.config,self.l.config/'storage.toml',self.l.config/'teacher-site.env'])
            self.l.config.chmod(0o750)
            for name in ('storage.toml','teacher-site.env'):(self.l.config/name).chmod(0o640)
        # Creation/removal, not just os.access(), verifies ACL and effective identity.
        code='import pathlib,tempfile,os,sys\nfor n in sys.argv[1:]:\n p=pathlib.Path(n);p.mkdir(parents=True,exist_ok=True)\n fd,name=tempfile.mkstemp(prefix=".tweb-check-",dir=p);os.close(fd);os.unlink(name)\n'
        self.run(['runuser','-u',self.user,'--',release/'.venv/bin/python','-c',code,*directories])
        self.run(['runuser','-u',self.user,'--',release/'.venv/bin/python','-c',
                  'import pathlib,sys;[pathlib.Path(p).open("rb").close() for p in sys.argv[1:]]',
                  release/'backend/entrypoints/vps.py',self.l.config/'storage.toml',self.l.config/'teacher-site.env'])
        if paths['database_path'].exists():
            self.run(['runuser','-u',self.user,'--',release/'.venv/bin/python','-c',
                      'import os,sys;fd=os.open(sys.argv[1],os.O_RDWR|os.O_NOFOLLOW);os.close(fd)',paths['database_path']])
        if repair and was_active:self.start()
        print(color('读写权限检查通过 / Service read/write checks passed','32'))

    def dependencies(self):
        self.load();release=self.release();was_active=self.active()
        self.run(['systemctl','stop',self.service])
        # Updating in place is deliberate: no extra virtual environments or backups.
        # On failure keep the service stopped; re-running retries the same lock file.
        self.install_dependencies(release)
        if was_active:self.start()
        print(color('依赖同步完成 / Dependencies synchronized','32'))

    def update_source(self,args):
        if args.reset:raise ValueError('局部更新不能重置数据库 / Partial update cannot reset the database')
        state=self.load();old=self.release()
        repo=repository(args.repo or state['repo']);branch=branch_name(args.branch or state['branch'])
        fresh,commit=self.fetch(repo,branch);stopped=False
        try:
            names=('database','deploy/shared/requirements','pyproject.toml')
            if args.scope=='frontend':names=('backend','database','transfer','site_sync','deploy','pyproject.toml')
            if protected_digest(old,names)!=protected_digest(fresh,names):
                raise ValueError('后端/结构/依赖不兼容，请整站更新 / Incompatible schema or dependencies; use --scope all')
            was_active=self.active();self.run(['systemctl','stop',self.service]);stopped=True
            # Keep the installed venv at its original path; console-script shebangs stay valid.
            # Only canonical source objects are replaced. Runtime paths are never traversed.
            if args.scope=='source':self.import_media(fresh)
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
                self.run(['systemctl','stop',self.service]);state['phase']='partial-update-failed';self.save(state)
                print('局部更新失败，服务保持停止；重试或整站更新 / Partial update failed; service remains stopped',file=sys.stderr)
            raise
        finally:
            if fresh.exists():shutil.rmtree(fresh)
        print(color('更新完成 / Updated: '+args.scope+' '+commit,'32'))

    def configure(self,port=None,allowed_origins=None):
        state=self.load();self.check_unit(state)
        origins=site_origins(state,allowed_origins)
        configured={**state,'allowed_origins':origins}
        current=port_number(state.get('port',8003));port=current if port is None else port_number(port)
        if port!=current:
            with socket.socket() as sock:sock.bind(('127.0.0.1',port))
        paths=[self.l.unit,self.l.config/'generated'/self.service,self.l.config/'generated/Caddyfile.fragment',self.l.config/'generated/nginx-location.conf',self.l.config/'teacher-site.env']
        saved={}
        for path in paths:
            no_symlinks(path);saved[path]=path.read_text() if path.exists() else None
        env_stat=paths[4].stat() if paths[4].exists() else None
        def write_environment(text):
            write(paths[4],text,(env_stat.st_mode & 0o777) if env_stat else 0o640)
            if env_stat:os.chown(paths[4],env_stat.st_uid,env_stat.st_gid)
        unit,n=re.subn(r'--port\s+\d+',f'--port {port}',saved[self.l.unit])
        if n!=1:raise ValueError('无法识别服务端口 / Cannot identify service port')
        before=dict(state);before['owned_files']=dict(state['owned_files']);was_active=self.active()
        self.run(['systemctl','stop',self.service])
        try:
            write(self.l.unit,unit);write(paths[1],unit)
            write(paths[2],f"{', '.join(site_domains(configured))} {{\n    encode zstd gzip\n    reverse_proxy 127.0.0.1:{port} {{\n        flush_interval 10ms\n    }}\n}}\n")
            # Reuse the existing nginx template while refreshing only its upstream port.
            if saved[paths[3]] is None:raise ValueError('缺少 nginx 示例 / Missing nginx template')
            nginx=re.sub(r'127\.0\.0\.1:\d+',f'127.0.0.1:{port}',saved[paths[3]])
            nginx=re.sub(r'^server_name [^;]+;\n','',nginx,flags=re.M)
            write(paths[3],'server_name '+' '.join(site_domains(configured))+';\n'+nginx)
            if allowed_origins is not None:
                if saved[paths[4]] is None:raise ValueError('Missing teacher-site.env')
                env='\n'.join(line for line in saved[paths[4]].splitlines() if not line.startswith('TEACHER_ALLOWED_ORIGINS='))
                write_environment(env+'\nTEACHER_ALLOWED_ORIGINS='+origins+'\n')
                state['allowed_origins']=origins
            state['port']=port;state['owned_files'][str(self.l.unit)]=hashlib.sha256(self.l.unit.read_bytes()).hexdigest();self.save(state)
            self.run(['systemctl','daemon-reload'])
            if was_active:self.start()
        except BaseException:
            self.run(['systemctl','stop',self.service])
            for path,text in saved.items():
                if text is None:path.unlink(missing_ok=True)
                elif path==paths[4]:write_environment(text)
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
        was_active=self.active();self.run(['systemctl','stop',self.service])
        # Keep the service stopped on any filesystem failure.
        for path in selected:
            if path.is_dir():shutil.rmtree(path)
            else:path.unlink(missing_ok=True)
            if path.name!='service.log':
                path.mkdir(parents=True,exist_ok=True);path.chmod(0o755 if scope=='source' else 0o700)
                if scope!='source':self.run(['chown',f'{self.user}:{self.user}',path])
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
        was_active=self.active();self.run(['systemctl','stop',self.service])
        # Failure deliberately leaves the service stopped, never live with an empty account set.
        self.db(release,'reset' if reset else ('update' if update else 'init'))
        if was_active:self.start()
        state=self.load();state['phase']='ready';self.save(state)
        print('数据库重建完成；磁盘媒体保留。' if reset else '数据库初始化/结构核验完成。')

    def uninstall(self,supplied=None):
        return self.clean_remnants(supplied)

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
        print(json.dumps({'allowed_origins':site_origins(state).split(','),'website':'https://'+state['domain'],'sitemap':'https://'+state['domain']+'/sitemap.xml','robots':'https://'+state['domain']+'/robots.txt','admin':'https://'+state['domain']+'/admin','transfer':'https://'+state['domain']+'/transfer','repository':state['repo'],'branch':state['branch'],'phase':state['phase'],'application_port':state.get('port',8003),'code':str(self.l.current),'config':str(self.l.config),'database':str(self.l.data/'database/site.sqlite3'),'media':str(self.l.data/'media'),'transfer_files':str(self.l.base/'transfer-data'),'logs':str(self.l.data/'logs/service.log'),'service':str(self.l.unit),'command':str(self.l.command)},ensure_ascii=False,indent=2))

    def doctor(self):
        self.paths()
        commands=[['systemctl','status','--no-pager',self.service],['ss','-ltn'],['ufw','status','verbose'],['firewall-cmd','--state'],['nft','list','ruleset'],['iptables','-S'],['nginx','-t'],['caddy','version']]
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
 ('pip-source','Python 依赖源 / Package source','清华或官方 HTTPS 源 / Tsinghua or official HTTPS index'),
 ('resume-install','继续失败的安装 / Resume installation','仅限激活前阶段 / Pre-activation stage only'),
 ('repair','修复部署 / Repair','恢复缺失的源码、入口和服务，保留数据 / Restore deployment, preserve data'),
 ('clean-remnants','彻底清理残留 / Clean remnants','删除本站全部数据和账号，支持记录缺失 / Delete website data and account'),
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
    p.add_argument('--instance',default='')
    p.add_argument('--base')
    p.add_argument('--command',dest='command_name')
    p.add_argument('--multi',action='store_true',help='Interactive isolated installation')
    sub=p.add_subparsers(dest='action')
    install=sub.add_parser('install');install.add_argument('--repo',default=DEFAULT_REPOSITORY);install.add_argument('--branch',default=DEFAULT_BRANCH);install.add_argument('--domain',required=True);install.add_argument('--allowed-origins',default='');install.add_argument('--python',default='/usr/bin/python3');install.add_argument('--port',type=port_number,default=8003);install.add_argument('--pip-source',choices=tuple(PIP_SOURCES),default=DEFAULT_PIP_SOURCE)
    domains=sub.add_parser('domains');domains.add_argument('--allowed-origins',required=True,help='Comma-separated HTTPS origins; empty keeps only canonical')
    source=sub.add_parser('pip-source');source.add_argument('name',choices=tuple(PIP_SOURCES),nargs='?')
    sub.add_parser('resume-install')
    sub.add_parser('repair')
    sub.add_parser('clean-remnants').add_argument('--confirm')
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
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('另一部署操作正在执行，请稍后重试 / Another deployment operation is running') from None
        layout=select_install_layout(a) if a.multi and a.action=='install' else argument_layout(a)
        m=Manager(layout)
        if layout.instance:
            heading(f'实例 / Instance: {layout.instance} — {layout.command.name} — {layout.base}')
        if a.action=='install':
            if a.multi:m.install(a)
            else:m.install_entry(a)
        elif a.action=='domains':
            m.configure(allowed_origins=a.allowed_origins)
            print('域名已保存；检查生成的代理配置、DNS和证书后重载代理 / Domains saved; review proxy, DNS and certificates, then reload proxy')
        elif a.action=='repair':m.repair_install()
        elif a.action=='clean-remnants':m.clean_remnants(a.confirm)
        elif a.action=='pip-source':m.pip_source(a.name)
        elif a.action=='resume-install':m.resume_install()
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
            m.run(['runuser','-u',m.user,'--','env','-i','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','PYTHONUTF8=1','PYTHONDONTWRITEBYTECODE=1',f'TEACHER_CONFIG={m.l.config}/storage.toml',m.release()/'.venv/bin/python','-m','backend.cli',a.action],cwd=m.release())
        elif a.action in ('paths','doctor','proxy'):getattr(m,a.action)()
        else:
            m.load()
            if a.action=='logs':m.run(['tail','-n','100','-F',m.l.data/'logs/service.log'])
            elif a.action=='start':m.start()
            elif a.action=='restart':m.restart()
            else:m.run(['systemctl',a.action,'--no-pager',m.service])
    # Keep the shared lock inode stable: unlinking creates an inter-process race.
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
        interpreter=Manager(argument_layout(a)).load()['python']
        run([interpreter,'-c','import sys; assert sys.version_info >= (3,12), "Python 3.12+ required"'])
        os.execvp(interpreter,[interpreter,str(Path(__file__).resolve()),*(sys.argv[1:] if argv is None else argv)])
    heading('教师网站管理 / Teacher Website Manager')
    if a.instance:
        layout=argument_layout(a);heading(f'实例 / Instance: {a.instance} — {layout.command.name} — {layout.base}')
        if layout.state.is_file():
            try:
                state=Manager(layout).load();print(f"https://{state['domain']} | 127.0.0.1:{state.get('port',8003)}")
            except (ValueError,OSError):print(color('实例记录需要检查或修复 / Instance state needs inspection or repair','33'))
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
        if action=='pip-source':
            source=choose('选择依赖源 / Choose package source',[('tuna','清华镜像 / Tsinghua mirror','已验证可用的默认 HTTPS 源 / Default HTTPS index'),('pypi','官方源 / Official PyPI','使用官方文件下载链路 / Use official download servers')])
            if source is None:return 0
            args.append(source)
        if action=='permissions':
            mode=choose('权限操作 / Permissions',[('check','检查 / Check','实际读写探测 / Actual access probe'),('repair','修复 / Repair','恢复受管数据目录权限 / Restore managed data permissions')])
            if mode is None:return 0
            if mode=='repair':args+=['--repair']
    except EOFError:return 0
    selected=p.parse_args(args)
    for key in ('instance','base','command_name','multi'):setattr(selected,key,getattr(a,key))
    return perform(selected)

if __name__=='__main__':
    try:raise SystemExit(main())
    except KeyboardInterrupt:raise SystemExit(130)
    except Exception as exc:print(color('tweb: '+str(exc),'31'),file=sys.stderr);raise SystemExit(1)
