"""Read-only preflight, immutable release inventory and configuration generation.
No privileged commands, system edits, package installation, service starts or network calls.
"""
import argparse,hashlib,importlib.metadata,json,os,platform,re,shutil,socket,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
EXCLUDED={'.git','.venv','.pytest_cache','__pycache__','.worker','.transfer-worker','node_modules','transfer-data','data','local.cmd','settings.local.toml'}

def digest(path):
 """计算文件SHA-256，供发布清单校验内容。"""
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1048576),b''):h.update(block)
 return h.hexdigest()
def inventory(root):
 """收集可交付文件并拒绝数据库、凭据及不安全路径。"""
 result={}
 for p in sorted(root.rglob('*')):
  if any(part in EXCLUDED for part in p.relative_to(root).parts):continue
  if p.is_symlink():raise ValueError('发布源码不能包含符号链接')
  if not p.is_file() or p.name=='release-manifest.json':continue
  if (p.name.startswith('.env') and p.name!='.env.example') or p.suffix in ('.sqlite3','.sqlite','.db','.pyc','.zip') or p.name.endswith(('-wal','-shm','.secret.sql')):raise ValueError('源码中存在数据、凭据或临时文件：'+str(p.relative_to(root)))
  result[p.relative_to(root).as_posix()]={'bytes':p.stat().st_size,'sha256':digest(p)}
 return result

def write_manifest(root,refresh=False):
 """Create or explicitly refresh the byte manifest after editing; never changes runtime data."""
 root=Path(root);target=root/'release-manifest.json'
 if target.exists() and not refresh:raise FileExistsError('发布清单已存在；修改源码后可用 manifest --refresh 更新')
 data={'format':'teacher-release-v1','files':inventory(root)}
 with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=root,prefix='.manifest-',suffix='.tmp',delete=False) as stream:
  temp=Path(stream.name)
  try:json.dump(data,stream,indent=2)
  except BaseException:temp.unlink(missing_ok=True);raise
 try:
  temp.chmod(0o644);os.replace(temp,target)
 finally:temp.unlink(missing_ok=True)
 return {'created':True,'files':len(data['files']),'refreshed':refresh}

def verify(root):
 """核对发布清单中的路径、文件大小与摘要。"""
 expected=json.loads((root/'release-manifest.json').read_text())
 if expected.get('format')!='teacher-release-v1':raise ValueError('发布清单格式错误')
 actual=inventory(root)
 if actual!=expected['files']:
  recorded=expected['files'];groups={'missing':sorted(set(recorded)-set(actual)),
   'extra':sorted(set(actual)-set(recorded)),
   'changed':sorted(k for k in set(actual)&set(recorded) if actual[k]!=recorded[k])}
  report={k:{'count':len(v),'paths':v[:40]} for k,v in groups.items() if v}
  raise ValueError('发布清单不一致 / Release manifest mismatch: '+json.dumps(report,ensure_ascii=False)+
   '\n请在发布源码中执行 python -B deploy/vps/release.py manifest --root . --refresh，再执行 verify 并一起提交清单；安装端不会自动认可已改变的代码。')
 return {'verified':True,'files':len(actual),'source_bytes':sum(x['bytes'] for x in actual.values())}

def stage(source,destination):
 """把已核验的发布包展开到新目录，不覆盖在用版本。"""
 source=Path(source).resolve();destination=Path(destination).absolute()
 if destination==source or source in destination.parents:raise ValueError('新release必须位于源目录之外')
 verify(source)
 if destination.exists() or destination.is_symlink():raise ValueError('新release目录已存在，拒绝覆盖')
 shutil.copytree(source,destination,ignore=shutil.ignore_patterns(*EXCLUDED))
 try:return verify(destination)|{'staged':True,'current_changed':False}
 except Exception:
  shutil.rmtree(destination)
  raise

def check_data(root,teacher,transfer):
 """Read-only comparison of explicitly configured database files with canonical native SQL."""
 import sqlite3
 from contextlib import closing
 result={}
 for name,path in [('teacher',teacher),('transfer',transfer)]:
  db=Path(path)
  if not db.is_file():raise ValueError(name+'数据库不存在')
  expected={x['name']:x['sql'] for x in json.loads((root/'database/native'/(name+'.json')).read_text())['objects']}
  with closing(sqlite3.connect(db.resolve().as_uri()+'?mode=ro',uri=True)) as con:
   if con.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or con.execute('PRAGMA foreign_key_check').fetchone():raise ValueError(name+'数据库完整性失败')
   actual=dict(con.execute("SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"))
   if actual!=expected:raise ValueError(name+'数据库不符合原始结构；未修改数据')
  result[name]='exact_native_schema_checked_readonly'
 return result

