"""D1 SQL adapter with atomic batches and native domain errors; no schema translation."""
from backend.app.native.catalog import Error
from backend.app.native.site_sync_diagnostics import database

def plain(value):
    """Normalize Pyodide JS values into plain Python records."""
    return value.to_py() if hasattr(value,'to_py') else value

def rows(result):
    """把D1返回的结果集合转换为普通Python字典列表。"""
    result=plain(result);values=result['results'] if isinstance(result,dict) else result.results
    return [dict(plain(row)) for row in plain(values)]
class D1SQL:
    def __init__(self,binding):"""保存构造参数和适配器，供此对象后续操作复用。""";self.binding=binding
    def statement(self,sql,args):
        """预处理SQL并绑定参数，不拼接用户输入。"""
        statement=self.binding.prepare(sql);return statement.bind(*args) if args else statement
    async def query(self,sql,args=()):
        with database(((sql,args),)):return rows(await self.statement(sql,args).all())
    async def batch(self,statements):
        """以一个数据库事务提交有界SQL批次，保持原子性。"""
        return await self._batch(statements,25)
    async def restore_batch(self,statements):
        """Commit a bounded full restore atomically; ordinary mutations retain their 25-statement cap."""
        return await self._batch(statements,64)
    async def _batch(self,statements,limit):
        """Enforce the caller-specific transaction budget in either native adapter."""
        try:
            with database(statements):
                if not 1<=len(statements)<=limit:raise ValueError('Too many statements per transaction')
                return [rows(result) for result in plain(await self.binding.batch([self.statement(sql,args) for sql,args in statements]))]
        except Exception as exc:
            if 'constraint' in str(exc).lower():raise Error('数据、权限或引用已变化，请刷新检查',409) from None
            raise
