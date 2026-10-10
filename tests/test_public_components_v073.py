import asyncio
from test_accounts_regression import fixture
run=asyncio.run

def test_worker_islands_and_local_unchanged(fixture):
 c,r=fixture
 run(r.sql.batch([("INSERT INTO projects(uid,name,visibility,principal,amount,members) VALUES('island','Project','public','PRIVATE-PI','123.45','PRIVATE-MEMBERS')",())]))
 local=c.get('/en/projects').text
 assert 'PRIVATE-PI' in local and 'data-public-session' not in local
 r.kind='r2';r.worker_cache_mode='simple';r.public_request_cache=False
 worker=c.get('/en/projects').text
 assert 'data-public-session' in worker and 'public-session.js?v=0.16.076' in worker
 assert 'data-project-private="island"' in worker
 assert 'PRIVATE-PI' not in worker and 'PRIVATE-MEMBERS' not in worker and '1,234,500' not in worker
 assert 'name="_csrf"' not in worker
 fragment=c.get('/en/projects',headers={'X-Public-Fragment':'1'}).json()['html']
 assert 'data-project-private="island"' in fragment and 'PRIVATE-PI' not in fragment
 data=c.get('/api/public/admin-project-fields?uid=island&lang=en').json()
 assert data['projects'][0]['amount_display']=='CNY 1,234,500'
 assert 'data-public-session' not in c.get('/en/contact').text
