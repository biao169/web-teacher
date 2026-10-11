import asyncio,importlib.util,sys
from types import SimpleNamespace as NS
from pathlib import Path
import pytest
from test_startup_lazy import entry

@pytest.mark.parametrize('failure',[ImportError('private'),RuntimeError('private')])
def test_undecorated_boundary_catches_import_and_diagnostics(entry,monkeypatch,failure,capsys):
 import workers
 monkeypatch.setattr(workers,'Response',lambda body,**kw:NS(body=body,**kw),raising=False)
 spec=importlib.util.spec_from_file_location('thin_entry',Path(__file__).parents[1]/'runtime/entrypoint.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 assert not hasattr(module.Default.fetch,'__wrapped__')
 async def fail(*a):raise failure
 monkeypatch.setitem(sys.modules,'worker_runtime.site_entrypoint',NS(Default=NS(fetch=fail)))
 request=NS(url='https://test/en',method='GET',headers={'cf-ray':'test-ray'})
 result=asyncio.run(module.Default().fetch(request))
 assert result.status==503 and result.headers['cache-control']=='no-store'
 assert 'data-public-recovery' in result.body and 'private' not in result.body
 assert 'PUBLIC-EARLY-ERROR' in capsys.readouterr().out

def test_snapshot_has_no_transfer_maintenance_sync_preloads():
 import ast
 source=(Path(__file__).parents[1]/'runtime/snapshot.py').read_text()
 imports=[n.module or '' for n in ast.walk(ast.parse(source)) if isinstance(n,ast.ImportFrom)]
 assert not any(n.startswith(('transfer','backend.maintenance','site_sync.integration')) for n in imports)
 assert 'install_transfer' not in source and 'media_uploads' not in source
