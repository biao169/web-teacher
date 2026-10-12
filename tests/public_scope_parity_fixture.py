"""Actual SQLite fixed predicates versus browser matching of shared module indexes."""
import json,tempfile,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from list_fixture import client_at
from test_translation_regression import source,run
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from backend.app.native.catalog import TITLE
from backend.app.native.public_read_model import build,SUPPORTED
from backend.app.native.public_data import public_listing
from backend.app.native.filtering import PUBLIC_FILTER_FIELDS,normalize_conditions
from backend.app.native.public_navigation import browser_scope
with tempfile.TemporaryDirectory() as folder:
 c,r=client_at(Path(folder));r.auth=Auth(r.sql,r.passwords);r.content=Content(r.sql,r.auth);r.p=run(r.auth.principal(c.cookies.get('ts_session')))
 result=[]
 for table in SUPPORTED:
  rows=[]
  for i in range(23):
   extra={'sort_order':i,'is_featured':int(i%2==0)}
   if table=='profiles':extra.update(bio='X'*2200+(' needle' if i%2==0 else ''),title='Professor' if i%2==0 else 'Lecturer')
   if table=='projects':extra['project_role']='host' if i%4==0 else '主持'
   rows.append(source(r,table,TITLE[table],('AI literal%_\\ ' if i%2==0 else 'Other ')+str(i),**extra))
  variants=[[{'field':TITLE[table],'operator':'contains','value':'ai literal%_\\'}],
            [{'field':TITLE[table],'operator':'eq','value':rows[2][TITLE[table]]}]]
  if 'is_featured' in PUBLIC_FILTER_FIELDS[table]:variants.append([{'field':'is_featured','operator':'eq','value':'1'}])
  if table=='profiles':variants.append([{'field':'bio','operator':'contains','value':'needle'}])
  if table=='projects':variants.append([{'field':'project_role','operator':'eq','value':'host'}])
  for lang in ('zh','en'):
   model=run(build(r,table,lang))
   for conditions in variants:
    conditions=normalize_conditions(table,conditions,public=True)
    scope=browser_scope({'public':True,'slug':'selected','stamp':'a'*32,'table':table,'conditions':conditions})
    cases=[]
    for query in ({},{'direction':'desc'},{'page':'2'},{'size':'20'},{'page':'999'},{'q':'Other'},{'q':'literal%_\\'},{'f.uid':rows[1]['uid']}):
     page=run(public_listing(r,table,query,fixed_conditions=conditions));cases.append({'query':query,'uids':[row['uid'] for row in page['rows']],'total':page['total'],'page':page['page']})
    result.append({'table':table,'lang':lang,'scope':scope,'model':model,'cases':cases})
 c.close();print(json.dumps(result,ensure_ascii=False,separators=(',',':')))
