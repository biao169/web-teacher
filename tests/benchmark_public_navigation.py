"""Disposable SQLite/local application benchmark. No network/browser/Worker CPU claims."""
import asyncio,json,statistics,sys,tempfile,time,resource
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from backend.app.config import Settings,PROJECT_ROOT
from backend.app.native.runtime import local
from backend.app.native.web import create_app
from backend.app.native.demo import seed
from backend.app.security.http import AuthConfig
from backend.app.public_performance import PublicPerformance

def main():
 rows=[]
 with tempfile.TemporaryDirectory() as directory:
  r=local(Settings(Path(directory)));r.config=AuthConfig.from_origin('http://127.0.0.1:8765');asyncio.run(seed(r.sql))
  with TestClient(create_app(lambda _:r,PROJECT_ROOT),base_url=r.config.origin) as c:
   for path in ('/en','/en/profiles','/en/projects','/en/students'):
    for mode in ('disabled','render-hit','conditional'):
     r.public_performance=PublicPerformance(0,2,0,0) if mode=='disabled' else PublicPerformance()
     r.sql.public_cache.invalidate();first=c.get(path);assert first.status_code==200
     headers={'If-None-Match':first.headers['etag']} if mode=='conditional' else {}
     samples=[];sizes=[];states=[]
     for _ in range(10):
      start=time.perf_counter();response=c.get(path,headers=headers);samples.append(round((time.perf_counter()-start)*1000,3))
      assert response.status_code==(304 if mode=='conditional' else 200)
      sizes.append(len(response.content));states.append(response.headers.get('x-public-page-cache'))
     if mode=='render-hit':assert set(states)=={'HIT'},states
     rows.append({'path':path,'mode':mode,'median_ms':round(statistics.median(samples),3),'samples_ms':samples,'body_bytes':sizes,'page_cache':states})
 print(json.dumps({'scope':'local CPython TestClient with temporary demo SQLite; no network; 10 samples after warmup','results':rows,'process_peak_rss_kib_linux':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'memory_note':'whole benchmark peak, not incremental cache or production worker memory'},indent=2))
if __name__=='__main__':main()
