"""Missing source files are errors, absent source records are not deletion orders."""
import asyncio
from pathlib import Path
from tests.test_site_sync_v121 import pair,seed_media,finish
from backend.app.native import site_sync_tasks as tasks
run=asyncio.run

def test_missing_source_file_stops_before_content_commit_and_can_resume(pair):
 api,preview,ra,rb,*_=pair
 raw=Path('tests/fixtures/media/sample.jpg').read_bytes();key='b'*32
 seed_media(rb,key,'new.jpg',raw)
 run(rb.sql.batch([("INSERT INTO profiles(uid,name,avatar_key) VALUES('new-teacher','Teacher','new.jpg')",())]))
 uid=preview(['profiles'])
 api('pull-begin',{'uid':uid,'confirmation':'从对端同步到本站'})
 run(rb.media_store.delete('new.jpg'))
 response=api('pull-tick',{'uid':uid},ok=False)
 assert response.status_code==409 and '来源媒体缺失' in response.json()['error']
 state=run(tasks.get(ra.sql,uid))['state']['execution']
 assert state['phase']=='download' and not state['committed']
 assert not run(ra.sql.query("SELECT uid FROM profiles WHERE uid='new-teacher'"))
 run(rb.media_store.put('new.jpg',raw))
 finish(api,uid)
 assert run(ra.sql.query("SELECT avatar_key FROM profiles WHERE uid='new-teacher'"))[0]['avatar_key']=='new.jpg'
 assert run(ra.media_store.get('new.jpg'))==raw
