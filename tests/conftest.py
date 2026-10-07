"""Keep unsupported Windows symlink tests explicit rather than failing unrelated suites."""
import os
from pathlib import Path
import pytest

@pytest.fixture(autouse=True)
def windows_symlink_capability(monkeypatch):
    if os.name!='nt':return
    original=Path.symlink_to
    def create(self,*args,**kwargs):
        try:return original(self,*args,**kwargs)
        except OSError as exc:
            if getattr(exc,'winerror',None)==1314:
                pytest.skip('Windows symlink privilege unavailable; enable Developer Mode or run this test elevated')
            raise
    monkeypatch.setattr(Path,'symlink_to',create)
