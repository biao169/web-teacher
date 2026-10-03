"""Exercise binary multi-chunk retry/publication with actual D1/R2 adapters and mock bindings."""
from tests.test_sync_platform_v131 import pair,local_pair
from tests import test_sync_binary_v142 as binary

def test_multichunk_across_adapters(pair,monkeypatch):
    binary.test_multichunk_resume_and_legacy_fallback(pair,monkeypatch,False)