def memory():
 """读取本机可获取的内存信息，供本地部署预检。"""
 path=Path('/proc/meminfo')
 if not path.exists():return {'available_bytes':None,'total_bytes':None}
 values={line.split(':')[0]:int(line.split()[1])*1024 for line in path.read_text().splitlines()}
 return {'available_bytes':values.get('MemAvailable'),'total_bytes':values.get('MemTotal')}

def preflight(root,data_parent,ports=(8003,)):
 """检查目标部署目录、可用资源及依赖条件。"""
 dependencies=[]
 for line in (root/'deploy/shared/requirements/requirements-vps.lock').read_text().splitlines():
  if not line.strip() or line.startswith('#'):continue
  name,wanted=line.strip().split('==')
  try:actual=importlib.metadata.version(name)
  except importlib.metadata.PackageNotFoundError:actual=None
  dependencies.append({'name':name,'wanted':wanted,'installed':actual,'matches':actual==wanted})
 disks=shutil.disk_usage(data_parent);mem=memory();busy=[]
 for port in ports:
  with socket.socket() as s:
   try:s.bind(('127.0.0.1',port))
   except OSError:busy.append(port)
 blockers=[]
 if sys.version_info<(3,12):blockers.append('Python需3.12+')
 if disks.free<1024**3+250*1024**2:blockers.append('可用磁盘不足：保留1GiB加250MiB初始安装预算')
 if mem['available_bytes'] is None: blockers.append('本平台无法自动测可用内存，需人工核对')
 elif mem['available_bytes']<300*1024**2:blockers.append('可用内存不足300MiB整站初始预算，需实测调整')
 if busy:blockers.append('端口已占用；如为已有站点，按升级流程停服切换')
 if not all(d['matches'] for d in dependencies):blockers.append('当前解释器依赖与锁文件不一致')
 for name in ('caddy','systemctl'):
  if not shutil.which(name):blockers.append(name+'未发现，不能判定生产部署就绪')
 return {'scope':'current machine only, not remote VPS','python':platform.python_version(),'architecture':platform.machine(),'memory':mem,'disk_free_bytes':disks.free,'busy_ports':busy,'dependencies':dependencies,'blockers':blockers,'ready_for_manual_review':not blockers,'production_verified':False}

def safe_path(value):
 """校验部署路径可安全写入配置文件。"""
 if not re.fullmatch(r'/[A-Za-z0-9_./-]+',str(value)) or '..' in Path(value).parts:raise ValueError('配置路径须为无空格、无特殊字符的绝对路径')
 return str(value).rstrip('/')
def domain(value):
 """校验反向代理使用的域名格式。"""
 if len(value)>253 or not re.fullmatch(r'[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?',value) or '.' not in value or any(not label or label.startswith('-') or label.endswith('-') or len(label)>63 for label in value.split('.')):raise ValueError('域名格式无效')
 return value

