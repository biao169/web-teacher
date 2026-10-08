"""Cloudflare binding adapter. No BEGIN/COMMIT or non-atomic exec() calls.

Cloudflare documents batch as transactional. Real binding/FFI validation remains
required; tests use a SQLite-backed binding double, not Cloudflare infrastructure.
"""


import re,time
from site_sync.core.trace import annotate

def sql_type(sql):
    words=re.findall(r'[A-Za-z_]+',sql.lstrip())[:2]
    return 'SELECT COUNT' if [w.upper() for w in words]==['SELECT','COUNT'] else (words[0].upper() if words else 'UNKNOWN')

def diagnostic(exc,operation,sql,args,started):
    # D1 errors may quote SQL/parameters. Retain bounded engine text, redact data.
    source=getattr(exc,'js_error',exc)
    message=str(getattr(source,'message',str(exc)))[:4096]
    if sql:message=message.replace(sql,'[SQL]')
    for value in args:
        if isinstance(value,str) and len(value)>=3:message=message.replace(value,'[value]')
    message=re.sub(r'https?://\S+|[\w.+-]+@[\w.-]+|[a-fA-F0-9]{24,}', '[redacted]',message)
    message=re.sub(r"(['\"])(?:(?!\1).)*?\1",'[quoted]',message)
    message=re.sub(r'(?i)(token|password|secret|authorization|key)\s*[=:]\s*[^\s,;]+',r'\1=[redacted]',message)
    # SQL text after a driver prefix is not needed for diagnosis; bindings never logged.
    message=re.sub(r'(?is)\b(SELECT|INSERT|UPDATE|DELETE|WITH)\s+.*','[SQL]',message)
    name=str(getattr(source,'name',type(exc).__name__))
    if not re.fullmatch('[A-Za-z_][A-Za-z0-9_]{0,63}',name):name=type(exc).__name__
    stack=str(getattr(source,'stack',''))[:4096]
    frames=re.findall(r'([A-Za-z0-9_.-]+\.(?:js|mjs|py)):(\d{1,6}):(\d{1,6})',stack)[-4:]
    value={'operation':operation,'sql_type':sql_type(sql),'native_name':name,'message':message[:512],'native_frames':[{'file':f,'line':int(line),'column':int(col)} for f,line,col in frames],'duration_ms':round((time.monotonic()-started)*1000,2)}
    exc.d1_diagnostic=value
    return exc

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
        started=time.monotonic();annotate(d1_operation='query',sql_type=sql_type(sql))
        try:
            result = plain(await self.statement(sql, args).all())
            if not result.get('success', False):raise RuntimeError('D1 query failed')
            return plain(result.get('results', []))
        except Exception as exc:
            diagnostic(exc,'query',sql,args,started)
            raise

    async def batch(self, statements):
        blobs={};started=time.monotonic();sql='';args=()
        annotate(d1_operation='batch',sql_type='BATCH')
        try:
            prepared=[]
            for sql,args in statements:prepared.append(self.statement(sql,args,blobs))
            sql='';args=tuple(v for _,values in statements for v in values)
            results = plain(await self.binding.batch(js_array(prepared)))
            results = [plain(v) for v in results]
            if len(results) != len(prepared) or any(not v.get('success', False) for v in results):
                raise RuntimeError('D1 batch result could not be confirmed; recheck state before retry')
            return results
        except Exception as exc:
            diagnostic(exc,'batch',sql,args,started)
            exc.d1_diagnostic['sql_type']=sql_type(sql) if sql else 'BATCH'
            raise

    async def backup(self):
        if self.backup_callback is None:
            raise RuntimeError('Deployment must supply a D1 backup/export or recovery-point callback')
        result = await self.backup_callback()
        if not isinstance(result, str) or not result.strip():
            raise RuntimeError('D1 recovery reference was not confirmed')
        return result
