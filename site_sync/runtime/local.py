"""python -m site_sync.runtime.local --config FILE [--once|--check]."""
import argparse
import asyncio
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import signal
from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.local_media import LocalMedia
from site_sync.transport.http import HTTPPeer
from site_sync.deploy.schema import Plan,ensure
from site_sync.deploy.migrations import registered
from .service import Runtime,load_factory


def settings(path):
    if path.stat().st_size>16384:raise ValueError('Configuration too large')
    config=json.loads(path.read_text());base=path.parent.resolve()
    for key in ('database','media_root','log_file'):
        value=Path(config[key]);config[key]=str((base/value).resolve() if not value.is_absolute() else value)
    if not 1<=config.get('poll_seconds',5)<=60:raise ValueError('poll_seconds must be 1..60')
    return config

def logger(path):
    Path(path).parent.mkdir(parents=True,exist_ok=True)
    log=logging.getLogger('site-sync')
    for old in log.handlers:old.close()
    log.handlers.clear();log.setLevel(logging.INFO)
    handler=RotatingFileHandler(path,maxBytes=1024*1024,backupCount=3,encoding='utf-8')
    handler.setFormatter(logging.Formatter('%(message)s'));log.addHandler(handler)
    return log

async def serve(config,*,once=False,check=False,stop=None):
    if check and not Path(config['database']).is_file():raise ValueError('Existing database required for check')
    Path(config['database']).parent.mkdir(parents=True,exist_ok=True)
    db=SQLite(config['database'])
    try:
        # Startup must succeed before any task is claimed. No public migration route.
        plan=Plan.compile(Path(__file__).resolve().parents[2]/'database/schema.sql')
        await ensure(db,plan,migrations=registered(plan),check_only=check)
        adapter=load_factory(config['adapter'])(db,config.get('website',{}))
        async def peer(task):
            rows=await db.query('SELECT origin,secret_ref FROM sync_peers WHERE peer_id=?',(task['peer_id'],))
            value=rows[0];ref=value['secret_ref']
            if not ref.startswith('env:'):raise ValueError('Only env secret references supported')
            secret=bytes.fromhex(os.environ[ref[4:]])
            if len(secret)<32:raise ValueError('Pair secret too short')
            return HTTPPeer(value['origin'],secret)
        runtime=Runtime(db,adapter,peer,lambda repo:LocalMedia(repo,config['media_root']),platform='local',history_days=config.get('history_days',90))
        await runtime.check()
        if check:return {'action':'checked'}
        log=logger(config['log_file']);stop=stop or asyncio.Event()
        loop=asyncio.get_running_loop()
        for sig in (signal.SIGTERM,signal.SIGINT):
            try:loop.add_signal_handler(sig,stop.set)
            except (NotImplementedError,RuntimeError):pass
        while not stop.is_set():
            try:
                result=await runtime.tick()
                if result['action']!='idle':log.info(json.dumps(result))
            except Exception as exc:
                result={'action':'host-error','error':type(exc).__name__};log.error(json.dumps(result))
                if once:raise
            if once:return result
            try:await asyncio.wait_for(stop.wait(),timeout=config.get('poll_seconds',5))
            except TimeoutError:pass
    finally:
        db.close()
        if 'log' in locals():
            for h in log.handlers:h.close()
            log.handlers.clear()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--config',type=Path,required=True)
    group=parser.add_mutually_exclusive_group();group.add_argument('--once',action='store_true');group.add_argument('--check',action='store_true')
    args=parser.parse_args();print(json.dumps(asyncio.run(serve(settings(args.config),once=args.once,check=args.check))))
if __name__=='__main__':main()
