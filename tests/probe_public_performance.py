"""Bounded anonymous HTTP probe, or disposable SQL/render baseline. Never a runtime monitor."""
import argparse,asyncio,hashlib,json,re,sys,tempfile,time,tomllib,urllib.request,urllib.error,urllib.parse
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:sys.path.insert(0,str(ROOT))
HEADERS=('etag','cache-control','cloudflare-cdn-cache-control','vary','cf-cache-status','age','x-teacher-render-ok','x-teacher-data-ok','x-public-revision','x-teacher-release','x-request-id','x-teacher-error-code','cf-ray','content-type','location')
MAX_BODY=512*1024
MODES=('first','repeat','conditional')
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None

def samples(navs=()):
 """Keep online requests bounded: six original targets, plus at most four explicit nav slugs."""
 if len(navs)>4 or any(not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,79}',s) for s in navs):raise ValueError('nav: up to four unique configured URL names')
 result=[('/en','home'),('/en/projects','standard_list'),('/api/public/data/en/profiles','public_data'),('/api/public/data/zh/projects','public_data'),('/api/public/session-summary','identity'),('/api/public/data/en/unknown','invalid_data')]
 for slug in dict.fromkeys(navs):
  for lang in ('zh','en'):
   path='/'+lang+'/n/'+slug
   result.extend(((path,'fixed_base'),(path+'?direction=asc&size=10','fixed_query')))
 return result

def classification(status,headers):
 """Report observed edge status only; the first request is not necessarily a MISS."""
 value=headers.get('cf-cache-status','').upper()
 marked=headers.get('x-teacher-render-ok')=='1' or headers.get('x-teacher-data-ok')=='1'
 return {'edge_status':value or 'not_reported','success_marker':marked,
         'response_public':status in (200,304) and marked and headers.get('cache-control','').startswith('public,'),
         'no_store':headers.get('cache-control')=='no-store' and headers.get('cloudflare-cdn-cache-control')=='no-store'}

def probe(origin,expected,navs=()):
 opener=urllib.request.build_opener(NoRedirect());rows=[]
 for path,category in samples(navs):
  etag=None
  for mode in MODES:
   if mode=='conditional' and not etag:
    rows.append({'path':path,'category':category,'mode':mode,'status':'not_run','reason':'no ETag'});continue
   headers={'Accept':'application/json' if path.startswith('/api/') else 'text/html','User-Agent':'TeacherSite-ReadOnly-Acceptance/2'}
   if mode=='conditional':headers['If-None-Match']=etag
   start=time.perf_counter();row={'path':path,'category':category,'mode':mode}
   try:
    try:response=opener.open(urllib.request.Request(origin+path,headers=headers),timeout=15)
    except urllib.error.HTTPError as exc:response=exc
    with response:
     row.update(status=response.code,headers_ms=round((time.perf_counter()-start)*1000,2),headers={k:response.headers[k] for k in HEADERS if response.headers.get(k)})
     body=response.read(MAX_BODY+1);row['body_bytes']=len(body);row['body_limit_exceeded']=len(body)>MAX_BODY
     row['total_ms']=round((time.perf_counter()-start)*1000,2)
     row.update(classification(response.code,row['headers']))
     if mode=='first':etag=response.headers.get('etag')
   except (OSError,ValueError) as exc:row.update(status='transport_error',error_type=type(exc).__name__)
   rows.append(row)
 releases=sorted({x.get('headers',{}).get('x-teacher-release') for x in rows if x.get('headers',{}).get('x-teacher-release')})
 return {'origin':origin,'observed_releases':releases,'expected_release':expected,'release_match':bool(releases) and releases==[expected],'samples':rows}

