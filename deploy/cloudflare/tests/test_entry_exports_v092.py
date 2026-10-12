import ast
from pathlib import Path
import pytest
from integration_package import entrypoint_source,verify_entrypoint,WORKER_EXPORTS

def test_generated_entry_is_accepted(tmp_path):
 p=tmp_path/'main.py';p.write_text(entrypoint_source());verify_entrypoint(p)
 assert set(WORKER_EXPORTS)=={'Default','PublicPage','PublicData','TransferCoordinator'}

@pytest.mark.parametrize('missing',WORKER_EXPORTS)
def test_each_missing_export_is_named(tmp_path,missing):
 p=tmp_path/'main.py';p.write_text('from worker_runtime.entrypoint import '+', '.join(x for x in WORKER_EXPORTS if x!=missing))
 with pytest.raises(ValueError,match=missing):verify_entrypoint(p)

def test_order_comments_and_multiline_are_accepted(tmp_path):
 p=tmp_path/'main.py';p.write_text('# exports\nfrom worker_runtime.entrypoint import (TransferCoordinator,\n PublicPage, PublicData, Default)\n');verify_entrypoint(p)

def test_alias_is_not_the_required_export(tmp_path):
 p=tmp_path/'main.py';p.write_text(entrypoint_source().replace('PublicPage','PublicPage as Hidden'))
 with pytest.raises(ValueError,match='PublicPage'):verify_entrypoint(p)

def test_build_paths_use_shared_generator():
 root=Path(__file__).resolve().parents[1]
 for name in ('pipeline.py','site_workers.py'):
  tree=ast.parse((root/name).read_text())
  assert any(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='entrypoint_source' for n in ast.walk(tree))
