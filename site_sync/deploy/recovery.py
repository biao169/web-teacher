"""Obtain and durably record a D1 Time Travel bookmark via installed Wrangler."""
import asyncio
import json
import os
from pathlib import Path
import secrets
import subprocess

async def wrangler_bookmark(config):
    # Config is trusted deployment input; no shell execution/interpolation.
    command=['wrangler','d1','time-travel','info',config['database_name'],'--json','--config',config['wrangler_config']]
    result=await asyncio.to_thread(subprocess.run,command,capture_output=True,text=True,timeout=60,check=True,env={**os.environ,'CLOUDFLARE_ACCOUNT_ID':config['account_id']})
    data=json.loads(result.stdout)
    if isinstance(data,list) and len(data)==1:data=data[0]
    bookmark=data.get('bookmark') if isinstance(data,dict) else None
    if not isinstance(bookmark,str) or not 0<len(bookmark)<=256:raise RuntimeError('No confirmed Time Travel bookmark; abort deployment')
    directory=Path(config['recovery_directory']);directory.mkdir(parents=True,exist_ok=True,mode=0o700)
    path=directory/('sync-recovery-'+secrets.token_hex(8)+'.json')
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f:
        json.dump({'account_id':config['account_id'],'database_id':config['database_id'],'bookmark':bookmark},f);f.flush();os.fsync(f.fileno())
    return str(path.resolve())
