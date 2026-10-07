"""Fresh CLI processes must resolve checkout packages without test-runner paths."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
HERE = ROOT / 'deploy/cloudflare'


class SourcePathTests(unittest.TestCase):
    def run_probe(self, cwd, mode='inline', invalid=False):
        env = {k: v for k, v in os.environ.items()
               if not k.startswith(('PYTHON', 'TEACHER_', 'WORKERS_'))}
        env.update(TEACHER_WORKER_NAME='teacher-site',
                   TEACHER_ORIGIN='https://teacher-site.account-test.workers.dev',
                   TEACHER_ALLOWED_ORIGINS='https://faculty.university.edu',
                   TEACHER_D1_ID='12345678-1234-1234-1234-123456789abc',
                   TEACHER_D1_NAME='teacher-site', TEACHER_MEDIA_BUCKET='teacher-media',
                   TEACHER_SYNC_EXECUTOR_MODE=mode,
                   CLOUDFLARE_ACCOUNT_ID='a'*32, TEACHER_AUX_API_TOKEN='test-token', TEACHER_SYNC_KEY='6a'*32,
                   WORKERS_CI='1', WORKERS_CI_BRANCH='web-py', SKIP_DEPENDENCY_INSTALL='1')
        if invalid:
            env.pop('TEACHER_D1_ID')
        # Reproduce script-directory-only search paths; no checkout root injection.
        # The host may be Python 3.12: exercise the version gate separately in
        # test_build_step1, and pass its supported-version argument here.
        script = '''
import sys
sys.path.insert(0, sys.argv[1])
import build
import pipeline
original = build.preflight
build.preflight = lambda: original(version=(3, 13))
result = build.main(['check', '--deployment-config'])
if result == 0:
    config = pipeline.settings(__import__('os').environ)
    assert config['sync_executor'] == sys.argv[2]
    assert 'https://faculty.university.edu' in config['allowed_origins']
    assert not any(x in sys.modules for x in ('fastapi', 'backend.app.native.web'))
raise SystemExit(result)
'''
        return subprocess.run([sys.executable, '-I', '-B', '-c', script, str(HERE), mode],
                              cwd=cwd, env=env, capture_output=True, text=True, timeout=30)

    def test_clean_process_from_all_working_directories(self):
        with tempfile.TemporaryDirectory() as temporary:
            for cwd in (ROOT, HERE, Path(temporary)):
                for mode in ('inline', 'separate'):
                    with self.subTest(cwd=cwd, mode=mode):
                        result = self.run_probe(cwd, mode)
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                        self.assertIn('DEPLOY-CONFIG', result.stdout)
                        self.assertNotIn('WORKSPACE', result.stdout)

    def test_missing_configuration_is_reported_before_packaging(self):
        result = self.run_probe(HERE, invalid=True)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn('TEACHER_D1_ID', result.stdout)
        self.assertNotIn('Traceback', result.stderr)
