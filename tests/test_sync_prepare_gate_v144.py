"""Unprepared parents/children remain read-only; only confirmed prepared child can send."""
from tests.test_site_sync_v121 import pair
from tests.test_site_sync_v122 import peers
from tests.test_sync_preview_v140 import preview,pages

def test_parent_and_unfinished_child_cannot_send(peers):
    api,b,*_=peers
    parent=preview(api,['students'],'push')['uid']
    ident=next(v['id'] for v in pages(api,parent) if v['action']=='add')
    api('select',{'uid':parent,'ids':[ident]})
    child=api('prepare-preview',{'uid':parent})['uid']
    for uid in (parent,child):
        error=api('proposal-send',{'uid':uid},ok=False)
        assert error.status_code==409 and error.json()['code']=='sync_prepare_required'
    assert b('proposal-inbox')['proposal'] is None
    for _ in range(100):
        result=api('advance',{'uid':child})
        if result['status']=='ready':break
    assert result['prepared'] and api('get',{'uid':parent})['prepared_uid']==child
    api('resume',{'uid':parent})  # Explicit retry after the earlier permanent preparation error.
    assert api('proposal-send',{'uid':parent},ok=False).json()['code']=='sync_prepare_required'
    assert b('proposal-inbox')['proposal'] is None
    assert api('proposal-send',{'uid':child})['outgoing']['status']=='pending'
