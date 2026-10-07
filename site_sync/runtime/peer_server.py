"""Separate local source process, loopback only; reverse proxy supplies HTTPS."""
import argparse
import asyncio
from http.server import ThreadingHTTPServer
import os
import threading
from site_sync.adapters.sqlite import SQLite
from site_sync.transport.server import handler
from .local import settings
from .service import load_factory

class BoundedServer(ThreadingHTTPServer):
    daemon_threads=True
    request_queue_size=4
    def __init__(self,*args):super().__init__(*args);self.slots=threading.BoundedSemaphore(2)
    def process_request(self,request,address):
        if not self.slots.acquire(blocking=False):request.close();return
        try:super().process_request(request,address)
        except BaseException:self.slots.release();raise
    def process_request_thread(self,*args):
        try:super().process_request_thread(*args)
        finally:self.slots.release()

class LocalSource:
    def __init__(self,config):self.config=config
    def call(self,name,q):
        # Fresh read-only connection in its request thread. No migrations here.
        db=SQLite(self.config['database'])
        try:
            db.connection.execute('PRAGMA query_only=ON')
            adapter=load_factory(self.config['adapter'])(db,self.config['website'])
            return asyncio.run(getattr(adapter,name)(q))
        finally:db.close()
    def authorize(self,module,record):
        # source_read also enforces the explicit module mapping.
        if module not in self.config['website'].get('modules',{}):
            from site_sync.core.authority import AuthorizationError
            raise AuthorizationError('Module not exported')
    def candidates(self,q):return self.call('source_candidates',q)
    def manifest(self,q):return self.call('source_read',q)
    def slice(self,q):return self.call('source_read',q)
    def media(self,q):return self.call('source_media',q)

def main():
    from pathlib import Path
    p=argparse.ArgumentParser();p.add_argument('--config',type=Path,required=True);p.add_argument('--port',type=int,default=8790);p.add_argument('--secret-env',required=True)
    args=p.parse_args();config=settings(args.config)
    if not Path(config['database']).is_file():p.error('Existing website database required')
    key=bytes.fromhex(os.environ[args.secret_env])
    if len(key)<32:raise ValueError('Pair key too short')
    with BoundedServer(('127.0.0.1',args.port),handler(LocalSource(config),key)) as server:server.serve_forever(poll_interval=0.5)
if __name__=='__main__':main()
