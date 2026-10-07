"""Opt-in service-only relay memory probe, synthetic data, no HTTP/proxy/browser claim."""
import asyncio,hashlib,json,resource,sys,tempfile,tracemalloc
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.app.native.database import Database
from transfer.backend.native import Transfers
from transfer.backend.relay import Relay
from transfer.backend.settings import edit

async def main(mib):
    with tempfile.TemporaryDirectory() as tmp:
        db=Database(Path(tmp)/'bench.sqlite3');db.initialize();service=Transfers(db,None);await service.initialize()
        _,settings=await service.settings();settings=edit(settings,{'enabled':True,'relayEnabled':True,'vpnGuard':False});settings['wanRateKbps']=None
        for rule in settings['rules']:rule.update(send=True,receive=True,wanRateKbps=None)
        await db.batch([('UPDATE tool_settings SET document=?',(json.dumps(settings),))])
        r=SimpleNamespace(sql=db,p=None,service=service);relay=Relay();key='s'*43;peer='r'*43
        code=(await relay.act(r,'create',{'key':key,'name':'synthetic','size':mib*1048576}))['code']
        await relay.act(r,'join',{'key':peer,'code':code});await relay.act(r,'ready',{'key':peer,'code':code})
        tracemalloc.start();sent=hashlib.sha256();received=hashlib.sha256()
        for n in range(mib):
            data=bytes([n%251])*1048576;sent.update(data);offset=n*1048576
            await relay.act(r,'chunk',{'key':key,'code':code,'offset':offset},data)
            response=await relay.act(r,'chunk',{'key':peer,'code':code,'offset':offset},b'');received.update(response.body)
            await relay.act(r,'ack',{'key':peer,'code':code,'offset':offset,'sha256':hashlib.sha256(response.body).hexdigest()})
        await relay.act(r,'saved',{'key':peer,'code':code});await relay.act(r,'cancel',{'key':key,'code':code})
        assert sent.digest()==received.digest()
        print(json.dumps({'file_mib':mib,'heap_peak_bytes':tracemalloc.get_traced_memory()[1],'process_peak_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'max_retained_payload_bytes':relay.peak,'final_retained':relay.retained,'sha256_verified':True,'kind':'synthetic_service_only'}))
asyncio.run(main(int(sys.argv[1])))
