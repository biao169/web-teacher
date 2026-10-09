"""Real package + generated resources; every import gate runs in a fresh interpreter."""
import ast,json,shutil,subprocess,sys
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[3]
HERE=ROOT/'deploy/cloudflare'

@pytest.fixture
def stage(tmp_path):
    from deploy.shared.worker_package import prepare
    from integration_package import extend
    out=tmp_path/'worker'
    prepare(False,['--output',str(out),'--database-id','00000000-0000-0000-0000-000000000001','--origin','https://teacher.invalid','--bucket','test-media'],migration_plan=False)
    (out/'src').mkdir()
    for name in ('main.py','backend','site_sync','generated_native_resources.py','generated_resources.py'):
        shutil.move(str(out/name),str(out/'src'/name))
    shutil.copytree(HERE/'runtime',out/'src/worker_runtime',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    cfg=json.loads((out/'wrangler.json').read_text());cfg['vars']['TEACHER_SYNC_EXECUTOR_MODE']='separate'
    extend(ROOT,out,cfg)
    from site_workers import extend as split_site
    split_site(ROOT,out,cfg)
    return out

def check(stage,*flags):
    return subprocess.run([sys.executable,'-B',str(HERE/'startup_check.py'),'--runtime',str(stage/'src/worker_runtime'),'--source',str(stage/'src'),*flags],cwd=stage,capture_output=True,text=True,timeout=30)

def report(result):
    assert result.returncode==0,result.stdout+result.stderr
    return json.loads(next(line for line in result.stdout.splitlines() if line.startswith('{')))

def test_real_staged_main_cold_and_deferred_executor(stage):
    native=ast.parse((stage/'src/generated_native_resources.py').read_text())
    assert [n.targets[0].id for n in native.body]==['NATIVE']
    assert not (stage/'src/generated_resources.py').exists()
    web=ast.parse((stage/'src/generated_transfer_templates.py').read_text())
    assert {n.targets[0].id for n in web.body}=={'TEMPLATES','TRANSFER_TEMPLATES','TRANSFER_DEFAULTS','TRANSFER_CATALOG'}
    main=check(stage);assert main.returncode==0,main.stderr
    cold=report(check(stage,'--executor-only'));assert cold['generated_modules']==[]
    deferred=report(check(stage,'--executor-dependencies'))
    assert deferred['generated_modules']==['generated_native_resources'] and deferred['forbidden_modules']==[]

def test_accidental_website_resource_import_is_still_rejected(stage):
    (stage/'src/generated_resources.py').write_text('TEMPLATES = {}\n')
    path=stage/'src/generated_native_resources.py'
    with path.open('a') as f:f.write('\nimport generated_resources\n')
    result=check(stage,'--executor-dependencies')
    assert result.returncode!=0
    assert 'Executor isolation check failed' in result.stderr
    assert str(stage/'src/generated_resources.py') in result.stderr
    assert 'Executor mode: separate' in result.stderr

def test_missing_native_module_cannot_fallback_to_source_tree(stage):
    (stage/'src/generated_native_resources.py').unlink()
    result=check(stage,'--executor-dependencies')
    assert result.returncode!=0
    assert 'schema-spec.json' in result.stderr
