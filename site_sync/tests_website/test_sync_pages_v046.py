"""Each internal page is rendered independently by the shared authenticated route."""
import asyncio
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from backend.app.native.web import create_app
from site_sync.tests_website import test_integration as fixtures

@pytest.fixture
def client():
 f=fixtures.IntegrationTests();f.setUp()
 with TestClient(create_app(lambda req:f.target),base_url=f.target.config.origin) as c:
  c.cookies.set(f.target.config.name('session'),'test-token')
  try:yield c,f.target
  finally:f.tearDown()

@pytest.mark.parametrize('page,yes,no',[
 ('tasks','data-tasks','data-create'),('create','data-create','data-tasks'),
 ('schedules','data-schedules','data-tasks'),('connection','data-sync-probe','data-create'),
 ('settings','data-defaults','data-tasks')])
def test_pages_are_separate_read_only_and_share_admin_shell(client,page,yes,no):
 c,r=client
 with patch('site_sync.integration.host.runtime',side_effect=AssertionError('page must not execute sync')):
  response=c.get('/admin/site-sync?section='+page)
 assert response.status_code==200,response.text[:300]
 assert yes in response.text and no not in response.text
 assert 'data-sync-operation' in response.text and 'native-audit-dialog' in response.text
 assert '同步运行控制' not in response.text and 'control.mjs' not in response.text
 assert response.text.count('aria-current="page"')>=1
 assert 'href="/admin/site-sync?section='+page+'" aria-current="page"' in response.text
 assert len(asyncio.run(r.sql.query('SELECT task_id FROM sync_tasks')))==0
 assert '6a'*32 not in response.text
 assert ('data-auto-refresh' in response.text)==(page in ('tasks','schedules'))

def test_default_and_invalid_page_and_session(client):
 c,r=client
 assert 'data-tasks' in c.get('/admin/site-sync').text
 assert c.get('/admin/site-sync?section=../../unknown').status_code==404
 c.cookies.clear()
 for page in ('tasks','create','schedules','connection','settings'):
  assert c.get('/admin/site-sync?section='+page,follow_redirects=False).status_code in (401,403,303)
