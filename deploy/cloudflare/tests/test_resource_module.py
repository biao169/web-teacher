"""Generated factory reuses canonical configuration without a hidden application."""
import importlib.util
from pathlib import Path
import sys
from types import ModuleType
from unittest.mock import Mock
import pytest
from test_startup_lazy import entry
from resource_module import source, generate, verify

ROOT = Path(__file__).resolve().parents[3]


def test_generated_import_and_build_create_exactly_one_app(tmp_path, monkeypatch, entry):
    import backend.app.native.web_public as web
    import worker_runtime.setup as setup
    import worker_runtime.transfer as transfer
    resources = ModuleType('generated_resources')
    resources.TEMPLATES = {}
    resources.TRANSFER_TEMPLATES = {}
    resources.TRANSFER_CATALOG = '{}'
    monkeypatch.setitem(sys.modules, 'generated_resources', resources)
    (tmp_path/'src/worker_runtime').mkdir(parents=True)
    generate(ROOT, tmp_path)
    verify(ROOT, tmp_path)
    counter = Mock(wraps=web.create_public_app)
    monkeypatch.setattr(web, 'create_public_app', counter)
    spec = importlib.util.spec_from_file_location('worker_runtime.resources', tmp_path/'src/worker_runtime/resources.py')
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, module)
    spec.loader.exec_module(module)
    assert counter.call_count == 0
    assert not hasattr(module, 'app') and not hasattr(module, 'Default')
    # Installation details have independent real-route coverage.
    monkeypatch.setattr(setup, 'install', Mock())
    monkeypatch.setattr(transfer, 'install', Mock())
    monkeypatch.setitem(sys.modules,'worker_runtime.public_resources',module)
    entry.build_application()
    assert counter.call_count == 1
    assert counter.call_args.args == (module.resource_factory,)


def test_factory_text_is_canonical():
    text = (ROOT/'backend/entrypoints/worker.py').read_text()
    assert source(ROOT) == text[:text.index('app=create_app(resource_factory)')]


def test_changed_bootstrap_is_rejected(tmp_path):
    path = tmp_path/'backend/entrypoints/worker.py'
    path.parent.mkdir(parents=True)
    path.write_text((ROOT/'backend/entrypoints/worker.py').read_text() + '\napp.extra_setup()\n')
    with pytest.raises(ValueError, match='bootstrap changed'):
        source(tmp_path)


def test_modified_generated_factory_is_rejected(tmp_path):
    (tmp_path/'src/worker_runtime').mkdir(parents=True)
    generate(ROOT, tmp_path)
    with (tmp_path/'src/worker_runtime/resources.py').open('a') as f:
        f.write('\napp=create_app(resource_factory)\n')
    with pytest.raises(ValueError, match='differ'):
        verify(ROOT, tmp_path)
