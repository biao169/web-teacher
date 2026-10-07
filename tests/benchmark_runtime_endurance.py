"""Opt-in real local HTTP endurance probe. Synthetic temporary data only.
Run with test dependencies: python tests/benchmark_runtime_endurance.py --output report.json
This is not a Windows/browser, public-WAN, systemd or multi-day acceptance claim.
"""
import argparse,asyncio,hashlib,json,os,platform,socket,subprocess,sys,tempfile,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import httpx
from list_fixture import client_at
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from test_transfer_integration_v66 import enabled
from test_transfer_lan_v68 import setting
from test_media_regression import register,PNG
from test_public_home_step2 import add
from test_public_stream_v46 import H

ROOT=Path(__file__).resolve().parents[1]

async def exercise(origin,token,csrf,pid,media,rounds,seconds):
    headers={'Origin':origin,'X-CSRF-Token':csrf,'Accept':'application/json'}
    report={'platform':platform.platform(),'scope':'real loopback HTTP; synthetic data; no proxy/browser/WAN','rounds':[],'request_count':0,'relay_payload_mib':0}
    async with httpx.AsyncClient(base_url=origin,trust_env=False,timeout=15,limits=httpx.Limits(max_connections=4)) as public,httpx.AsyncClient(base_url=origin,trust_env=False,timeout=15,cookies={'ts_session':token},limits=httpx.Limits(max_connections=4)) as admin:
        async def checked(method,path,**kwargs):
            r=await admin.request(method,path,**kwargs)
            if r.is_error:raise RuntimeError(f'{method} {path}: {r.status_code} {r.text[:500]}')
            return r
        async def snap():
            r=(await checked('GET','/api/admin/runtime-maintenance/status',headers=headers)).json()['resources']
            fd=Path(f'/proc/{pid}/fd')
            return {'rss_bytes':r['process_bytes'],'cache':r['public_cache'],'database':r['database'],'fd_count':len(list(fd.iterdir())) if fd.exists() else None}
        for _ in range(100):
            try:
                r=await public.get('/health/ready')
                if r.status_code==200:break
            except httpx.TransportError:pass
            await asyncio.sleep(.1)
        else:raise RuntimeError('Service readiness timed out')
        report['initial']=await snap()
        for cycle in range(rounds):
            end=time.monotonic()+seconds;times=[];counts=[0]
            async def visitor(index):
                paths=['/en','/zh','/en/profiles','/en/publications','/en/projects','/zh/students','/en/courses','/en/news','/transfer/?lang=en']
                n=index
                while time.monotonic()<end:
                    start=time.perf_counter();r=await public.get(paths[n%len(paths)]);r.raise_for_status();times.append((time.perf_counter()-start)*1000);counts[0]+=1;n+=1
                    await asyncio.sleep(.12)
            async def room(index):
                send=(str(index)+str(cycle)+'s'*43)[:43];receive=(str(index)+str(cycle)+'r'*43)[:43]
                async def post(op,key,**values):return (await checked('POST','/transfer/api/relay/'+op,json={'key':key,**values},headers=headers)).json()
                code=(await post('create',send,name='synthetic.bin',size=4*1048576))['code']
                await post('join',receive,code=code);await post('ready',receive,code=code)
                for offset in range(0,4*1048576,1048576):
                    data=bytes([index+1])*1048576;h={**headers,'X-Relay-Code':code,'X-Relay-Key':send,'X-Offset':str(offset)}
                    await checked('POST','/transfer/api/relay/chunk',content=data,headers=h)
                    # Cancel one room with a retained block, exercising cleanup under load.
                    if index==2 and offset==1048576:break
                    response=await checked('POST','/transfer/api/relay/chunk',content=b'',headers={**h,'X-Relay-Key':receive})
                    assert hashlib.sha256(response.content).digest()==hashlib.sha256(data).digest()
                    await post('ack',receive,code=code,offset=offset,sha256=hashlib.sha256(data).hexdigest());report['relay_payload_mib']+=1
                if index!=2:await post('saved',receive,code=code)
                await post('cancel',send,code=code)
                gone=await admin.post('/transfer/api/relay/status',json={'key':send,'code':code},headers=headers);assert gone.status_code in (404,410)
            start=time.monotonic()
            await asyncio.gather(*(visitor(i) for i in range(4)),*(room(i) for i in range(3)))
            image=await checked('GET',f'/api/admin/media/{media}/content');assert image.content==PNG
            first=await public.get('/en/publications',headers=H);first.raise_for_status();next_url=first.json()['next_url'];assert next_url
            following=await public.get(next_url,headers=H);following.raise_for_status()
            scan=(await checked('POST','/api/admin/runtime-maintenance',json={'action':'scan','restart':True},headers=headers)).json()
            while not scan['complete']:scan=(await checked('POST','/api/admin/runtime-maintenance',json={'action':'scan'},headers=headers)).json()
            preview=(await checked('POST','/api/admin/runtime-maintenance',json={'action':'preview'},headers=headers)).json();assert not preview['errors']
            after=await snap();await asyncio.sleep(10);idle=await snap();times.sort()
            report['rounds'].append({'cycle':cycle+1,'duration_seconds':round(time.monotonic()-start,2),'public_requests':counts[0],'median_ms':round(times[len(times)//2],2),'p95_ms':round(times[int(len(times)*.95)],2),'after_load':after,'after_idle':idle})
            report['request_count']+=counts[0]
            print(json.dumps({'completed_round':cycle+1,'requests':counts[0],'rss_bytes':idle['rss_bytes']},ensure_ascii=False),flush=True)
        report['elapsed_load_seconds']=rounds*seconds
    return report

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',required=True,type=Path);p.add_argument('--rounds',type=int,default=3);p.add_argument('--seconds',type=int,default=45);a=p.parse_args()
    if not 1<=a.rounds<=100 or not 1<=a.seconds<=3600:p.error('rounds 1..100, seconds 1..3600')
    with tempfile.TemporaryDirectory() as temp:
        root=Path(temp)
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        origin=f'http://127.0.0.1:{port}';seed,r=client_at(root/'data',origin)
        token=seed.cookies.get('ts_session');r.auth=Auth(r.sql,r.passwords);r.content=Content(r.sql,r.auth);r.p=asyncio.run(r.auth.principal(token));enabled(seed,r)
        def configure(doc):
            doc.update(relayEnabled=True,wanRateKbps=None)
            for rule in doc['rules']:rule.update(concurrency=4,wanRateKbps=None)
        reply=seed.post('/transfer/api/settings',json={'revision':1,'relayEnabled':True},headers={'Origin':origin,'X-CSRF-Token':r.p['csrf']})
        assert reply.status_code==200,reply.text
        setting(r,configure)
        for n in range(24):add(r,'publications','Synthetic paper '+str(n))
        media,_=register((seed,r),PNG,mime='image/png');seed.close()
        env={k:v for k,v in os.environ.items() if not k.startswith(('TEACHER_','TRANSFER_'))}
        env.update(TEACHER_DATA_DIR=str(r.settings.data_dir),TEACHER_DATABASE_PATH=str(r.settings.database_path),TRANSFER_MEDIA_DIR=str(r.settings.transfer_media_dir),TRANSFER_CACHE_DIR=str(r.settings.transfer_cache_dir),TEACHER_ORIGIN=origin,PYTHONDONTWRITEBYTECODE='1')
        cmd=[sys.executable,'-B','-m','deploy.shared.service','--port',str(port)]
        with (root/'launcher.log').open('w') as output:
            process=subprocess.Popen(cmd,cwd=ROOT,env=env,stdout=output,stderr=output)
            try:report=asyncio.run(exercise(origin,token,r.p['csrf'],process.pid,media,a.rounds,a.seconds))
            finally:process.terminate();process.wait(timeout=20)
            # Real restart with the same synthetic database/session and maintenance state.
            process=subprocess.Popen(cmd,cwd=ROOT,env=env,stdout=output,stderr=output)
            try:
                with httpx.Client(base_url=origin,trust_env=False,timeout=5,cookies={'ts_session':token}) as client:
                    for _ in range(100):
                        if process.poll() is not None:raise RuntimeError('Restart failed')
                        try:
                            if client.get('/health/ready').status_code==200:break
                        except httpx.TransportError:pass
                        time.sleep(.1)
                    else:raise RuntimeError('Restart readiness timeout')
                    assert client.get('/admin/runtime-maintenance').status_code==200
                    assert client.get(f'/api/admin/media/{media}/content').content==PNG
                    report['restart_session_and_media_verified']=True
            finally:process.terminate();process.wait(timeout=20)
        logs=list((r.settings.data_dir/'logs').glob('service.log*'));report['log_bytes']=sum(f.stat().st_size for f in logs);report['log_files']=len(logs)
        report['relay_payload_files']=len(list(r.settings.transfer_media_dir.rglob('*.part')));assert report['relay_payload_files']==0
        a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(str(a.output),flush=True)
if __name__=='__main__':main()
