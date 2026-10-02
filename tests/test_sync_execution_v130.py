import asyncio,json
from pathlib import Path
import pytest
from backend.app.native import site_sync as core,site_sync_tasks as tasks,site_sync_proposals as proposals
from backend.app.native.site_sync_media import serve
from backend.app.native.catalog import Error
from tests.test_site_sync_v121 import pair,seed_media,finish
from tests.test_site_sync_v122 import peers
run=asyncio.run

def test_media_ranges_read_one_record_and_detect_metadata_change(pair,monkeypatch):
 api,_,ra,rb,*_=pair
 raw=Path('tests/fixtures/media/sample.jpg').read_bytes();uid='b'*32
 seed_media(rb,uid,'image.jpg',raw)
 async def forbidden(*a):raise AssertionError('global scan forbidden')
 monkeypatch.setattr(core,'revision',forbidden)
 queries=[];original=rb.sql.query
 async def query(sql,args=()):queries.append(sql);return await original(sql,args)
 monkeypatch.setattr(rb.sql,'query',query)
 head=run(serve(rb,{'op':'media-head','uid':uid}));queries.clear()
 request={'op':'media-range','uid':uid,'version':head['version'],'record_version':head['record_version'],'offset':0}
 assert run(serve(rb,request))['size']==len(raw)
 assert len(queries)==1 and 'WHERE uid=?' in queries[0]
 run(rb.sql.batch([("UPDATE media_assets SET title='changed' WHERE uid=?",(uid,))]))
 with pytest.raises(Error,match='登记已变化'):run(serve(rb,request))
 assert run(serve(rb,{'op':'media-record','uid':'a'*32}))['exists'] is False

def test_commit_checks_are_paged_and_reuse_local_inventory(pair,monkeypatch):
 api,preview,ra,rb,*_=pair
 uid=preview(['students'],lambda i:i['action']=='add')
 original=core.revision;calls=[]
 async def counted(sql):
  calls.append(sql)
  assert sql is not ra.sql,'local commit must reuse restore inventory'
  return await original(sql)
 monkeypatch.setattr(core,'revision',counted)
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'})
 assert calls==[]
 result=api('pull-tick',{'uid':uid},drain=False)
 assert result['execution']['phase']=='verify-commit' and not result['execution']['committed']
 for _ in range(100):
  result=api('pull-tick',{'uid':uid},drain=False)
  if result['execution']['phase']=='commit':break
 assert calls==[] and not result['execution']['committed']
 result=api('pull-tick',{'uid':uid},drain=False)
 assert result['execution']['committed'] and calls==[rb.sql]
 finish(api,uid)

def test_proposal_waits_for_check_and_can_resume_without_global_scan(peers,monkeypatch):
 api,b,preview,_,ra,rb,*_=peers
 uid=preview(['students'],lambda i:i['action']=='add',direction='push')
 async def forbidden(*a):raise AssertionError('global scan forbidden')
 monkeypatch.setattr(core,'revision',forbidden)
 first=api('proposal-send',{'uid':uid},drain=False)
 assert first['checking'] is True and b('proposal-inbox')['proposal'] is None
 saved=run(tasks.get(ra.sql,uid))['state']['proposal_check']['table_index']
 assert saved==1
 second=api('proposal-send',{'uid':uid},drain=False)
 assert second['checking'] is True
 assert run(tasks.get(ra.sql,uid))['state']['proposal_check']['table_index']==2
 receipt=api('proposal-send',{'uid':uid})['outgoing']
 assert receipt['status']=='pending'
 assert len(run(rb.sql.query('SELECT uid FROM students')))==3

def test_reappeared_source_media_prevents_local_purge(pair):
 api,preview,ra,rb,*_=pair
 raw=Path('tests/fixtures/media/sample.jpg').read_bytes();uid='a'*32
 seed_media(ra,uid,'old.jpg',raw)
 job=preview(['media_assets']);api('pull-begin',{'uid':job,'confirmation':'从对端同步到本站'})
 api('pull-tick',{'uid':job});result=api('pull-tick',{'uid':job})
 assert result['execution']['committed']
 seed_media(rb,uid,'old.jpg',raw)
 response=api('pull-tick',{'uid':job},ok=False)
 assert response.status_code==409 and '来源重新出现' in response.json()['error']
 assert run(ra.media_store.get('old.jpg'))==raw
