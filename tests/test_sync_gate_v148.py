import subprocess,sys
from tests.test_sync_history_v145 import pair,seed,run
from backend.app.native import site_sync_history as history

def test_gate_import_is_lightweight():
 subprocess.run([sys.executable,'-c',"import sys; import backend.app.native.site_sync_gate; assert not any(k in sys.modules for k in ('fastapi','sqlite3','backend.app.native.site_sync_tasks','backend.app.native.catalog'))"],check=True)

def test_worker_history_one_detail_per_step(pair):
 _,_,r,*_=pair
 seed(r,'old',age=8*86400,items=3)
 result=run(history.prune(r.sql,batch=1))
 assert result['more']
 assert run(r.sql.query("SELECT count(*) n FROM sync_task_items WHERE task_uid='old'"))[0]['n']==2
