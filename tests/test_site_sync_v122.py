"""Proposal delivery never writes business rows; latest approval reuses the pull executor."""
import asyncio,json,re
import pytest
from tests.test_site_sync_v121 import pair,finish
from backend.app.native import site_sync as core,site_sync_transport as transport
run=asyncio.run

@pytest.fixture
def peers(pair):
 api,preview,ra,rb,a,b,network=pair
 page=b.get('/admin/data-tools/sync').text
 hb={'Accept':'application/json','Origin':str(b.base_url).rstrip('/'),'X-CSRF-Token':re.search('id="site-sync" data-csrf="([^"]+)"',page)[1]}
 def api_b(op,data=None,ok=True):return api(op,data,client=b,h=hb,ok=ok)
 api_b('save',{'origin':'https://a.example.org','secret':'s'*64,'enabled':True,'allow_proposals':True})
 def review(request_id):
  job=api_b('proposal-review',{'request_id':request_id})
  for _ in range(600):
   result=api_b('advance',{'uid':job['uid']})
   if result['status']=='ready':return result
  pytest.fail('Review did not finish')
 return api,api_b,preview,review,ra,rb,a,b,network

def approve(api_b,job):
 result=api_b('proposal-approve',{'uid':job,'confirmation':'同意对端推送'})
 if result['execution']['phase']!='done':finish(api_b,job)
 return result

def payload(r,uid):return json.loads(run(r.sql.query('SELECT state FROM sync_tasks WHERE uid=?',(uid,)))[0]['state'])['outgoing']['payload']

def test_delivery_approval_and_result(peers):
 api,b,preview,review,ra,rb,*_=peers
 uid=preview(['students'],lambda x:x['action']=='add',direction='push')
 before_a=run(core.revision(ra.sql));before_b=run(core.revision(rb.sql))
 receipt=api('proposal-send',{'uid':uid})['outgoing'];assert receipt['status']=='pending'
 assert run(core.revision(rb.sql))==before_b
 proposal=b('proposal-inbox')['proposal'];assert proposal['request_id']==receipt['request_id']
 job=review(proposal['request_id']);assert job['approval']['ready']
 assert len(job['items'])==3 and all(x['action']=='add' for x in job['items'])
 assert b('pull-begin',{'uid':job['uid'],'confirmation':'从对端同步到本站'},ok=False).status_code==409
 assert run(core.revision(rb.sql))==before_b
 approve(b,job['uid'])
 assert len(run(rb.sql.query('SELECT uid FROM students')))==6
 assert run(core.revision(ra.sql))==before_a
 status=api('proposal-status',{'uid':uid})['outgoing']
 assert status['status']=='approved' and status['phase']=='done' and status['committed'] is True

def test_latest_replaces_old_selection_and_old_review_is_rejected(peers):
 api,b,preview,review,ra,rb,a,client_b,_=peers
 ids=[r['uid'] for r in run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))]
 uid=preview(['students'],lambda x:x['uid']==ids[0],direction='push')
 first=api('proposal-send',{'uid':uid})['outgoing'];old_payload=payload(ra,uid)
 old_review=review(first['request_id'])
 api('select',{'uid':uid,'ids':['students:'+ids[1]]})
 second=api('proposal-send',{'uid':uid})['outgoing'];assert second['sequence']>first['sequence']
 assert b('proposal-approve',{'uid':old_review['uid'],'confirmation':'同意对端推送'},ok=False).status_code==409
 # A delayed copy of revision 1 cannot restore revision 1 or combine selections.
 v=client_b.post('/api/site-sync/peer',headers={'Accept':'application/json'},json=transport.envelope('s'*64,old_payload))
 assert v.status_code==200
 assert b('proposal-inbox')['proposal']['request_id']==second['request_id']
 job=review(second['request_id']);assert {x['uid'] for x in job['items']}=={ids[1]}
 approve(b,job['uid'])
 assert not run(rb.sql.query('SELECT uid FROM students WHERE uid=?',(ids[0],)))
 assert run(rb.sql.query('SELECT uid FROM students WHERE uid=?',(ids[1],)))

