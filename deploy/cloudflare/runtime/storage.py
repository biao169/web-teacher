"""R2 transfer storage shared by HTTP and cron without importing HTTP installers."""
from backend.app.native.storage import R2Store
from backend.app.native.catalog import Error


class TransferStore(R2Store):
    async def prune_task(self, task, limit=8):
        import re
        import js
        from pyodide.ffi import to_js
        if not re.fullmatch('[a-f0-9]{32}', task): raise Error('无效任务地址')
        prefix = self.prefix + task + '/'
        result = await self.bucket.list(to_js({'prefix': prefix, 'limit': limit}, dict_converter=js.Object.fromEntries))
        objects = list(result.objects)
        for obj in objects:
            if not str(obj.key).startswith(prefix): raise Error('对象地址不匹配', 409)
            await self.bucket.delete(obj.key)
        return {'removed': len(objects), 'done': not bool(result.truncated)}

