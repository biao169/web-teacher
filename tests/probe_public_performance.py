"""Bounded, anonymous GET measurements; no writes, login, retries or response-body logs."""
import argparse,json,time,urllib.request,urllib.error
from datetime import datetime,timezone
from pathlib import Path

HEADERS=('etag','cache-control','vary','x-public-page-cache','x-public-revision','x-teacher-release','x-request-id','cf-ray','content-type')
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None

def probe(origin,expected):
 opener=urllib.request.build_opener(NoRedirect());rows=[]
 for path in ('/en','/en/projects'):
  etag=None
  for mode in ('first','repeat','conditional'):
   if mode=='conditional' and not etag:
    rows.append({'path':path,'mode':mode,'status':'not_run','reason':'no ETag'});continue
   headers={'Accept':'text/html','User-Agent':'TeacherSite-ReadOnly-Acceptance/1'}
   if mode=='conditional':headers['If-None-Match']=etag
   start=time.perf_counter();row={'path':path,'mode':mode}
   try:
    try:response=opener.open(urllib.request.Request(origin+path,headers=headers),timeout=15)
    except urllib.error.HTTPError as exc:response=exc
    with response:
     row.update(status=response.code,headers_ms=round((time.perf_counter()-start)*1000,2),headers={k:response.headers[k] for k in HEADERS if response.headers.get(k)})
     body=response.read(524289);row['body_bytes']=len(body);row['body_limit_exceeded']=len(body)>524288
     row['total_ms']=round((time.perf_counter()-start)*1000,2)
     if mode=='first':etag=response.headers.get('etag')
   except (OSError,ValueError) as exc:row.update(status='transport_error',error_type=type(exc).__name__)
   rows.append(row)
 releases=sorted({x.get('headers',{}).get('x-teacher-release') for x in rows if x.get('headers',{}).get('x-teacher-release')})
 return {'origin':origin,'observed_releases':releases,'expected_release':expected,'release_match':bool(releases) and releases==[expected], 'samples':rows}

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--origin',action='append',required=True);p.add_argument('--expected-release',default='0.16.062');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 for origin in a.origin:
  u=urllib.parse.urlsplit(origin)
  if u.scheme!='https' or not u.hostname or u.username or u.password or u.path not in ('','/') or u.query or u.fragment:p.error('origin must be an HTTPS root URL')
 report={'captured_at':datetime.now(timezone.utc).isoformat(),'scope':'anonymous real HTTP, current deployment; no browser cache or CPU measurement','sites':[probe(o.rstrip('/'),a.expected_release) for o in a.origin], 'worker_cpu':'not_available','worker_memory':'not_available','browser_prefetch_reuse':'not_tested'}
 a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({x['origin']:{'releases':x['observed_releases'],'release_match':x['release_match']} for x in report['sites']}))
if __name__=='__main__':main()
