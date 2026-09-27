"""Bounded anonymous read cache; data revision + LRU + TTL, never a response/session cache."""
import hashlib,json,time
from collections import OrderedDict
from threading import RLock
from backend.app.resource_budget import CacheBudget


class PublicReadCache:
    def __init__(self,budget=None,clock=time.monotonic):
        self.budget=budget or CacheBudget();self.clock=clock;self.entries=OrderedDict();self.used=0
        self.revision=None;self.lock=RLock();self.hits=0;self.misses=0
    def invalidate(self):
        with self.lock:self.entries.clear();self.used=0;self.revision=None
    def _trim(self,limit):
        at=self.clock()
        for key,(until,payload) in list(self.entries.items()):
            if until<=at:self.used-=len(payload)+512;del self.entries[key]
        while self.entries and (self.used>limit or len(self.entries)>2048):
            _,(_,payload)=self.entries.popitem(last=False);self.used-=len(payload)+512
    def get(self,key,revision):
        with self.lock:
            limit,_=self.budget.limits()
            if revision!=self.revision:self.invalidate();self.revision=revision
            self._trim(limit)
            entry=self.entries.get(key) if limit and revision is not None else None
            if entry:
                self.entries.move_to_end(key);self.hits+=1
                return json.loads(entry[1])
            self.misses+=1;return None
    def put(self,key,revision,rows,ttl):
        if len(rows)>500 or revision is None:return
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
    def __init__(self,sql):self.sql=sql;self.cache=sql.public_cache
    def __getattr__(self,key):return getattr(self.sql,key)
    async def query(self,statement,args=()):
        # Do not cache clocks, permission/session reads or write-returning statements.
        upper=statement.lstrip().upper()
        if not upper.startswith(('SELECT ','WITH ')) or any(word in upper for word in ('INSERT ','UPDATE ','DELETE ','AUTH_USERS','AUTH_ROLES','AUTH_SESSIONS')):
            return await self.sql.query(statement,args)
        try:key=hashlib.sha256(json.dumps([statement,args],ensure_ascii=False,separators=(',',':')).encode()).digest()
        except (TypeError,ValueError):return await self.sql.query(statement,args)
        revision=self.sql.cache_revision();cached=self.cache.get(key,revision)
        if cached is not None:return cached
        rows=await self.sql.query(statement,args)
        if revision==self.sql.cache_revision():
            self.cache.put(key,revision,rows,1 if any(token in upper for token in ('STRFTIME(', 'DATETIME(', 'DATE(', 'TIME(', 'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME')) else 30)
        return rows
