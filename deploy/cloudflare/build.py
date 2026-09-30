"""Cloudflare bootstrap and release entrypoint; never installs the source checkout.

Run from any working directory. Only the standard library is needed to start.
Only the explicit deploy command publishes; bundle is a non-publishing dry run.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import tomllib
import venv

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PATCH = 'cloudflare-startup-step4'


class BuildError(Exception):
    """An actionable configuration or build-stage failure."""


def log(stage, message, **values):
    print(json.dumps({'stage': stage, 'message': message, **values}, ensure_ascii=False), flush=True)


def git_value(*args):
    try:
        result = subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True,
                                text=True, timeout=10, check=False)
        return result.stdout.strip() if result.returncode == 0 else 'unavailable'
    except (OSError, subprocess.TimeoutExpired):
        return 'unavailable'


def preflight(env=None, version=None):
    env = os.environ if env is None else env
    version = sys.version_info[:2] if version is None else version
    required = ('pyproject.toml', 'backend/app/native/web.py', 'database/schema.sql',
                'frontend/public/templates/layout.html', 'deploy/shared/worker_package.py')
    for name in required:
        if not (ROOT / name).is_file():
            raise BuildError('源码不完整 / Missing source: ' + name)
    project = tomllib.loads((ROOT / 'pyproject.toml').read_text(encoding='utf-8'))['project']
    manifest = tomllib.loads((HERE / 'pyproject.toml').read_text(encoding='utf-8'))['project']
    minimum = re.fullmatch(r'>=(\d+)\.(\d+)', manifest['requires-python'])
    if not minimum:
        raise BuildError('无法识别 Workers Python 版本要求 / Unsupported Python requirement')
    if tuple(version) < tuple(map(int, minimum.groups())):
        raise BuildError('需要 Python ' + manifest['requires-python'] +
                         '；在 Build Variables 设置 PYTHON_VERSION / Set build Python version')
    dependencies = manifest.get('dependencies', [])
    if not dependencies or any(not re.fullmatch(r'[A-Za-z0-9_.-]+==[A-Za-z0-9_.+!-]+', d)
                               for d in dependencies):
        raise BuildError('应用依赖必须使用固定版本 / Application dependencies must use exact pins')
    cloud = env.get('WORKERS_CI') == '1'
    if cloud and env.get('SKIP_DEPENDENCY_INSTALL', '').lower() not in ('1', 'true'):
        raise BuildError('请在 Cloudflare Build Variables 设置 SKIP_DEPENDENCY_INSTALL=1；'
                         '脚本不能撤销此前的 pip install . / Disable automatic dependency installation')
    branch = env.get('WORKERS_CI_BRANCH') or git_value('branch', '--show-current')
    commit = env.get('WORKERS_CI_COMMIT_SHA') or git_value('rev-parse', 'HEAD')
    expected = env.get('TEACHER_BUILD_BRANCH', 'web-py')
    if cloud and branch != expected:
        raise BuildError('构建分支不匹配 / Branch mismatch: ' + json.dumps({'actual': branch, 'expected': expected}))
    run_stage('STARTUP-CHECK', [sys.executable, '-B', str(HERE/'startup_check.py')], HERE, dict(env))
    log('CHECK', '构建配置通过 / Build configuration checked', version=project['version'],
        patch=PATCH, branch=branch, commit=commit, expected_branch=expected,
        python='.'.join(map(str, version)), manifest=str(HERE / 'pyproject.toml'),
        dependency_count=len(dependencies))
    return dependencies


def run_stage(name, command, cwd, env):
    started = time.monotonic()
    log(name, '开始 / START')
    try:
        subprocess.run(command, cwd=cwd, env=env, check=True)
    except subprocess.CalledProcessError as exc:
        raise BuildError(f'{name} 失败 / FAILED (exit {exc.returncode}); 请查看上方输出 / See output above') from None
    log(name, '完成 / OK', seconds=round(time.monotonic() - started, 2))


@contextmanager
def dependency_environment(dependencies):
    """Create disposable dependencies outside the checkout; clean even after failures."""
    base = Path(tempfile.gettempdir()).resolve()
    if base == ROOT or base.is_relative_to(ROOT):
        raise BuildError('临时目录必须位于源码目录外 / Set TMPDIR or TEMP outside checkout')
    with tempfile.TemporaryDirectory(prefix='teacher-worker-', dir=base) as folder:
        work = Path(folder)
        python = work / 'venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
        log('ENV', '创建临时依赖环境 / Creating temporary environment', directory=str(work))
        venv.EnvBuilder(with_pip=True).create(work / 'venv')
        requirements = work / 'application-requirements.txt'
        requirements.write_text('\n'.join(dependencies) + '\n', encoding='utf-8')
        env = dict(os.environ)
        for name in ('PYTHONPATH', 'PYTHONHOME', 'PIP_TARGET', 'PIP_PREFIX', 'PIP_USER', 'VIRTUAL_ENV'):
            env.pop(name, None)
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        run_stage('DEPENDENCIES', [str(python), '-m', 'pip', 'install', '--disable-pip-version-check',
                  '--no-cache-dir', '--retries', '2', '--timeout', '30', '-r', str(requirements)], work, env)
        run_stage('DEPENDENCY-CHECK', [str(python), '-m', 'pip', 'check'], work, env)
        yield python, work, env
    log('CLEANUP', '临时环境已清理 / Temporary environment removed')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('check', 'prepare', 'bundle', 'deploy'), help='check: preflight; prepare: application deps; bundle: dry run; deploy: publish')
    args = parser.parse_args(argv)
    try:
        dependencies = preflight()
        if args.command in ('bundle', 'deploy'):
            from pipeline import execute
            execute(args.command, run_stage, log)
            return 0
        if args.command == 'prepare':
            with dependency_environment(dependencies) as (python, work, env):
                # No source copying, rewriting, wheel construction or database initialization.
                script = ('import sys; sys.path.insert(0,sys.argv[1]); '
                          'import fastapi,jinja2,justhtml,mistune; from zoneinfo import ZoneInfo; '
                          'from backend.app.config import Settings; '
                          'from backend.app.native.schema_sources import initialization_sql; '
                          'from backend.app.security.http import AuthConfig; '
                          'assert ZoneInfo("Asia/Shanghai"); assert initialization_sql(); '
                          'assert AuthConfig.from_origin("https://teacher.invalid").secure')
                run_stage('IMPORTS', [str(python), '-B', '-c', script, str(ROOT)], work, env)
        log('DONE', '检查完成：此命令不生成或发布 Worker / '
            'Checks only: use bundle for packaging or deploy to publish')
        return 0
    except (BuildError, OSError, ValueError) as exc:
        log('FAILED', str(exc))
        return 1
    except KeyboardInterrupt:
        log('INTERRUPTED', '用户中断 / Interrupted')
        return 130


if __name__ == '__main__':
    raise SystemExit(main())
