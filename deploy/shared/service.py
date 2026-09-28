"""Single-process server entry with bounded, cross-platform runtime logging."""
import argparse
import collections
import io
import logging
import os
from pathlib import Path
import sys
import threading
import time


class RuntimeLog(logging.Handler):
    """One writer per single-worker service. No queues or unbounded message buffers."""
    def __init__(self, directory, max_bytes=10*1024*1024, backups=5, days=14):
        super().__init__()
        self.directory=Path(directory);self.directory.mkdir(parents=True,exist_ok=True)
        self.path=self.directory/'service.log'
        self.max_bytes=max_bytes;self.backups=backups;self.days=days
        self.seen=collections.OrderedDict();self.stream=None
        self.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s'))
        self.stopped=threading.Event()
        self.maintain()
        self.worker=threading.Thread(target=self._maintenance,daemon=True,name='log-retention');self.worker.start()

    def _write(self, text):
        raw=text.encode('utf-8',errors='replace')
        limit=min(16384,self.max_bytes)
        data=raw[:max(0,limit-1)].decode('utf-8',errors='ignore').encode('utf-8')+b'\n'
        if self.path.is_symlink():raise OSError('Refusing linked runtime log')
        size=self.path.stat().st_size if self.path.exists() else 0
        if size and size+len(data)>self.max_bytes:
            if self.stream:self.stream.close();self.stream=None
            for i in range(self.backups,0,-1):
                source=self.path if i==1 else self.directory/f'service.log.{i-1}'
                target=self.directory/f'service.log.{i}'
                if source.is_symlink() or target.is_symlink():raise OSError('Refusing linked log archive')
                if source.exists():os.replace(source,target)
        if self.stream is None:
            self.stream=self.path.open('ab');self.path.chmod(0o600)
        self.stream.write(data);self.stream.flush()

    def emit(self, record):
        try:
            # Bound retained deduplication keys even for giant traceback/message strings.
            text=self.format(record)[:16000]
            import hashlib
            key=hashlib.sha256((record.name+str(record.levelno)+record.getMessage()+str(record.exc_text or '')).encode(errors='replace')).digest()
            at=time.monotonic()
            if record.levelno>=logging.WARNING:
                entry=self.seen.get(key)
                if entry and at-entry[0]<60:
                    entry[1]+=1;return
                if entry and entry[1]:self._write(f'Repeated log suppressed {entry[1]} times: {entry[2]}')
                self.seen[key]=[at,0,text[:256]];self.seen.move_to_end(key)
                if len(self.seen)>128:
                    _,old=self.seen.popitem(last=False)
                    if old[1]:self._write(f'Repeated log suppressed {old[1]} times: {old[2]}')
            self._write(text)
        except OSError:
            # Never recursively log an I/O failure into the same handler.
            now=time.monotonic()
            if now-getattr(self,'last_error',-60)>=60:
                self.last_error=now
                sys.__stderr__.write('Runtime log write failed; check disk space and permissions.\n')

    def maintain(self):
        with self.lock:
            now=time.time()
            for i in range(1,self.backups+1):
                p=self.directory/f'service.log.{i}'
                if p.is_file() and not p.is_symlink() and now-p.stat().st_mtime>self.days*86400:p.unlink()
            for key,entry in list(self.seen.items()):
                if time.monotonic()-entry[0]>=60:
                    if entry[1]:self._write(f'Repeated log suppressed {entry[1]} times: {entry[2]}')
                    del self.seen[key]

    def apply_policy(self, policy):
        """Called by the existing maintenance loop; keeps one writer and lock."""
        with self.lock:
            self.max_bytes=policy['log_mb']*1024*1024
            self.backups=policy['log_backups'];self.days=policy['log_days']
            # Only our numbered archives; never delete unrelated logs.
            for index in range(self.backups+1,21):
                path=self.directory/f'service.log.{index}'
                if path.is_file() and not path.is_symlink():path.unlink()
            self.maintain()

    def _maintenance(self):
        while not self.stopped.wait(60):
            try:self.maintain()
            except OSError:pass

    def close(self):
        self.stopped.set()
        with self.lock:
            if self.stream:self.stream.close();self.stream=None
        super().close()


class LogStream(io.TextIOBase):
    """Capture Python prints in bounded fragments, including startup exceptions."""
    def __init__(self, logger, level):self.logger=logger;self.level=level
    def write(self, value):
        for start in range(0,len(value),4096):
            part=value[start:start+4096].rstrip('\r\n')
            if part:self.logger.log(self.level,part)
        return len(value)
    def flush(self):pass


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('app',nargs='?',default='backend.entrypoints.vps:app')
    p.add_argument('--host',default='127.0.0.1');p.add_argument('--port',type=int,default=8003)
    p.add_argument('--limit-concurrency',type=int,default=16)
    a=p.parse_args(argv)
    from backend.app.config import Settings
    settings=Settings.from_env()
    from backend.maintenance.policy import DEFAULTS,load
    policy=dict(DEFAULTS)
    if settings.database_path.is_file():
        import asyncio
        from backend.app.native.database import Database
        policy=asyncio.run(load(Database(settings.database_path)))['values']
    handler=RuntimeLog(settings.data_dir/'logs',policy['log_mb']*1024*1024,policy['log_backups'],policy['log_days'])
    root=logging.getLogger();root.setLevel(logging.INFO);root.handlers=[handler]
    for name in ('uvicorn','uvicorn.error','uvicorn.access'):
        logger=logging.getLogger(name);logger.handlers=[];logger.propagate=True
    stdout,stderr=sys.stdout,sys.stderr
    sys.stdout=LogStream(logging.getLogger('stdout'),logging.INFO)
    sys.stderr=LogStream(logging.getLogger('stderr'),logging.ERROR)
    try:
        import uvicorn
        uvicorn.run(a.app,host=a.host,port=a.port,workers=1,limit_concurrency=a.limit_concurrency,
                    timeout_keep_alive=5,access_log=False,log_config=None)
    except BaseException:
        logging.getLogger('service').exception('Service stopped during startup or execution')
        raise
    finally:
        sys.stdout,sys.stderr=stdout,stderr
        root.removeHandler(handler);handler.close()


if __name__=='__main__':main()
