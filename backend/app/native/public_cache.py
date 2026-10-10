"""Bounded anonymous read cache; data revision + LRU + TTL, never a response/session cache."""
import hashlib,json,time
from collections import OrderedDict
from threading import RLock
from backend.app.resource_budget import CacheBudget


class PublicReadCache:
    def __init__(self,budget=None,clock=time.monotonic):
        self.budget=budget or CacheBudget();self.clock=clock;self.entries=OrderedDict();self.used=0
        self.revision=None;self.lock=RLock();self.hits=0;self.misses=0;self.next_sweep=0
        from .public_page_cache import LocalPageStore
        self.pages=LocalPageStore(self)
    def invalidate(self):
        with self.lock:self.entries.clear();self.used=0;self.revision=None;self.pages.clear()
    def _trim(self,limit):
        at=self.clock()
        # Expired keys are swept once a second, not on every SQL cache hit.
        # get() still checks the requested key's deadline exactly.
        if at>=self.next_sweep:
            self.next_sweep=at+1
            for key,(until,payload) in list(self.entries.items()):
                if until<=at:self.used-=len(payload)+512;del self.entries[key]
        self.pages.trim(limit) # Expired/old HTML goes before data under pressure.
        while self.entries and (self.used+self.pages.used>limit or len(self.entries)>2048):
            _,(_,payload)=self.entries.popitem(last=False);self.used-=len(payload)+512
    def get(self,key,revision):
        with self.lock:
            limit,_=self.budget.limits()
            if revision!=self.revision:self.invalidate();self.revision=revision
            self._trim(limit)
            entry=self.entries.get(key) if limit and revision is not None else None
            if entry and entry[0]<=self.clock():
                self.used-=len(entry[1])+512;del self.entries[key];entry=None
            if entry:
                self.entries.move_to_end(key);self.hits+=1
                return json.loads(entry[1])
            self.misses+=1;return None
    def put(self,key,revision,rows,ttl):
        if len(rows)>500 or revision is None or not self.budget.limits()[0]:return
        if sum(len(value) for row in rows for value in row.values() if isinstance(value,(str,bytes)))>65536:return
        try:payload=json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode()
        except (TypeError,ValueError):return
        with self.lock:
            limit,_=self.budget.limits();cost=len(payload)+512
            if revision!=self.revision or cost>min(limit//4,256*1024):return
            old=self.entries.pop(key,None)
            if old:self.used-=len(old[1])+512
            self.entries[key]=(self.clock()+ttl,payload);self.used+=cost;self._trim(limit)


class PublicSQL:
    """Used only after resolving an anonymous GET identity; originals remain isolated."""
    def __init__(self,sql,ttl=1800,revision=None,namespace=None):self.sql=sql;self.cache=sql.public_cache;self.ttl=ttl;self.fixed_revision=revision;self.namespace=namespace
    def current_revision(self):return self.fixed_revision if self.fixed_revision is not None else self.sql.cache_revision()
    def __getattr__(self,key):return getattr(self.sql,key)
    async def query(self,statement,args=()):
        # Do not cache clocks, permission/session reads or write-returning statements.
        if not self.ttl:return await self.sql.query(statement,args)
        upper=statement.lstrip().upper()
        if not upper.startswith(('SELECT ','WITH ')) or any(word in upper for word in ('INSERT ','UPDATE ','DELETE ','AUTH_','OPERATION_LOGS','SERVICE_META','SYNC_TASKS','RANDOM(', 'RANDOMBLOB(')):
            return await self.sql.query(statement,args)
        try:key=hashlib.sha256(json.dumps([self.namespace,statement,args],ensure_ascii=False,separators=(',',':')).encode()).digest()
        except (TypeError,ValueError):return await self.sql.query(statement,args)
        revision=self.current_revision()
        try:cached=self.cache.get(key,revision)
        except Exception:cached=None
        if cached is not None:return cached
        rows=await self.sql.query(statement,args)
        if revision==self.current_revision():
            try:self.cache.put(key,revision,rows,1 if any(token in upper for token in ('STRFTIME(', 'DATETIME(', 'DATE(', 'TIME(', 'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME')) else self.ttl)
            except Exception:pass
        return rows

class WorkerPublicSQL:
    """Anonymous bounded SQL results in Cache API, not persistent Python heap."""
    def __init__(self,sql,origin,revision,ttl,namespace=None):
        self.sql,self.origin,self.revision,self.ttl=sql,origin,revision,ttl
        self.namespace=namespace
    def __getattr__(self,name):return getattr(self.sql,name)
    async def query(self,statement,args=()):
        from .request_cache import BYPASS
        upper=statement.lstrip().upper()
        if not self.ttl or not self.revision or not upper.startswith('SELECT ') or any(x in upper for x in BYPASS):
            return await self.sql.query(statement,args)
        digest=hashlib.sha256(json.dumps(['v055',self.revision,'anonymous',self.namespace,statement,args],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
        key=self.origin.rstrip('/')+'/.public-cache/'+digest
        cache=None
        try:
            from js import caches,Response
            cache=await caches.open('teacher-public-v055')
            response=await cache.match(key)
            if response and int(response.headers.get('content-length') or 1000000)<=65536:
                return json.loads(await response.text())
        except Exception:pass # Cache failures never replace database results.
        rows=await self.sql.query(statement,args)
        if cache is not None and len(rows)<=500:
            try:
                if sum(len(v) for row in rows for v in row.values() if isinstance(v,str))>65536:return rows
                payload=json.dumps(rows,ensure_ascii=False,separators=(',',':'))
                length=len(payload.encode())
                if length<=65536:
                    response=Response.new(payload)
                    response.headers.set('Cache-Control',f'public, max-age={self.ttl}')
                    response.headers.set('Content-Type','application/json')
                    response.headers.set('Content-Length',str(length))
                    await cache.put(key,response)
            except Exception:pass
        return rows
