"""Stage/release a Worker in one disposable directory outside the checkout."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
from urllib.parse import urlsplit
from uuid import UUID
import venv

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
UV_VERSION = '0.12.18'
FILES = ('pyproject.toml', 'uv.lock', 'pylock.toml', 'package.json', 'package-lock.json')


def settings(env):
    from runtime.cache_policy import policy
    policy(env)
    """No implicit production resource creation and no secret values in configuration."""
    def required(key):
        value = env.get(key, '').strip()
        if not value:
            raise ValueError('缺少构建变量 / Missing build variable: ' + key)
        return value
    key=env.get('TEACHER_SYNC_KEY','')
    if key and not re.fullmatch('[a-fA-F0-9]{64}',key):
        raise ValueError('TEACHER_SYNC_KEY must be 64 hexadecimal characters')
    sync_executor=env.get('TEACHER_SYNC_EXECUTOR_MODE','inline').strip()
    if sync_executor not in ('inline','separate'):raise ValueError('TEACHER_SYNC_EXECUTOR_MODE must be inline or separate')
    sync_paused=env.get('TEACHER_SYNC_PAUSED','0').strip()
    if sync_paused not in ('0','1'):raise ValueError('TEACHER_SYNC_PAUSED must be 0 or 1')
    name = required('TEACHER_WORKER_NAME')
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,62}', name):
        raise ValueError('TEACHER_WORKER_NAME 格式错误 / Invalid Worker name')
    from domains import settings as domain_settings
    domain = domain_settings(env, name)
    database = required('TEACHER_D1_ID')
    if str(UUID(database)) != database.lower() or UUID(database).int == 0:
        raise ValueError('TEACHER_D1_ID 必须是有效 D1 UUID / Invalid D1 ID')
    dbname = required('TEACHER_D1_NAME')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', dbname):
        raise ValueError('TEACHER_D1_NAME 格式错误 / Invalid D1 name')
    bucket = required('TEACHER_MEDIA_BUCKET')
    cache = env.get('TEACHER_CACHE_BUCKET', '').strip()
    for value in (bucket, cache):
        if value and not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', value):
            raise ValueError('R2 桶名格式错误 / Invalid R2 bucket name')
    return dict(sync_paused=sync_paused,sync_executor=sync_executor,name=name, database=database, dbname=dbname, bucket=bucket, cache=cache, **domain)


def prepare_arguments(config, output):
    args = ['--output', str(output), '--worker-name', config['name'],
            '--database-id', config['database'], '--database-name', config['dbname'],
            '--origin', config['origin'], '--bucket', config['bucket']]
    if config.get('allowed_origins'):
        args += ['--allowed-origins', ','.join(config['allowed_origins'])]
    if config['cache']:
        args += ['--cache-bucket', config['cache']]
    return args


def lock_identity(path):
    """Ignore generated timestamp, but reject any runtime package/version/hash drift."""
    data = tomllib.loads(path.read_text(encoding='utf-8'))
    return data.get('packages', [])


def verify_stage(stage):
    """Verify copied Python, generated schema and browser resource URLs before upload."""
    for source in (ROOT / 'backend').rglob('*.py'):
        target = stage / 'src' / source.relative_to(ROOT)
        if target.read_bytes() != source.read_bytes():
            raise ValueError('源码副本不一致 / Source mismatch: ' + str(source.relative_to(ROOT)))
    if (stage / 'initialize.sql').read_bytes() != (ROOT / 'database/schema.sql').read_bytes():
        raise ValueError('初始化 SQL 不一致 / Schema mismatch')
    for area in ('shared', 'admin', 'public'):
        source = ROOT / 'frontend' / area / 'static'
        for item in source.rglob('*'):
            if item.is_file() and (stage / 'assets/assets' / area / item.relative_to(source)).read_bytes() != item.read_bytes():
                raise ValueError('静态资源不一致 / Asset mismatch')
    config = json.loads((stage/'wrangler.jsonc').read_text())
    if config['main'] != 'src/main.py' or not (stage/'src/main.py').is_file():
        raise ValueError('Worker 入口缺失 / Missing entrypoint')
    from integration_package import verify
    verify(ROOT, stage, config)
    return config


@contextmanager
def workspace():
    base = Path(tempfile.gettempdir()).resolve()
    if base == ROOT or base.is_relative_to(ROOT):
        raise ValueError('临时目录必须在源码之外 / Temporary directory must be outside checkout')
    with tempfile.TemporaryDirectory(prefix='teacher-worker-release-', dir=base) as folder:
        yield Path(folder)


def execute(command, runner, log, *, report_path=None):
    config = settings(os.environ)
    from deploy_config import validate
    validate(os.environ,config['name'],credentials=command=='deploy')
    if command=='verify-native':
        from native_build import execute as native_execute
        return native_execute(config,runner,log,report_path)
    release=None
    if command=='deploy':
        from companion_release import Release
        release=Release(os.environ,config,log)
        release.preflight()
        from admin_release import AdminRelease
        admin_release=AdminRelease(release,os.environ)
        admin_release.preflight()
    for name in FILES:
        if not (HERE/name).is_file():
            raise ValueError('缺少锁文件 / Missing deployment file: '+name)
    node = shutil.which('node'); npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not node or not npm:
        raise ValueError('需要 Node.js 和 npm / Install Node.js and npm')
    version = subprocess.check_output([node, '--version'], text=True).strip()
    if int(version.lstrip('v').split('.')[0]) < 22:
        raise ValueError('构建工具需要 Node.js 22 或以上 / Node.js >=22 required')
    expected_runtime = lock_identity(HERE/'pylock.toml')
    with workspace() as work:
        log('WORKSPACE', '只在临时目录整理源码 / Temporary staging only', directory=str(work))
        boot = work/'bootstrap'
        venv.EnvBuilder(with_pip=True).create(boot)
        binary = boot/('Scripts' if os.name == 'nt' else 'bin')
        python = binary/('python.exe' if os.name == 'nt' else 'python')
        uv = binary/('uv.exe' if os.name == 'nt' else 'uv')
        env = dict(os.environ)
        for key in ('PYTHONPATH','PYTHONHOME','VIRTUAL_ENV','CONDA_PREFIX','UV_PROJECT_ENVIRONMENT',
                    'UV_PYTHON','PIP_TARGET','PIP_PREFIX','PIP_USER'):
            env.pop(key, None)
        env.pop('TEACHER_AUX_API_TOKEN',None)
        env.update(PYTHONDONTWRITEBYTECODE='1', WRANGLER_SEND_METRICS='false',
                   UV_NO_PROGRESS='1', PATH=str(binary)+os.pathsep+env.get('PATH',''))
        runner('UV', [str(python), '-m', 'pip', 'install', '--disable-pip-version-check',
                      '--retries','2','--timeout','30','uv=='+UV_VERSION], work, env)
        host = work/'tools'; host.mkdir()
        for name in ('pyproject.toml','uv.lock'):
            shutil.copyfile(HERE/name, host/name)
        runner('TOOLCHAIN', [str(uv),'sync','--locked','--project',str(host),
                            '--python',sys.executable], work, env)
        host_python = host/'.venv'/('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
        stage = work/'worker'
        runner('PACKAGE', [str(host_python),'-B',str(HERE/'prepare.py'),
                          *prepare_arguments(config, stage)], work, env)
        (stage/'wrangler.json').rename(stage/'wrangler.jsonc')
        # Keep package names unchanged; isolate the module root from build tools.
        (stage/'src').mkdir()
        for name in ('main.py', 'backend', 'site_sync', 'generated_native_resources.py', 'generated_resources.py'):
            shutil.move(str(stage/name), str(stage/'src'/name))
        shutil.copytree(HERE/'runtime', stage/'src/worker_runtime',
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        (stage/'src/main.py').write_text('from worker_runtime.entrypoint import Default, TransferCoordinator\n', encoding='utf-8')
        cfg = json.loads((stage/'wrangler.jsonc').read_text())
        cfg['main'] = 'src/main.py'
        from domains import apply as apply_domains
        apply_domains(cfg, config)
        log('DOMAIN', '站点地址配置 / Site origin configuration', origin=config['origin'],
            custom_domain=config['custom_domain'], workers_dev=config['workers_dev'])
        from integration_package import extend
        from runtime.cache_policy import variables
        cfg['vars'].update(variables(os.environ))
        cfg['vars']['TEACHER_RELEASE']=tomllib.loads((ROOT/'pyproject.toml').read_text())['project']['version']
        cfg['vars']['TEACHER_SYNC_EXECUTOR_MODE']=config['sync_executor']
        cfg['vars']['TEACHER_SYNC_PAUSED']=config.get('sync_paused','0')
        extend(ROOT, stage, cfg)
        (stage/'wrangler.jsonc').write_text(json.dumps(cfg, indent=2), encoding='utf-8')
        for name in FILES:
            shutil.copyfile(HERE/name, stage/name)
        verify_stage(stage)
        runner('SITE-PACKAGE',[str(host_python),'-B',str(HERE/'site_workers.py'),'--stage',str(stage)],stage,env)
        cfg=json.loads((stage/'wrangler.jsonc').read_text())
        runner('SNAPSHOT-CHECK', [str(host_python), '-B', str(HERE/'startup_check.py'),
            '--runtime', str(stage/'src/worker_runtime'), '--source', str(stage/'src')], stage, env)
        runner('ADMIN-SNAPSHOT-CHECK', [str(host_python), '-B', str(HERE/'startup_check.py'), '--runtime', str(stage/'src/worker_runtime'), '--source', str(stage/'src'), '--admin-only'], stage, env)
        runner('EXECUTOR-SNAPSHOT-CHECK', [str(host_python), '-B', str(HERE/'startup_check.py'),
            '--runtime', str(stage/'src/worker_runtime'), '--source', str(stage/'src'), '--executor-only'], stage, env)
        runner('EXECUTOR-DEPENDENCY-CHECK', [str(host_python), '-B', str(HERE/'startup_check.py'),
            '--runtime', str(stage/'src/worker_runtime'), '--source', str(stage/'src'), '--executor-dependencies'], stage, env)
        env['UV_PROJECT_ENVIRONMENT'] = str(host/'.venv')
        runner('WRANGLER', [npm,'ci','--no-audit','--no-fund'], stage, env)
        # Package synchronization is explicit, then Wrangler runs directly so a deploy
        # cannot silently resolve dependencies again after the lock check.
        runner('PYODIDE', [str(uv),'run','--locked','pywrangler','sync'], stage, env)
        if lock_identity(stage/'pylock.toml') != expected_runtime:
            raise ValueError('运行依赖发生变化，停止发布 / Runtime lock drift; refresh locks intentionally')
        wrangler = stage/'node_modules/wrangler/bin/wrangler.js'
        if not wrangler.is_file():
            raise ValueError('缺少锁定的 Wrangler / Missing locked Wrangler')
        aux_env={k:v for k,v in env.items() if k not in ('WRANGLER_CI_OVERRIDE_NAME','WRANGLER_CI_MATCH_TAG','WORKERS_CI')}
        artifact_args=['--outfile',str(work/'native.multipart')] if command in ('verify-companions','deploy') else []
        runner('SYNC-NATIVE-BUNDLE', [node,str(wrangler),'deploy','--config',str(stage/'sync-native/wrangler.jsonc'),'--dry-run','--outdir',str(work/'sync-native-bundle'),*artifact_args], stage, aux_env)
        if config['sync_executor']=='separate':
            artifact_args=['--outfile',str(work/'executor.multipart')] if command in ('verify-companions','deploy') else []
            runner('SYNC-EXECUTOR-BUNDLE', [node,str(wrangler),'deploy','--config',str(stage/'wrangler.sync-executor.jsonc'),'--dry-run','--outdir',str(work/'sync-executor-bundle'),*artifact_args],stage,aux_env)
        artifact_args=['--outfile',str(work/'admin.multipart')] if command in ('verify-companions','deploy') else []
        runner('ADMIN-BUNDLE',[node,str(wrangler),'deploy','--config',str(stage/'wrangler.admin.jsonc'),'--dry-run','--outdir',str(work/'admin-bundle'),*artifact_args],stage,aux_env)
        if command=='verify-companions':
            from companions import inspect_artifact
            reports=[inspect_artifact(work/'native.multipart',json.loads((stage/'sync-native/wrangler.jsonc').read_text()),config['name'],'native')]
            if config['sync_executor']=='separate':
                reports.append(inspect_artifact(work/'executor.multipart',json.loads((stage/'wrangler.sync-executor.jsonc').read_text()),config['name'],'executor'))
            reports.append(inspect_artifact(work/'admin.multipart',json.loads((stage/'wrangler.admin.jsonc').read_text()),config['name'],'admin'))
            result={'mode':config['sync_executor'],'wrangler':'4.143.0','artifacts':reports,
                    'publication':'not_run','database_changes':'not_run','cloud_runtime':'not_run'}
            if report_path:
                report=Path(report_path);report.parent.mkdir(parents=True,exist_ok=True)
                report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
            log('COMPANION-ARTIFACTS','上传产物本地验证通过；未发布 / Local artifacts verified; nothing published',**result)
            return
        runner('BUNDLE', [node,str(wrangler),'deploy','--dry-run','--outdir',str(work/'bundle')], stage, env)
        log('VERIFIED', '打包通过；尚未验证线上业务 / Bundle verified, runtime acceptance pending',
            worker=config['name'], origin=config['origin'])
        from r2_check import check as check_r2
        check_r2(node, wrangler, stage, env, cfg, runner, log, publish=command == 'deploy')
        from d1_setup import setup
        setup(node, wrangler, stage, env, config, log, publish=command == 'deploy')
        if command == 'deploy':
            release.prepare(stage,work)
            admin_release.prepare(stage,work)
            keyfile=work/'sync-secret.json'
            # An empty file preserves existing Wrangler secrets without writing a blank key.
            fd=os.open(keyfile,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            with os.fdopen(fd,'w') as output:json.dump({'TEACHER_SYNC_KEY':release.key} if release.key else {},output)
            secret_args=['--secrets-file',str(keyfile)]
            try:
                # Only the primary Worker is published by linked Builds/Wrangler.
                # Its CI identity and tag remain intact; secret is part of upload.
                runner('DEPLOY', [node,str(wrangler),'deploy',*secret_args], stage, env)
                release.activate()
            except Exception:
                log('RELEASE-INCOMPLETE','发布未全部完成；请核对辅助调度状态并重试 / Incomplete release; inspect scheduling and retry')
                raise
            finally:keyfile.unlink(missing_ok=True)
            log('PUBLISHED', '平台发布成功，D1 结构与 R2 读写已验证；仍需线上业务验收 / Published with verified D1 schema and R2 storage; runtime checks still required')
    log('CLEANUP', '临时源码、依赖与产物已清理 / Temporary source and artifacts removed')