def render(output,base,teacher_domain,transfer_domain,python,port=8003,service_name="teacher-site.service",service_user="teacher-site",config_dir="/etc/teacher-site",allowed_domains=""):
 """Generate one service with explicit domains and one local HTTP port; never deploy."""
 from deploy.shared.http_limits import teacher_concurrency
 if isinstance(port,bool) or not str(port).isdigit() or not 1024<=int(port)<=65535:raise ValueError("应用端口须为 1024–65535 / Invalid application port")
 port=int(port)
 base=safe_path(base);python=safe_path(python);host=domain(teacher_domain)
 names=tuple(dict.fromkeys([host]+([domain(v.strip().lower()) for v in allowed_domains.split(',')] if allowed_domains else [])))
 if len(names)>100:raise ValueError('Too many domains')
 if transfer_domain:domain(transfer_domain) # legacy CLI input, not a second listener
 if not base.startswith(('/opt/','/srv/')):raise ValueError('生产基目录须位于 /opt 或 /srv 下')
 config_dir=safe_path(config_dir)
 if not re.fullmatch(r'[a-z][a-z0-9-]{0,50}\.service',service_name) or not re.fullmatch(r'[a-z][a-z0-9-]{0,30}',service_user):raise ValueError('无效服务名或账号')
 output=Path(output);output.mkdir(mode=0o700)
 (output/'storage.toml').write_text(f'[storage]\ndata_dir="{base}/data"\ndatabase_path="{base}/data/database/site.sqlite3"\ncache_dir="{base}/data/cache"\nmedia_dir="{base}/data/media"\ntransfer_database_path="{base}/data/database/legacy-transfer.sqlite3"\ntransfer_media_dir="{base}/transfer-data/files"\ntransfer_cache_dir="{base}/transfer-data/cache"\n')
 (output/'teacher-site.env').write_text(f'TEACHER_CONFIG={config_dir}/storage.toml\n# Canonical public origin also supplies robots.txt and sitemap URLs.\nTEACHER_ORIGIN=https://{host}\nTEACHER_ALLOWED_ORIGINS={','.join('https://'+name for name in names)}\nTEACHER_ASSET_MODE=local\nPYTHONDONTWRITEBYTECODE=1\n')
 (output/'teacher-site.env').chmod(0o600)
 unit=f"""[Unit]
Description=Teacher website with integrated file transfer
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=3
[Service]
Type=simple
User={service_user}
Group={service_user}
WorkingDirectory={base}/current
EnvironmentFile={config_dir}/teacher-site.env
ExecStart={python} -m deploy.shared.service backend.entrypoints.vps:app --host 127.0.0.1 --port {port} --limit-concurrency {teacher_concurrency()}
Restart=on-failure
RestartSec=5
TimeoutStopSec=90
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
# Create transfer-data before starting. Match overrides in storage.toml.
ReadWritePaths={base}/data {base}/transfer-data
MemoryHigh=160M
MemoryMax=224M
TasksMax=32
[Install]
WantedBy=multi-user.target
"""
 (output/service_name).write_text(unit)
 caddy=f'{", ".join(names)} {{\n    encode zstd gzip\n'
 for area in ('shared','public','admin'):
  caddy+=f'    handle_path /assets/{area}/* {{\n        root * {base}/current/frontend/{area}/static\n        file_server\n    }}\n'
 caddy+='    # Online relay: bounded POST bodies; do not add request_buffers/response_buffers.\n    handle /transfer/api/relay/* {\n        request_body {\n            max_size 1048576\n        }\n        reverse_proxy 127.0.0.1:8003 {\n            flush_interval 10ms\n        }\n    }\n'
 caddy+='    handle {\n        reverse_proxy 127.0.0.1:8003\n    }\n}\n'
 if transfer_domain and transfer_domain not in names:
  caddy+=f'{transfer_domain} {{\n    redir https://{host}/transfer{{uri}} 308\n}}\n'
 (output/'Caddyfile.fragment').write_text(caddy.replace('127.0.0.1:8003',f'127.0.0.1:{port}'))
 return {'generated':True,'services':1,'system_modified':False,'note':'预算不是实测；旧域名仅重定向，不启动旧服务。切换release时必须显式保留transfer-data。'}

def main():
 """解析本模块命令行参数并执行对应的维护或打包功能。"""
 p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='action',required=True)
 m=sub.add_parser('manifest');m.add_argument('--root',type=Path,default=ROOT);m.add_argument('--refresh',action='store_true',help='显式刷新已有清单；提交所有源码修改前执行')
 v=sub.add_parser('verify');v.add_argument('--root',type=Path,default=ROOT);v.add_argument('--strict',action='store_true',help='仅供发布打包人工检查；部署默认跳过完整性校验')
 st=sub.add_parser('stage');st.add_argument('--source',type=Path,required=True);st.add_argument('--destination',type=Path,required=True)
 d=sub.add_parser('check-data');d.add_argument('--root',type=Path,default=ROOT);d.add_argument('--teacher-database',type=Path,required=True);d.add_argument('--transfer-database',type=Path,required=True)
 f=sub.add_parser('preflight');f.add_argument('--root',type=Path,default=ROOT);f.add_argument('--data-parent',type=Path,required=True)
 r=sub.add_parser('render');r.add_argument('--output',required=True);r.add_argument('--base',default='/opt/teacher-site');r.add_argument('--python',default='/opt/teacher-site/venv/bin/python');r.add_argument('--teacher-domain',required=True);r.add_argument('--allowed-domains',default='');r.add_argument('--transfer-domain');r.add_argument('--port',type=int,default=8003);r.add_argument('--service-name',default='teacher-site.service');r.add_argument('--service-user',default='teacher-site');r.add_argument('--config-dir',default='/etc/teacher-site')
 args=p.parse_args()
 try:
  if args.action=='manifest':result=write_manifest(args.root,args.refresh)
  elif args.action=='verify':result=verify(args.root) if args.strict else {'verified':False,'skipped':True,'message':'跳过源码完整性校验 / Source integrity verification skipped; use --strict for packaging checks'}
  elif args.action=='stage':result=stage(args.source,args.destination)
  elif args.action=='check-data':result=check_data(args.root,args.teacher_database,args.transfer_database)
  elif args.action=='preflight':result=preflight(args.root,args.data_parent)
  else:result=render(args.output,args.base,args.teacher_domain,args.transfer_domain,args.python,args.port,args.service_name,args.service_user,args.config_dir,args.allowed_domains)
  print(json.dumps(result,ensure_ascii=False,indent=2))
  if args.action=='preflight' and result['blockers']:p.exit(2)
 except (ValueError,OSError) as exc:p.exit(1,str(exc)+'\n')
if __name__=='__main__':main()
