"""Temporary packaging and immutable source, settings and lock validation."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(HERE))
import pipeline
from test_build_step1 import build
sys.path.insert(0,str(pipeline.ROOT))
from deploy.shared.worker_package import prepare


class PipelineTests(unittest.TestCase):
    def env(self, **changes):
        result = dict(TEACHER_WORKER_NAME='teacher-site', TEACHER_ORIGIN='https://teacher-test.workers.dev',
                      TEACHER_D1_ID='12345678-1234-1234-1234-123456789abc',
                      TEACHER_D1_NAME='teacher-site', TEACHER_MEDIA_BUCKET='teacher-media')
        result.update(changes)
        return result

    def test_missing_settings(self):
        with self.assertRaisesRegex(ValueError, 'TEACHER_WORKER_NAME'):
            pipeline.settings({})

    def test_bad_origins(self):
        for origin in ('http://site.com','https://example.com','https://teacher.example.com',
                       'https://user:pass@site.com','https://site.com/a','https://site.com?token=x'):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                pipeline.settings(self.env(TEACHER_ORIGIN=origin))

    def test_invalid_resources(self):
        for key,value in [('TEACHER_D1_ID','bad'), ('TEACHER_D1_ID','00000000-0000-0000-0000-000000000000'),
                          ('TEACHER_MEDIA_BUCKET','../bucket'), ('TEACHER_WORKER_NAME','name bad')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                pipeline.settings(self.env(**{key:value}))

    def test_separate_cache_bucket(self):
        c=pipeline.settings(self.env(TEACHER_CACHE_BUCKET='teacher-cache'))
        args=pipeline.prepare_arguments(c,Path('/tmp/unused'))
        self.assertIn('--cache-bucket',args)

    def test_workspace_cleanup_after_failure(self):
        with self.assertRaises(RuntimeError):
            with pipeline.workspace() as work:
                self.assertFalse(work.is_relative_to(pipeline.ROOT))
                raise RuntimeError('simulate failure')
        self.assertFalse(work.exists())

    def test_no_source_output_or_overwrite(self):
        c=pipeline.settings(self.env())
        with self.assertRaises(SystemExit):
            prepare(False,pipeline.prepare_arguments(c,pipeline.ROOT/'src'))
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder);(p/'keep').write_text('safe')
            with self.assertRaises(SystemExit):
                prepare(False,pipeline.prepare_arguments(c,p))
            self.assertEqual((p/'keep').read_text(),'safe')

    def test_copied_code_and_schema_and_assets_unchanged(self):
        import shutil
        with pipeline.workspace() as work:
            stage=work/'worker';c=pipeline.settings(self.env())
            prepare(False,pipeline.prepare_arguments(c,stage))
            (stage/'src').mkdir()
            for n in ('main.py','backend','generated_resources.py'):
                shutil.move(str(stage/n),str(stage/'src'/n))
            config=json.loads((stage/'wrangler.json').read_text());config['main']='src/main.py'
            from integration_package import extend
            extend(pipeline.ROOT,stage,config)
            (stage/'src/main.py').write_text('from worker_runtime.entrypoint import Default, TransferCoordinator\n')
            (stage/'wrangler.jsonc').write_text(json.dumps(config))
            self.assertEqual(pipeline.verify_stage(stage)['name'],'teacher-site')
            target=stage/'src/backend/app/config.py';target.write_text('changed')
            with self.assertRaisesRegex(ValueError,'Source mismatch'):
                pipeline.verify_stage(stage)

    def test_runtime_lock_contains_sdk_and_wasm(self):
        packages=pipeline.lock_identity(HERE/'pylock.toml')
        sdk=next(p for p in packages if p['name']=='workers-runtime-sdk')
        self.assertEqual(sdk['version'],'1.9.1')
        self.assertTrue(any('emscripten' in str(p) for p in packages))

    def test_toolchain_pinned(self):
        import tomllib
        manifest=tomllib.loads((HERE/'pyproject.toml').read_text())
        self.assertFalse(manifest['tool']['uv']['package'])
        self.assertTrue(all('==' in d for d in manifest['dependency-groups']['dev']))
        node=json.loads((HERE/'package.json').read_text())
        lock=json.loads((HERE/'package-lock.json').read_text())
        self.assertEqual(node['devDependencies']['wrangler'],lock['packages']['node_modules/wrangler']['version'])

    def test_bundle_cannot_publish(self):
        """Mock downloads while exercising the real publish/dry-run decision."""
        import shutil
        def fake_stage(name,command,cwd,env):
            if name=='PACKAGE':
                stage=Path(command[command.index('--output')+1])
                stage.mkdir();(stage/'backend').mkdir()
                for n in ('main.py','generated_resources.py'):(stage/n).write_text('')
                (stage/'wrangler.json').write_text(json.dumps({'main':'main.py','assets':{}}))
            if name=='WRANGLER':
                p=Path(cwd)/'node_modules/wrangler/bin';p.mkdir(parents=True)
                (p/'wrangler.js').write_text('')
            stages.append((name,command))
        for mode in ('bundle','deploy'):
            stages=[]
            with patch.dict(pipeline.os.environ,self.env()), patch.object(pipeline.shutil,'which',return_value='/bin/node'), \
                 patch.object(pipeline.subprocess,'check_output',return_value='v22.0.0'), \
                 patch.object(pipeline.venv.EnvBuilder,'create'),patch.object(pipeline,'verify_stage'):
                pipeline.execute(mode,fake_stage,lambda *a,**kw:None)
            self.assertEqual(sum(n=='DEPLOY' for n,c in stages),int(mode=='deploy'))
            self.assertIn('--dry-run',next(c for n,c in stages if n=='BUNDLE'))


if __name__=='__main__':unittest.main()
