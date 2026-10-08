"""Real local website routes/storage; injected failure is not a cloud limit test."""
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock,patch
import pytest
from fastapi.testclient import TestClient
from backend.app.native.web import create_app
from site_sync.tests_website import test_integration as fixture

@pytest.fixture
def website():
    pair=fixture.IntegrationTests();pair.setUp()
    try:
        r=pair.target
        with TestClient(create_app(lambda req:r),base_url=r.config.origin,raise_server_exceptions=False) as client:
            client.cookies.set(r.config.name('session'),'test-token')
            yield client,r
    finally:pair.tearDown()

def test_failed_upload_then_pages_and_second_upload_recover(website):
    client,r=website
    headers={'origin':r.config.origin,'x-csrf-token':r.p['csrf'],'x-filename':'acceptance.png'}
    original=(Path(__file__).resolve().parents[2]/'tests/fixtures/media/sample.png').read_bytes()
    data=original+b'\0'*(900*1024-len(original))
    with patch.object(r.media_store,'put',new=AsyncMock(side_effect=OSError('injected storage failure'))):
        failed=client.post('/api/admin/media/upload/file',headers=headers,content=data)
        assert failed.status_code>=500
    assert asyncio.run(r.sql.query("SELECT uid FROM admin_mutation_guards WHERE uid='media:upload'"))==[]
    assert asyncio.run(r.sql.query('SELECT uid FROM media_assets'))==[]
    for path in ['/en','/admin/site-sync','/admin/media_assets']:
        response=client.get(path);assert response.status_code==200,(path,response.text[:150])
    saved=client.post('/api/admin/media/upload/file',headers=headers,content=data)
    assert saved.status_code==200,saved.text
    uid=saved.json()['uid'];response=client.get('/api/admin/media/'+uid+'/content?download=1')
    assert response.status_code==200 and response.content==data
    assert asyncio.run(r.sql.query("SELECT uid FROM admin_mutation_guards WHERE uid='media:upload'"))==[]
