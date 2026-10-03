from tests.test_sync_platform_v131 import pair,local_pair
from tests import test_sync_history_v145 as history

def test_bounded_history_on_adapters(pair):
    history.test_manual_prunes_at_most_twenty_details_and_never_business(pair)
    r=pair[3];history.seed(r,'other',age=8*86400,items=1)
    assert history.run(history.history.prune(r.sql))['deleted']
