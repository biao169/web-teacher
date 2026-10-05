"""Production D1 adapter, simulated binding; not live quota acceptance."""
from tests.test_sync_platform_v131 import pair,local_pair
from tests.test_sync_fields_v176 import child,complete,run
from backend.app.native.site_sync_analysis import get
from backend.app.native import site_sync_tasks as tasks


def test_long_field_across_local_worker_pairs(pair):
    text='<p>'+('中文🙂"\\'*600)+'</p>'
    uid=child(pair,text);complete(pair,uid)
    assert run(get(pair[2].sql,uid,'remote','news','long'))['content']==text
    assert run(tasks.get(pair[2].sql,uid))['state']['prepared']
    for r in pair[2:4]:
        if r.kind=='r2':assert max(r.sql.binding.batches)<=25
