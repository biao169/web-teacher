"""D1/R2 adapter simulations exercise the same incremental code as native SQLite."""
from tests.test_sync_platform_v131 import pair,local_pair
from tests.test_sync_incremental_v141 import replacement

def test_incremental_media_and_references_across_adapters(pair):
    replacement(pair)
    for r in pair[2:4]:
        if r.kind=='r2':
            assert max(r.sql.binding.batches)<=25
            from backend.app.native.site_sync_checkpoint import PROJECTION
            # Compact cursor aggregation is allowed; full business snapshot aggregation is not.
            assert not any('json_group_array' in sql and PROJECTION not in sql for sql in r.sql.binding.reads)
            assert not any(k.startswith('cache/site-sync/') for k in r.cache_store.bucket.objects)
