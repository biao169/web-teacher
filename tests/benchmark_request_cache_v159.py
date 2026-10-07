"""Local HTTP comparison of Worker memoization; not a deployed Worker benchmark."""
import asyncio,json,statistics,sys,tempfile,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from backend.app.config import Settings,PROJECT_ROOT
from backend.app.native.runtime import local
from backend.app.native.web import create_app
from backend.app.native.demo import seed
from backend.app.security.http import AuthConfig
import backend.app.native.request_cache as memo

def main():
    with tempfile.TemporaryDirectory() as folder:
        r=local(Settings(Path(folder)));r.config=AuthConfig.from_origin('http://127.0.0.1:8765')
        asyncio.run(seed(r.sql));r.kind='r2';calls=[0];original=r.sql.query;wrapper=memo.RequestSQL
        async def counted(query,args=()):calls[0]+=1;return await original(query,args)
        r.sql.query=counted;report={}
        try:
            with TestClient(create_app(lambda _:r,PROJECT_ROOT),base_url=r.config.origin) as client:
                for path in ('/en','/en/projects','/en/students'):
                    result={}
                    for enabled in (False,True):
                        memo.RequestSQL=wrapper if enabled else lambda sql:sql
                        client.get(path);timings=[];queries=[]
                        for _ in range(5):
                            before=calls[0];start=time.perf_counter();response=client.get(path)
                            assert response.status_code==200
                            timings.append(round((time.perf_counter()-start)*1000,2));queries.append(calls[0]-before)
                        result['memo_on' if enabled else 'memo_off']={'sql_calls':queries,'median_ms':statistics.median(timings),'samples_ms':timings}
                    report[path]=result
        finally:memo.RequestSQL=wrapper
        print(json.dumps({'environment':'local TestClient + SQLite, anonymous Worker code path, seeded demo; excludes actual D1/network/Worker CPU','results':report},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
