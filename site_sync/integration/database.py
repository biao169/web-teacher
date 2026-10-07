"""Native website database adapter; preserve production transaction semantics."""
import asyncio
from contextlib import closing
from site_sync.adapters.d1 import D1

class LocalDB:
    def __init__(self, native):self.native=native
    async def query(self,sql,args=()):
        return await asyncio.to_thread(self._query,sql,args)
    def _query(self,sql,args):
        with closing(self.native.connect()) as c:
            return [dict(r) for r in c.execute(sql,args)]
    async def batch(self,statements):
        if not 1<=len(statements)<=100:raise ValueError('Sync transaction bound')
        try:return await asyncio.to_thread(self._batch,statements)
        finally:self.native.public_cache.invalidate()
    def _batch(self,statements):
        c=self.native.connect()
        try:
            c.execute('BEGIN IMMEDIATE');out=[]
            for sql,args in statements:
                cur=c.execute(sql,args)
                out.append({'success':True,'results':[dict(r) for r in cur] if cur.description else [],'meta':{'changes':max(cur.rowcount,0)}})
            c.commit();return out
        except BaseException:c.rollback();raise
        finally:c.close()

def adapter(r):return LocalDB(r.sql) if r.kind=='local' else D1(r.sql.binding)
