"""Check the actual generated source tree, not catalog's local JSON fallback."""
import json,shutil,subprocess,sys
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[3]
HERE=ROOT/'deploy/cloudflare'


def test_generated_package_passes_snapshot_check_and_rejects_executable_data(tmp_path,monkeypatch):
    monkeypatch.syspath_prepend(str(HERE))
    from deploy.shared.worker_package import prepare
    from integration_package import extend
    from pipeline import verify_stage
    out=tmp_path/'worker'
    prepare(False,['--output',str(out),'--database-id','12345678-1234-1234-1234-123456789abc','--origin','https://test.workers.dev','--bucket','media'],migration_plan=False)
    (out/'src').mkdir()
    for name in ('main.py','backend','generated_resources.py'):shutil.move(str(out/name),str(out/'src'/name))
    shutil.copytree(HERE/'runtime',out/'src/worker_runtime',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    cfg=json.loads((out/'wrangler.json').read_text());cfg['main']='src/main.py'
    extend(ROOT,out,cfg)
    (out/'src/main.py').write_text('from worker_runtime.entrypoint import Default, TransferCoordinator\n')
    (out/'wrangler.jsonc').write_text(json.dumps(cfg));verify_stage(out)
    def check():
        return subprocess.run([sys.executable,'-B',str(HERE/'startup_check.py'),'--runtime',str(out/'src/worker_runtime'),'--source',str(out/'src')],cwd=out,capture_output=True,text=True,timeout=30)
    result=check();assert result.returncode==0,result.stdout+result.stderr
    generated=out/'src/generated_resources.py'
    with generated.open('a') as f:f.write('\nimport os\n')
    result=check();assert result.returncode!=0 and 'literal assignments only' in result.stderr


@pytest.mark.parametrize('extra',["NATIVE = dict()", "OTHER = {}", "import secrets", "TEMPLATES = __import__('os').environ"])
def test_generated_resource_gate_rejects_calls_and_unknown_assignments(tmp_path,monkeypatch,extra):
    monkeypatch.syspath_prepend(str(HERE))
    from startup_check import validate_generated
    path=tmp_path/'generated_resources.py';path.write_text(extra)
    with pytest.raises((ValueError,TypeError)):validate_generated(path)
