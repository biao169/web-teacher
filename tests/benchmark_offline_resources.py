"""Opt-in synthetic local RSS/heap check; uses temporary files and bounded reads."""
import asyncio,hashlib,json,resource,sys,tempfile,tracemalloc
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.app.native.database import Database
from transfer.backend.resources import DurableStore as LocalStore
from transfer.backend.native import Transfers
from transfer.backend.settings import edit
from transfer.backend.chunks import page
from transfer.backend.offline import DiskBudget,Maintenance
from transfer.backend.accounting import milliseconds

async def run(mib):
    with tempfile.TemporaryDirectory() as tmp:
        db=Database(Path(tmp)/'bench.sqlite');db.initialize();store=LocalStore(Path(tmp)/'files');s=Transfers(db,store,indexed=True,disk=DiskBudget(store.root));await s.initialize()
        _,settings=await s.settings();settings=edit(settings,{'enabled':True,'vpnGuard':False,'temporaryShare':True});settings['wanRateKbps']=None
        for rule in settings['rules']:rule['wanRateKbps']=None
        await db.batch([('UPDATE tool_settings SET document=?',(json.dumps(settings),))])
        p={'uid':'synthetic-bench','send':True};data=b'x'*1048576;tracemalloc.start();task=await s.create(p,'memory.bin',mib*1048576)
        expected=hashlib.sha256()
        for n in range(mib):await s.chunk(p,task['id'],n*1048576,data);expected.update(data)
        offset=0;received=hashlib.sha256();max_page=0
        while offset<mib*1048576:
            parts=await page(db,task['id'],offset);max_page=max(max_page,len(parts))
            for part in parts:
                raw=await store.get(part['key'],max_bytes=1048576);received.update(raw);offset+=len(raw)
        assert received.digest()==expected.digest()
        await db.batch([('UPDATE temporary_shares SET expires_at=? WHERE id=?',(milliseconds()-1,task['id']))])
        worker=Maintenance(db,store)
        while (await worker.tick())['more']:pass
        assert not (store.root/task['id']).exists()
        print(json.dumps({'file_mib':mib,'heap_peak_bytes':tracemalloc.get_traced_memory()[1],'process_peak_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'max_metadata_page':max_page,'sha256_verified':True,'physical_cleanup_verified':True,'disk_budget_enabled':True}))
asyncio.run(run(int(sys.argv[1])))
