"""Disposable seeded HTTP/SQLite characterization; never contacts either live site.
Run with PYTHONPATH including tests and dependencies. Timings are local wall time,
not Worker CPU, network TTFB, or a production performance guarantee.
"""
import argparse,asyncio,json,re,sys,tempfile,time,subprocess
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'tests')]
from list_fixture import client_at
from backend.app.native.content import Content
from backend.app.native.media_references import MediaReferences
from backend.app.native.web import create_app
from test_media_regression import register,PNG


def capture():
    report={'source_version':json.loads((ROOT/'release-manifest.json').read_text())['version'],'step':'0','scope':'disposable SQLite + ASGI test client',
            'timings':'local wall milliseconds; not Cloudflare CPU or network TTFB',
            'seed':'list_fixture: three records per seeded business module; one synthetic PNG',
            'not_measured':['live Worker CPU/outcome/PoPs','live Ubuntu RSS/systemd/Caddy','browser network concurrency'],
            'requests':[]}
    with tempfile.TemporaryDirectory(prefix='teacher-step0-') as tmp:
        client,r=client_at(Path(tmp));register((client,r),PNG,'png','image/png')
        routes=[]
        for route in client.app.routes:
            endpoint=getattr(route,'endpoint',None)
            routes.append({'path':route.path,'methods':sorted(getattr(route,'methods',[]) or []),'type':type(route).__name__,
                           'handler':getattr(endpoint,'__module__','')+'.'+getattr(endpoint,'__qualname__','')})
        report['full_app_routes']=routes
        # Lazy Worker website composition uses the same route factory; no fake D1 timing.
        lazy=create_app(lambda request:r,lazy_sync=True)
        report['worker_lazy_routes']=[{'path':getattr(x,'path',None),'type':type(x).__name__,'methods':sorted(getattr(x,'methods',[]) or [])} for x in lazy.routes]
        original_query=r.sql.query;original_listing=Content.listing;original_usage=MediaReferences.summaries
        current={}
        async def query(sql,*args,**kwargs):
            start=time.perf_counter();rows=await original_query(sql,*args,**kwargs)
            current['sql'].append({'operation':sql.strip().split()[0].upper(),'tables':sorted(set(re.findall(r'\b(?:FROM|JOIN)\s+["`]?([a-z_]+)',sql,re.I))),
                                   'rows_returned':len(rows),'duration_ms':round((time.perf_counter()-start)*1000,3)})
            return rows
        async def listing(self,table,*args,**kwargs):
            current['listing_calls'].append(table);return await original_listing(self,table,*args,**kwargs)
        async def usage(self,*args,**kwargs):
            current['media_usage_calls']+=1;return await original_usage(self,*args,**kwargs)
        try:
            with patch.object(r.sql,'query',query),patch.object(Content,'listing',listing),patch.object(MediaReferences,'summaries',usage):
                cookie=client.cookies.get(r.config.name('session'))
                for actor,paths in [('anonymous',['/en']),('administrator',['/admin','/api/admin/dashboard-counts','/admin/media_assets','/admin/site-sync'])]:
                    client.cookies.clear()
                    if actor=='administrator':client.cookies.set(r.config.name('session'),cookie)
                    for path in paths:
                        for sample in ('first','repeat'):
                            current={'actor':actor,'path':path,'sample':sample,'sql':[],'listing_calls':[],'media_usage_calls':0}
                            start=time.perf_counter();response=client.get(path)
                            current.update(status=response.status_code,duration_ms=round((time.perf_counter()-start)*1000,3),response_bytes=len(response.content),query_count=len(current['sql']))
                            assert response.status_code==200,(path,response.status_code)
                            report['requests'].append(current)
        finally:client.close()
    # Fresh interpreter excludes imports introduced by test fixtures themselves.
    code="import json,sys; from backend.app.native.web import create_app; app=create_app(lambda request:None,lazy_sync=True); print(json.dumps(sorted(n for n in sys.modules if n.startswith(('backend.','site_sync.','transfer.')))))"
    imported=subprocess.run([sys.executable,'-B','-c',code],cwd=ROOT,capture_output=True,text=True,check=True,timeout=30)
    report['fresh_lazy_app_imports']=json.loads(imported.stdout)
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    result=capture();args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps([{k:v for k,v in r.items() if k!='sql'} for r in result['requests']],ensure_ascii=False,indent=2))
