"""Run the independent redesign experiments; no cloud or old website imports."""
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def main():
    checks = []
    commands = [
        ('python_model', [sys.executable, '-m', 'unittest', 'discover', '-s', str(HERE), '-p', 'test_*.py', '-v']),
        ('native_stream_model', ['node', '--test', '--test-reporter=tap', str(HERE / 'stream_probe.test.mjs')]),
        ('isolated_core_import', [sys.executable, '-c',
         "import sys; from site_sync.core import contracts,policy; "
         "assert not any(x in sys.modules for x in ('fastapi','sqlite3','requests','backend')); "
         "print('new core imports without website or storage runtime')"]),
    ]
    for name, command in commands:
        try:
            result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=60)
            checks.append(dict(name=name, passed=result.returncode == 0,
                               returncode=result.returncode, output=result.stdout + result.stderr))
        except (OSError, subprocess.TimeoutExpired) as exc:
            checks.append(dict(name=name, passed=False, error=str(exc)))
    sql = sorted(str(p.relative_to(ROOT)) for p in ROOT.rglob('*.sql'))
    checks.append(dict(name='no_duplicate_initialization_sql', passed=sql in ([], ['database/schema.sql']), files=sql,
                       note='historical step-1 runner accepts the sole schema added by step 2'))
    report = dict(stage='independent-sync-redesign-step1',
        generated_at=datetime.now(timezone.utc).isoformat(),
        old_website_code_included=False, production_integration=False,
        cloud_deployed=False, real_worker_resource_limits_verified=False, checks=checks)
    (ROOT / 'site_sync/docs/results.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for item in checks:
        print(item['name'], 'PASS' if item['passed'] else 'FAIL')
    return int(any(not item['passed'] for item in checks))


if __name__ == '__main__':
    raise SystemExit(main())
