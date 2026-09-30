"""Bootstrap gates: no source installs/copies, isolated dependencies and useful failures."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[1] / 'build.py'
spec = importlib.util.spec_from_file_location('cloudflare_build', PATH)
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildTests(unittest.TestCase):
    def env(self, **changes):
        return dict(WORKERS_CI='1', SKIP_DEPENDENCY_INSTALL='1',
                    WORKERS_CI_BRANCH='web-py', WORKERS_CI_COMMIT_SHA='abc123', **changes)

    def test_correct_configuration(self):
        dependencies = build.preflight(self.env(), (3, 13))
        self.assertIn('tzdata==2026.4', dependencies)
        self.assertFalse(any('workers' in d for d in dependencies))

    def test_skip_install_required(self):
        env = self.env(); env.pop('SKIP_DEPENDENCY_INSTALL')
        with self.assertRaisesRegex(build.BuildError, 'SKIP_DEPENDENCY_INSTALL'):
            build.preflight(env, (3, 13))

    def test_wrong_branch(self):
        env = self.env(); env['WORKERS_CI_BRANCH'] = 'main'
        with self.assertRaisesRegex(build.BuildError, 'Branch mismatch'):
            build.preflight(env, (3, 13))

    def test_configurable_branch(self):
        env = self.env(TEACHER_BUILD_BRANCH='staging'); env['WORKERS_CI_BRANCH'] = 'staging'
        self.assertTrue(build.preflight(env, (3, 13)))

    def test_old_python(self):
        with self.assertRaisesRegex(build.BuildError, 'PYTHON_VERSION'):
            build.preflight(self.env(), (3, 12))

    def test_temporary_environment_and_failure_cleanup(self):
        calls = []
        def stage(name, command, cwd, env):
            calls.append((command, Path(cwd)))
            self.assertNotIn('PYTHONPATH', env)
            self.assertNotIn('PIP_TARGET', env)
            self.assertFalse(Path(cwd).is_relative_to(build.ROOT))
        with patch.object(build.venv.EnvBuilder, 'create'), patch.object(build, 'run_stage', side_effect=stage), \
             patch.dict(build.os.environ, {'PYTHONPATH':'wrong', 'PIP_TARGET':'wrong'}):
            with self.assertRaisesRegex(RuntimeError, 'test interruption'):
                with build.dependency_environment(['fastapi==0.115.12']) as (_, work, _):
                    self.assertEqual((work/'application-requirements.txt').read_text(), 'fastapi==0.115.12\n')
                    raise RuntimeError('test interruption')
        self.assertFalse(work.exists())
        command = calls[0][0]
        self.assertIn('-r', command)
        self.assertNotIn('.', command)
        self.assertNotIn(str(build.ROOT), command)

    def test_in_checkout_temp_is_rejected(self):
        with patch.object(tempfile, 'gettempdir', return_value=str(build.ROOT / 'data')):
            with self.assertRaisesRegex(build.BuildError, 'outside checkout'):
                with build.dependency_environment(['fastapi==0.115.12']):
                    self.fail('must not create environment')

    def test_subprocess_error_is_actionable(self):
        with patch.object(build.subprocess, 'run', side_effect=subprocess.CalledProcessError(9, 'pip')):
            with self.assertRaisesRegex(build.BuildError, 'DEPENDENCIES.*9'):
                build.run_stage('DEPENDENCIES', ['python'], build.ROOT, {})

    def test_check_does_not_install(self):
        with patch.object(build, 'preflight', return_value=['a==1']), \
             patch.object(build, 'dependency_environment') as install:
            self.assertEqual(build.main(['check']), 0)
            install.assert_not_called()

    def test_failed_prepare_does_not_report_success(self):
        with patch.object(build, 'preflight', side_effect=build.BuildError('missing')):
            self.assertEqual(build.main(['prepare']), 1)


if __name__ == '__main__':
    unittest.main()
