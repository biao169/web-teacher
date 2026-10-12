"""Disposable HTTP fixture for real Public browser checks; never user data."""
import sys,tempfile,asyncio
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));sys.path.insert(0,str(Path(__file__).resolve().parent))
from list_fixture import client_at
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from test_public_home_step2 import add
from test_translation_regression import source
from backend.app.native.navigation import build_public_path
import uvicorn
with tempfile.TemporaryDirectory(prefix='teacher-browser-') as folder:
 c,r=client_at(Path(folder));r.auth=Auth(r.sql,r.passwords);r.content=Content(r.sql,r.auth);r.p=asyncio.run(r.auth.principal(c.cookies.get('ts_session')))
 async def seed():
  logo=Path('frontend/shared/static/site-logo.png').read_bytes();await r.media_store.put('browser-logo.png',logo)
  await r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status) VALUES (?,?,?,?,?,?,?)',('browser-logo','browser-logo.png','Logo','image/png',len(logo),'local','active')),('UPDATE site_settings SET logo_key=?,site_name=?,site_name_en=? WHERE is_active=1',('browser-logo.png','教师与课题组网站','Teacher and Team')),('UPDATE auth_users SET display_name=? WHERE username=?',('A long account display name for header validation','list-test-admin'))])
 asyncio.run(seed())
 asyncio.run(r.content.save('navigation_items',r.p,{'title':'Featured papers','title_en':'Featured papers','url_name':'featured','kind':'route','location':'header','visibility':'public','enabled':1,'path':build_public_path('publications',[{'field':'is_featured','operator':'eq','value':'1'}])}))
 for i in range(3):source(r,'profiles','name','Public Teacher '+str(i),title='Professor',bio='Research and teaching.',avatar_key='browser-logo.png')
 for i in range(24):add(r,'publications','Paper '+str(i),is_featured=int(i%2==0),year=2020+i%3,sort_order=i)
 uvicorn.run(c.app,host='127.0.0.1',port=8765,log_level='warning');c.close()