class SQLCounter:
 """Test-only instrumentation. Reports fingerprints/counts, never SQL text or bind values."""
 def __init__(self,sql):
  self.sql=sql;self.query=sql.query;self.batch=sql.batch;self.reset()
 def reset(self):self.reads=0;self.writes=0;self.returned_rows=0;self.query_ms=0;self.shapes=Counter();self.exact=Counter();self.groups=Counter();self.shape_groups={}
 @staticmethod
 def group(sql):
  for name,word in [('translation','translation_cache'),('settings','site_settings'),('media','media_assets'),('navigation','navigation_items'),('revision','service_meta'),('auth','auth_sessions'),('student_rules','student_category_displays')]:
   if re.search(r'\b'+word+r'\b',sql,re.I):return name
  return 'content_or_other'
 async def counted_query(self,sql,args=()):
  shape=hashlib.sha256(' '.join(sql.split()).encode()).hexdigest()[:16]
  exact=hashlib.sha256((shape+json.dumps(args,ensure_ascii=True,sort_keys=True,default=str,separators=(',',':'))).encode()).hexdigest()[:16]
  group=self.group(sql);self.reads+=1;self.shapes[shape]+=1;self.exact[exact]+=1;self.groups[group]+=1;self.shape_groups[shape]=group
  start=time.perf_counter()
  try:
   rows=await self.query(sql,args);self.returned_rows+=len(rows);return rows
  finally:self.query_ms+=(time.perf_counter()-start)*1000
 async def counted_batch(self,statements):
  self.writes+=len(statements);return await self.batch(statements)
 def __enter__(self):self.sql.query=self.counted_query;self.sql.batch=self.counted_batch;return self
 def __exit__(self,*exc):self.sql.query=self.query;self.sql.batch=self.batch
 def report(self):
  return {'query_calls':self.reads,'batch_statements':self.writes,'returned_rows':self.returned_rows,'sqlite_query_wall_ms':round(self.query_ms,2),
          'unique_sql_shapes':len(self.shapes),'exact_duplicate_calls':sum(n-1 for n in self.exact.values()),'groups':dict(sorted(self.groups.items())),
          'repeated_shapes':[{'fingerprint':k,'group':self.shape_groups[k],'calls':n} for k,n in self.shapes.most_common(20) if n>1]}

def measure_local(client,sql,targets):
 """Actual ASGI/Jinja over disposable SQLite; no edge cache, so repeat/304 still execute code."""
 rows=[]
 with SQLCounter(sql) as counter:
  for path,category in targets:
   etag=None
   for mode in MODES:
    if mode=='conditional' and not etag:rows.append({'path':path,'category':category,'mode':mode,'status':'not_run','reason':'no ETag'});continue
    counter.reset();headers={'Accept':'application/json' if path.startswith('/api/') else 'text/html'}
    if mode=='conditional':headers['If-None-Match']=etag
    start=time.perf_counter();response=client.get(path,headers=headers,follow_redirects=False)
    measured={k:response.headers[k] for k in HEADERS if response.headers.get(k)}
    row={'path':path,'category':category,'mode':mode,'status':response.status_code,'headers':measured,'body_bytes':len(response.content),'asgi_wall_ms':round((time.perf_counter()-start)*1000,2),'sql':counter.report()}
    row.update(classification(response.status_code,measured));rows.append(row)
    if mode=='first':etag=response.headers.get('etag')
 return rows