def test_waiting_request_reviews_latest_content_and_new_change_blocks_commit(peers):
 api,b,preview,review,ra,rb,*_=peers
 uid=preview(['students'],lambda x:x['action']=='add',direction='push');receipt=api('proposal-send',{'uid':uid})['outgoing']
 student=run(ra.sql.query('SELECT uid FROM students LIMIT 1'))[0]['uid']
 run(ra.sql.batch([("UPDATE students SET name='Latest',updated_at='2026-10-02T00:00:00.000Z' WHERE uid=?",(student,))]))
 job=review(receipt['request_id']);assert any(x['title']=='Latest' for x in job['items'])
 run(ra.sql.batch([("UPDATE students SET name='Changed again',updated_at='2026-10-03T00:00:00.000Z' WHERE uid=?",(student,))]))
 assert b('proposal-approve',{'uid':job['uid'],'confirmation':'同意对端推送'},ok=False).status_code==409
 assert len(run(rb.sql.query('SELECT uid FROM students')))==3
 job=review(receipt['request_id']);approve(b,job['uid'])
 assert run(rb.sql.query('SELECT name FROM students WHERE uid=?',(student,)))[0]['name']=='Changed again'

def test_approved_task_survives_new_pending_and_rejection_is_not_replayed(peers):
 api,b,preview,review,ra,rb,a,client_b,_=peers
 ids=[r['uid'] for r in run(ra.sql.query('SELECT uid FROM students ORDER BY uid'))]
 uid=preview(['students'],lambda x:x['uid']==ids[0],direction='push');one=api('proposal-send',{'uid':uid})['outgoing']
 job=review(one['request_id']);b('proposal-approve',{'uid':job['uid'],'confirmation':'同意对端推送'})
 api('select',{'uid':uid,'ids':['students:'+ids[1]]});two=api('proposal-send',{'uid':uid})['outgoing']
 finish(b,job['uid'])
 assert b('proposal-inbox')['proposal']['request_id']==two['request_id']
 assert run(rb.sql.query('SELECT uid FROM students WHERE uid=?',(ids[0],)))
 assert not run(rb.sql.query('SELECT uid FROM students WHERE uid=?',(ids[1],)))
 b('proposal-reject',{'request_id':two['request_id']})
 v=client_b.post('/api/site-sync/peer',headers={'Accept':'application/json'},json=transport.envelope('s'*64,payload(ra,uid)))
 assert v.status_code==200
 assert b('proposal-inbox')['proposal']['status']=='rejected'

def test_lost_delivery_ack_reuses_sequence(peers,monkeypatch):
 api,b,preview,review,ra,rb,a,client_b,network=peers
 from backend.app.native.catalog import Error
 uid=preview(['students'],lambda x:x['action']=='add',direction='push');failed=False
 async def lost(kind,url,data):
  nonlocal failed
  result=await network(kind,url,data)
  if data['payload']['op']=='proposal-submit' and not failed:failed=True;raise Error('lost response',502)
  return result
 monkeypatch.setattr(transport,'post',lost)
 assert api('proposal-send',{'uid':uid},ok=False).status_code==502
 first=b('proposal-inbox')['proposal'];out=api('proposal-send',{'uid':uid})['outgoing']
 assert out['sequence']==first['sequence'] and out['request_id']==first['request_id']
 assert len(run(rb.sql.query('SELECT uid FROM students')))==3

def test_noop_review_can_be_acknowledged_without_business_write(peers):
 api,b,preview,review,ra,rb,*_=peers
 row=run(ra.sql.query('SELECT * FROM students ORDER BY uid LIMIT 1'))[0]
 uid=preview(['students'],lambda x:x['uid']==row['uid'],direction='push');sent=api('proposal-send',{'uid':uid})['outgoing']
 cols=[k for k in row if k!='id']
 run(rb.sql.batch([('INSERT INTO students('+','.join(cols)+') VALUES('+','.join('?' for _ in cols)+')',tuple(row[k] for k in cols))]))
 before=run(core.revision(rb.sql));job=review(sent['request_id'])
 assert job['items']==[] and job['approval']['skipped']==1
 result=approve(b,job['uid']);assert result['execution']['phase']=='done' and not result['execution']['committed']
 assert run(core.revision(rb.sql))==before
 assert api('proposal-status',{'uid':uid})['outgoing']['phase']=='done'

def test_receiver_opt_in_required_and_peer_cannot_approve(peers):
 api,b,preview,review,ra,rb,a,client_b,_=peers
 b('save',{'origin':'https://a.example.org','secret':'s'*64,'enabled':True,'allow_proposals':False})
 uid=preview(['students'],lambda x:x['action']=='add',direction='push')
 assert api('proposal-send',{'uid':uid},ok=False).status_code==409
 peer=run(rb.sql.query('SELECT local_id FROM sync_peers'))[0]
 data={'op':'proposal-approve','schema':core.schema(),'protocol':core.PROTOCOL,'target_id':peer['local_id']}
 v=client_b.post('/api/site-sync/peer',headers={'Accept':'application/json'},json=transport.envelope('s'*64,data))
 assert v.status_code==404
 assert len(run(rb.sql.query('SELECT uid FROM students')))==3
