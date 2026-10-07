"""Real loopback HTTP sockets through the shared launcher; not a remote WAN test."""
import asyncio,hashlib,os
import httpx
from list_fixture import client_at
from backend.app.native.auth import Auth
from test_transfer_lan_v68 import setting
from test_transfer_integration_v66 import enabled
from test_release_acceptance import port,launch,ready


def test_relay_real_http_two_clients_and_main_site_liveness(tmp_path):
    origin='http://127.0.0.1:'+str(port());seed,r=client_at(tmp_path/'data',origin)
    token=seed.cookies.get('ts_session');r.auth=Auth(r.sql,r.passwords);r.p=asyncio.run(r.auth.principal(token));enabled(seed,r)
    h={'Origin':origin,'X-CSRF-Token':r.p['csrf']}
    assert seed.post('/transfer/api/settings',json={'revision':1,'relayEnabled':True},headers=h).status_code==200
    setting(r,lambda doc:doc.update(wanRateKbps=None));seed.close()
    env={k:v for k,v in os.environ.items() if not k.startswith(('TEACHER_','TRANSFER_'))}
    env.update(TEACHER_DATA_DIR=str(tmp_path/'data'),TEACHER_PORT=origin.rsplit(':',1)[1],TEACHER_ORIGIN=origin,TRANSFER_MEDIA_DIR=str(tmp_path/'data/files'),TRANSFER_CACHE_DIR=str(tmp_path/'data/cache'),PYTHONDONTWRITEBYTECODE='1')
    with (tmp_path/'launcher.log').open('w') as log,httpx.Client(base_url=origin,cookies={'ts_session':token},trust_env=False,timeout=5) as sender,httpx.Client(base_url=origin,cookies={'ts_session':token},trust_env=False,timeout=5) as receiver:
        process=launch(env,log,10)
        try:
            ready(sender,process,'/health/ready');key='s'*43;peer='r'*43
            def post(client,op,k,**values):return client.post('/transfer/api/relay/'+op,json={'key':k,**values},headers=h)
            row=post(sender,'create',key,name='http.bin',size=8*1048576);assert row.status_code==200,row.text
            code=row.json()['code']
            issued=sender.post('/transfer/api/codes/issue',json={'mode':'relay','target':code,'key':key},headers=h)
            assert issued.status_code==200,issued.text
            short=issued.json()['code']
            paired=receiver.post('/transfer/api/codes/resolve',json={'code':short,'key':peer},headers=h)
            assert paired.status_code==200,paired.text
            assert paired.json()['session']['code']==code
            assert post(receiver,'ready',peer,code=code).status_code==200
            sent=hashlib.sha256();received=hashlib.sha256()
            for n in range(8):
                block=bytes([n])*1048576;offset=n*1048576;sent.update(block)
                bh={**h,'X-Relay-Code':code,'X-Relay-Key':key,'X-Offset':str(offset)}
                reply=sender.post('/transfer/api/relay/chunk',content=block,headers=bh);assert reply.status_code==200,reply.text
                assert sender.get('/health/ready').status_code==200
                answer=receiver.post('/transfer/api/relay/chunk',content=b'',headers={**bh,'X-Relay-Key':peer});assert answer.status_code==200,answer.text
                received.update(answer.content);assert answer.headers['x-chunk-sha256']==hashlib.sha256(answer.content).hexdigest()
                ack={'code':code,'offset':offset,'sha256':answer.headers['x-chunk-sha256']}
                assert post(receiver,'ack',peer,**ack).json()['offset']==offset+len(block)
                # Simulate loss of the first ACK response: a repeated ACK doesn't write twice.
                assert post(receiver,'ack',peer,**ack).json()['offset']==offset+len(block)
            assert sent.digest()==received.digest()
            assert post(receiver,'saved',peer,code=code).json()['saved']
            assert post(sender,'status',key,code=code).json()['saved']
            assert post(sender,'cancel',key,code=code).status_code==200
            assert receiver.post('/transfer/api/codes/resolve',json={'code':short,'key':peer},headers=h).status_code==410
            assert not any((tmp_path/'data/files').rglob('*.part'))
        finally:
            assert process.wait(timeout=20)==0
