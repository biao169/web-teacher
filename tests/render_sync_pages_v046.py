"""Render authenticated fixture pages for DOM interaction tests; no production access."""
import json,sys
from pathlib import Path
from fastapi.testclient import TestClient
from backend.app.native.web import create_app
from site_sync.tests_website import test_integration as fixture
f=fixture.IntegrationTests();f.setUp()
try:
 with TestClient(create_app(lambda req:f.target),base_url=f.target.config.origin) as c:
  c.cookies.set(f.target.config.name('session'),'test-token')
  data={'pages':{p:c.get('/admin/site-sync?section='+p).text for p in ('tasks','create','schedules','connection','settings')},'options':c.get('/admin/site-sync/api/options').json()}
  Path(sys.argv[1]).write_text(json.dumps(data,ensure_ascii=False))
finally:f.tearDown()
