import json,shutil
from pathlib import Path
import pytest
from deploy.shared.worker_package import prepare
from integration_package import extend
ROOT=Path(__file__).resolve().parents[1]
@pytest.fixture
def stage(tmp_path):
    out=prepare(False,['--output',str(tmp_path/'worker'),'--database-id','00000000-0000-0000-0000-000000000001','--origin','https://teacher.example','--bucket','test-media'],migration_plan=False)
    (out/'wrangler.json').rename(out/'wrangler.jsonc');(out/'src').mkdir()
    for name in ('main.py','backend','site_sync','generated_native_resources.py','generated_resources.py'):shutil.move(str(out/name),str(out/'src'/name))
    shutil.copytree(ROOT/'deploy/cloudflare/runtime',out/'src/worker_runtime')
    (out/'src/main.py').write_text('from worker_runtime.entrypoint import Default, TransferCoordinator\n')
    cfg=json.loads((out/'wrangler.jsonc').read_text());cfg['main']='src/main.py';extend(ROOT,out,cfg)
    (out/'wrangler.jsonc').write_text(json.dumps(cfg))
    return out
