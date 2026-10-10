import asyncio
from unittest.mock import AsyncMock,patch
from test_media_management_step2 import fixture,register
run=asyncio.run

def test_worker_direct_query_matches_local_and_one_roundtrip(fixture):
 c,r=fixture;row=register(r,status='active')
 for key in (None,row['object_key']):
  run(r.sql.batch([('UPDATE site_settings SET logo_key=?',(key,))]))
  r.media.kind='local';expected=run(r.media.public_reference(row))
  r.media.kind='r2'
  with patch.object(r.sql,'query',wraps=r.sql.query) as query,patch.object(r.media.references,'public_body_reference',new=AsyncMock(return_value=False)) as body:
   assert run(r.media.public_reference(row))==expected
   assert query.call_count==1
   statement,params=query.call_args.args
   assert 'EXISTS(' in statement and 'LIMIT 1' in statement
   assert len(params)<100
   assert body.call_count==(0 if key else 1)

def test_worker_preserves_body_validator_and_trash(fixture):
 c,r=fixture;row=register(r,status='active');r.media.kind='r2'
 for result in (False,True):
  with patch.object(r.media.references,'public_body_reference',new=AsyncMock(return_value=result)) as body:
   assert run(r.media.public_reference(row)) is result
   body.assert_awaited_once_with(row['uid'])
 row['status']='trash'
 with patch.object(r.sql,'query',new=AsyncMock()) as query:
  assert run(r.media.public_reference(row)) is False
  query.assert_not_called()

def test_body_semantics_stay_identical_on_both_platforms(fixture):
 c,r=fixture;row=register(r,status='active');uid=row['uid']
 run(r.sql.batch([("INSERT INTO news(uid,title,slug,content_format,visibility,published_at) VALUES('cache-news','Cache','cache-news','html','public','2020-01-01T00:00:00.000Z')",())]))
 for fmt,body,visibility,want in [('html','<p>/media/'+uid+'</p>','public',False),('html','<img src="/media/'+uid+'">','public',True),('html','<img src="/media/'+uid+'">','hidden',False),('markdown','![image](/media/'+uid+')','public',True)]:
  run(r.sql.batch([('UPDATE news SET content_format=?,content=?,visibility=? WHERE uid=?',(fmt,body,visibility,'cache-news'))]))
  for kind in ('local','r2'):
   r.media.kind=kind;assert run(r.media.public_reference(row)) is want
