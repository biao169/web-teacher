"""Media lists must never inspect references until explicitly requested."""
from unittest.mock import patch
from test_media_management_step2 import fixture, register
from backend.app.native.media_references import MediaReferences


def test_list_does_not_compute_usage_but_locations_does(fixture):
    client,r=fixture
    row=register(r,status='active')
    original=MediaReferences.summaries
    calls=[]
    async def tracked(self,principal,rows,**kwargs):
        calls.append([v['uid'] for v in rows])
        return await original(self,principal,rows,**kwargs)
    with patch.object(MediaReferences,'summaries',tracked):
        for url in ('/admin/media_assets','/admin/media_assets?f.status=trash'):
            response=client.get(url)
            assert response.status_code==200
        assert calls==[]
        response=client.get('/admin/media_assets')
        assert '点击查看' in response.text
        assert '○ 暂未使用' not in response.text
        response=client.get('/api/admin/media/'+row['uid']+'/locations')
        assert response.status_code==200,response.text
        assert calls==[[row['uid']]]
        assert '暂未使用' in response.json()['html']
