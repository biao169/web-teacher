"""D1/R2 adapter matrix: same bounded background engine as SQLite."""
from tests.test_sync_platform_v131 import pair,local_pair
from tests.test_sync_unified_v143 import test_scheduler_uses_incremental_and_one_write_per_tick as scheduled
from tests.test_site_sync_v123 import test_media_dependency_order_in_background as media

def test_scheduler_record_budget_across_adapters(pair,monkeypatch):scheduled(pair,monkeypatch)
def test_scheduler_media_dependency_across_adapters(pair):media(pair)

from tests.test_site_sync_v122 import peers
from tests.test_sync_unified_v143 import test_requested_review_and_subset_only as subset

def test_approval_subset_across_adapters(peers,monkeypatch):subset(peers,monkeypatch)
