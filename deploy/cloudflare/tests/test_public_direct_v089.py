"""Regression guard: Public dispatch has no Worker recovery wrapper."""
import asyncio,ast
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from test_startup_lazy import entry

@pytest.mark.parametrize('path',['/en','/zh'])
@pytest.mark.parametrize('status',[200,304,500,503])
def test_public_returns_dispatch_response(entry,monkeypatch,path,status):
 response=SimpleNamespace(status=status,headers={},body=None)
 dispatch=AsyncMock(return_value=response)
 monkeypatch.setattr(entry,'dispatch',dispatch)
 obj=entry.Default();obj.env=SimpleNamespace();obj.ctx=SimpleNamespace()
 request=SimpleNamespace(url='https://site.test'+path,method='GET',headers={})
 assert asyncio.run(entry.Default.fetch.__wrapped__(obj,request)) is response
 dispatch.assert_awaited_once()
 assert entry.application.application is None

def test_no_runtime_recovery_imports():
 root=Path(__file__).resolve().parents[1]/'runtime'
 for name in ('entrypoint.py','request_diagnostics.py','snapshot.py'):
  tree=ast.parse((root/name).read_text())
  for n in ast.walk(tree):
   if isinstance(n,ast.ImportFrom):
    assert not (n.module or '').endswith('public_recovery')
    assert all(x.name not in ('public_recovery','generated_public_recovery') for x in n.names)