def local_baseline():
 """Seed only a TemporaryDirectory through existing fixture/services; never Settings.from_env."""
 from list_fixture import client_at
 from backend.app.native.auth import Auth
 from backend.app.native.content import Content
 from backend.app.native.catalog import defaults,fields,TITLE
 from backend.app.native.navigation import build_public_path
 from backend.app.public_performance import PUBLIC_TABLES
 scenarios=[]
 with tempfile.TemporaryDirectory(prefix='teacher-public-baseline-') as folder:
  client,r=client_at(Path(folder));r.auth=Auth(r.sql,r.passwords);r.content=Content(r.sql,r.auth)
  r.p=asyncio.run(r.auth.principal(client.cookies.get(r.config.name('session'))))
  async def seed():
   logo=(ROOT/'frontend/shared/static/site-logo.png').read_bytes();await r.media_store.put('probe-logo.png',logo)
   await r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status) VALUES (?,?,?,?,?,?,?)',('probe-logo','probe-logo.png','Synthetic logo','image/png',len(logo),'local','active')),
                     ('UPDATE site_settings SET logo_key=?,site_name=?,hero_title=?,footer_text=? WHERE is_active=1',('probe-logo.png','合成教师网站','合成首页','合成页脚'))])
   for table in sorted(PUBLIC_TABLES):
    for i in range(12):
     values={k:v for k,v in defaults(table).items() if k in fields(table) and v is not None};values.update({TITLE[table]:'合成公开条目 '+str(i),'visibility':'public','sort_order':i})
     for field,value in [('is_active',1),('is_featured',1),('bio','合成人物简介'),('summary','合成公开摘要'),('category','合成分类;研究'),('source','合成基金'),('avatar_key','probe-logo.png')]:
      if field in fields(table):values[field]=value
     if table=='news':values.update(slug='synthetic-probe-'+str(i),published_at='2026-01-01T00:00:00.000Z')
     await r.content.save(table,r.p,values)
   await r.content.save('navigation_items',r.p,{'title':'合成教师入口','url_name':'probe-profiles','kind':'route','location':'header','visibility':'public','enabled':1,'path':build_public_path('profiles',[{'field':'name','operator':'contains','value':'合成'}])})
  try:
   asyncio.run(seed());client.cookies.clear()
   targets=[('/'+lang,'home') for lang in ('zh','en')]
   for lang in ('zh','en'):
    targets.extend(('/'+lang+'/'+table,'standard_list') for table in sorted(PUBLIC_TABLES))
    path='/'+lang+'/n/probe-profiles'
    targets.extend(((path,'fixed_base'),(path+'?direction=asc&size=10','fixed_query'),(path+'?page=2','fixed_query'),(path+'?s=eyJxIjoi5ZCI5oiQIn0','fixed_query')))
    targets.extend(('/api/public/data/'+lang+'/'+table,'public_data') for table in ('profiles','projects'))
   targets.extend((('/api/public/session-summary','identity'),('/api/public/data/en/unknown','invalid_data')))
   for kind in ('local','r2'):
    r.kind=kind
    scenarios.append({'kind':'local' if kind=='local' else 'worker_render_path_with_sqlite','samples':measure_local(client,r.sql,targets)})
  finally:client.close()
 return {'scope':'temporary synthetic SQLite/ASGI render baseline; r2 selects existing lightweight render path, not a real Worker/D1/R2',
         'worker_cpu':'not_available','worker_memory':'not_available','edge_hit_miss':'not_tested','platform_stale_fallback':'not_tested','scenarios':scenarios}

def main():
 p=argparse.ArgumentParser(description=__doc__);mode=p.add_mutually_exclusive_group(required=True);mode.add_argument('--origin',action='append');mode.add_argument('--local',action='store_true');p.add_argument('--nav',action='append',default=[]);p.add_argument('--expected-release');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 expected=a.expected_release or tomllib.loads((ROOT/'pyproject.toml').read_text())['project']['version']
 if a.local and a.nav:p.error('--nav is only for an online configured navigation URL name')
 if a.origin:
  if len(a.origin)>2:p.error('at most two origins per explicit run')
  for origin in a.origin:
   u=urllib.parse.urlsplit(origin)
   if u.scheme!='https' or not u.hostname or u.username or u.password or u.path not in ('','/') or u.query or u.fragment:p.error('origin must be an HTTPS root URL')
  try:samples(a.nav)
  except ValueError as exc:p.error(str(exc))
 # Diagnostic outputs are not release sources; refuse source-tree or existing targets.
 target=a.output.resolve()
 if target.is_relative_to(ROOT) or target.exists():p.error('output must be a new path outside the source tree')
 report=local_baseline() if a.local else {'scope':'anonymous real HTTP; only observed edge status, no browser cache or Worker CPU measurement','sites':[probe(o.rstrip('/'),expected,a.nav) for o in a.origin], 'worker_cpu':'not_available','worker_memory':'not_available','browser_local_filtering':'not_tested','platform_stale_fallback':'not_tested'}
 report.update(captured_at=datetime.now(timezone.utc).isoformat(),expected_release=expected)
 target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'output':str(target),'scope':report['scope'],'worker_cpu':report['worker_cpu']},ensure_ascii=False))
if __name__=='__main__':main()
