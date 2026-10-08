"""Cloudflare binding adapter. No BEGIN/COMMIT or non-atomic exec() calls.

Cloudflare documents batch as transactional. Real binding/FFI validation remains
required; tests use a SQLite-backed binding double, not Cloudflare infrastructure.
"""


def plain(value):
    return value.to_py() if hasattr(value, 'to_py') else value


def js_array(value):
    # Explicit conversion avoids handing a Python list proxy to D1. Kept lazy
    # so the adapter can be imported and contract-tested outside Pyodide.
    import sys
    if sys.platform == 'emscripten':
        from pyodide.ffi import to_js
        return to_js(value)
    return value


def blob(value):
    """Copy one Python buffer to a JS ArrayBuffer, never a Python integer list."""
    import sys
    if sys.platform == 'emscripten':
        from js import Uint8Array
        view=Uint8Array.new(len(value))
        view.assign(value)
        return view.buffer
    return value


class D1:
    def __init__(self, binding, *, backup_callback=None):
        self.binding = binding
        self.backup_callback = backup_callback

    def statement(self, sql, args, blobs=None):
        # Batch-local reuse: one staged body is bound in both INSERT and receipt
        # verification. Keep one buffer for that object, never a global cache.
        blobs={} if blobs is None else blobs
        values=[]
        for value in args:
            if isinstance(value,bytes):
                identity=id(value)
                if identity not in blobs:blobs[identity]=blob(value)
                value=blobs[identity]
            values.append(value)
        return self.binding.prepare(sql).bind(*values) if values else self.binding.prepare(sql)

    async def query(self, sql, args=()):
        result = plain(await self.statement(sql, args).all())
        if not result.get('success', False):
            raise RuntimeError('D1 query failed')
        return plain(result.get('results', []))

    async def batch(self, statements):
        blobs={}
        prepared = [self.statement(sql, args,blobs) for sql, args in statements]
        results = plain(await self.binding.batch(js_array(prepared)))
        results = [plain(v) for v in results]
        if len(results) != len(prepared) or any(not v.get('success', False) for v in results):
            raise RuntimeError('D1 batch result could not be confirmed; recheck state before retry')
        return results

    async def backup(self):
        if self.backup_callback is None:
            raise RuntimeError('Deployment must supply a D1 backup/export or recovery-point callback')
        result = await self.backup_callback()
        if not isinstance(result, str) or not result.strip():
            raise RuntimeError('D1 recovery reference was not confirmed')
        return result
