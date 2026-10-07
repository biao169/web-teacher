"""Anonymous Worker configuration memoization; never shared across requests or identities."""
import hashlib,json
from collections import OrderedDict

LIMIT=64*1024
ENTRY_LIMIT=16*1024
MAX_ENTRIES=32
BYPASS=('INSERT ','UPDATE ','DELETE ','AUTH_','OPERATION_LOGS','SERVICE_META','SYNC_',
        'RANDOM(', 'RANDOMBLOB(', 'STRFTIME(', 'DATETIME(', 'DATE(', 'TIME(',
        'CURRENT_TIMESTAMP','CURRENT_DATE','CURRENT_TIME','CHANGES(', 'LAST_INSERT_ROWID(')

class RequestSQL:
    def __init__(self,sql):
        self.sql=sql;self.entries=OrderedDict();self.used=0;self.hits=0;self.misses=0;self.generation=0
    def __getattr__(self,name):return getattr(self.sql,name)
    def invalidate(self):
        self.entries.clear();self.used=0;self.generation+=1
    async def query(self,statement,args=()):
        upper=statement.lstrip().upper()
        if not upper.startswith(('SELECT ','WITH ')) or any(word in upper for word in ('INSERT ','UPDATE ','DELETE ')):
            # Unknown query forms might write, so they cannot leave memoized reads behind.
            self.invalidate()
            try:return await self.sql.query(statement,args)
            finally:self.invalidate()
        if any(word in upper for word in BYPASS):return await self.sql.query(statement,args)
        # Most list/translation queries are unique per page. Avoid serializing them
        # just to fill a cache that would have no hits in a constrained Worker.
        if not upper.startswith('SELECT ') or not any(token in upper+' ' for token in (' FROM SITE_SETTINGS ', ' FROM GLOBAL_SETTINGS ')):
            return await self.sql.query(statement,args)
        try:
            encoded=json.dumps([statement,args],ensure_ascii=False,separators=(',',':')).encode()
        except (TypeError,ValueError):return await self.sql.query(statement,args)
        if len(encoded)>8192:return await self.sql.query(statement,args)
        key=hashlib.sha256(encoded).digest()
        cached=self.entries.get(key)
        if cached is not None:
            self.hits+=1;self.entries.move_to_end(key);return json.loads(cached)
        self.misses+=1;generation=self.generation
        rows=await self.sql.query(statement,args)
        if generation!=self.generation or len(rows)>64:return rows
        if sum(len(v) for row in rows for v in row.values() if isinstance(v,(str,bytes)))>ENTRY_LIMIT:return rows
        try:encoded=json.dumps(rows,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
        except (TypeError,ValueError):return rows
        cost=len(encoded)+512
        if cost>ENTRY_LIMIT:return rows
        old=self.entries.pop(key,None)
        if old is not None:self.used-=len(old)+512
        self.entries[key]=encoded;self.used+=cost
        while self.used>LIMIT or len(self.entries)>MAX_ENTRIES:
            _,value=self.entries.popitem(last=False);self.used-=len(value)+512
        return rows
    async def batch(self,statements):
        self.invalidate()
        try:return await self.sql.batch(statements)
        finally:self.invalidate()
    async def restore_batch(self,statements):
        self.invalidate()
        try:return await self.sql.restore_batch(statements)
        finally:self.invalidate()
