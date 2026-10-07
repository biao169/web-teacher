"""Prepare D1 before code release; no cloud mutation unless --apply supplied.
The trusted backup hook executes locally and returns a real recovery reference.
No API token, SQL, signed URL or exception body is printed to runtime logs.
"""
import argparse
import asyncio
import importlib
import json
import os
import subprocess
from pathlib import Path
from .schema import Plan,ensure
from .migrations import registered
from .d1_remote import RemoteD1

def preflight(config):
    # Templates intentionally use plain JSON, despite Wrangler's .jsonc suffix.
    runtime=json.loads(Path(config['wrangler_config']).read_text())
    native=json.loads(Path(config['native_config']).read_text())
    binding=[b for b in runtime.get('d1_databases',[]) if b['binding']=='DB']
    if len(binding)!=1 or binding[0]['database_id']!=config['database_id'] or binding[0]['database_name']!=config['database_name']:raise ValueError('Deploy/runtime database identity mismatch')
    if any('REPLACE_' in str(v) for v in (config['account_id'],config['database_id'],native['r2_buckets'][0]['bucket_name'])):raise ValueError('Fill deployment placeholders')
    service=[s for s in runtime.get('services',[]) if s['binding']=='NATIVE']
    if len(service)!=1 or service[0]['service']!=native['name']:raise ValueError('Native service binding mismatch')
    if runtime.get('workers_dev') is not False or native.get('workers_dev') is not False or runtime.get('routes') or native.get('routes'):raise ValueError('Executor and native workers must remain private')
    from site_sync.runtime.service import load_factory
    load_factory(runtime['vars']['WEBSITE_ADAPTER'])(None,json.loads(runtime['vars']['WEBSITE_ADAPTER_CONFIG']))
    return runtime,native

async def deploy(config,*,apply=False,release=False):
    if release and not apply:raise ValueError('Release requires --apply')
    preflight(config)
    factory=config['backup_hook'].split(':')
    if len(factory)!=2:raise ValueError('Configure backup module:function')
    hook=getattr(importlib.import_module(factory[0]),factory[1])
    async def backup():return await hook(config)
    db=RemoteD1(config['account_id'],config['database_id'],os.environ['CLOUDFLARE_API_TOKEN'],backup)
    plan=Plan.compile(Path(__file__).resolve().parents[2]/'database/schema.sql')
    result=await ensure(db,plan,migrations=registered(plan),check_only=not apply)
    if result['action'] not in ('unchanged','initialized','upgraded'):raise RuntimeError('Deployment not ready')
    if release:
        env={**os.environ,'CLOUDFLARE_ACCOUNT_ID':config['account_id']}
        for command in (['wrangler','deploy','--config',config['native_config']],['uv','run','pywrangler','deploy','--config',config['wrangler_config']]):
            await asyncio.to_thread(subprocess.run,command,check=True,env=env)
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--config',type=Path,required=True);p.add_argument('--apply',action='store_true');p.add_argument('--release',action='store_true');a=p.parse_args()
    print(json.dumps(asyncio.run(deploy(json.loads(a.config.read_text()),apply=a.apply,release=a.release))))
if __name__=='__main__':main()
