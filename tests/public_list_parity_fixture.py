"""Disposable SQL oracle for browser list semantics, never production data."""
import json,tempfile,sys
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parents[1]))
from pathlib import Path
from list_fixture import client_at
from test_translation_regression import source,run,cache
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from backend.app.native.catalog import TITLE
from backend.app.native.public_read_model import build,SUPPORTED
from backend.app.native.public_data import public_listing
with tempfile.TemporaryDirectory() as folder:
 client,r=client_at(Path(folder));r.auth=Auth(r.sql,r.passwords);r.content=Content(r.sql,r.auth);r.p=run(r.auth.principal(client.cookies.get('ts_session')));r.public_components=True
 result=[]
 for table in SUPPORTED:
  rows=[]
  for i in range(23):
   rows.append(source(r,table,TITLE[table],f'姓名 {i} literal%_\\',sort_order=i))
  for lang in ('zh','en'):
   data=run(build(r,table,lang));cases=[]
   for query in ({},{'direction':'desc'},{'page':'2','size':'20'},{'page':'999','size':'50'},{'q':'literal%_\\'},{'q':'姓名 2'},{'f.uid':rows[5]['uid']},{'q':'Missing'}):
    page=run(public_listing(r,table,query));cases.append({'query':query,'uids':[row['uid'] for row in page['rows']],'total':page['total'],'page':page['page']})
   result.append({'table':table,'lang':lang,'model':data,'cases':cases})
 client.close();print(json.dumps(result,ensure_ascii=False,separators=(',',':')))
