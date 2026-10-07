"""Repeatable local-only HTTP/cache comparison; all data lives in a temporary directory.
Run: python -B tests/benchmark_public_cache.py
Times exclude the network and do not predict production latency.
"""
import asyncio,json,statistics,sys,tempfile,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from backend.app.config import Settings,PROJECT_ROOT
from backend.app.native.runtime import local
from backend.app.native.web import create_app
from backend.app.native.demo import seed
from backend.app.security.http import AuthConfig


def main():
    with tempfile.TemporaryDirectory() as directory:
        r=local(Settings(Path(directory)));r.config=AuthConfig.from_origin('http://127.0.0.1:8765')
        asyncio.run(seed(r.sql));calls=[0];original=r.sql.query
        async def counted(sql,args=()):calls[0]+=1;return await original(sql,args)
        r.sql.query=counted;report={}
        with TestClient(create_app(lambda _:r,PROJECT_ROOT),base_url=r.config.origin) as client:
            for path in ('/en','/en/projects','/en/students'):
                measurements={}
                for enabled in (False,True):
                    budget=r.sql.public_cache.budget;budget.cap=32*1024*1024 if enabled else 0;budget.checked=-float('inf')
                    r.sql.public_cache.invalidate();client.get(path) # Warm templates, and query cache when enabled.
                    timings=[];queries=[]
                    for _ in range(5):
                        before=calls[0];started=time.perf_counter();response=client.get(path)
                        assert response.status_code==200,(path,response.status_code)
                        timings.append(round((time.perf_counter()-started)*1000,2));queries.append(calls[0]-before)
                    measurements['cache_on' if enabled else 'cache_off']={'median_ms':statistics.median(timings),'samples_ms':timings,'sql_calls':queries}
                report[path]=measurements
        print(json.dumps({'environment':'local TestClient; 10 demo rows per content module; anonymous; no network latency','results':report},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
