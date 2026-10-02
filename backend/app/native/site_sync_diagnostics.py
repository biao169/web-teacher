"""Shared bounded sync diagnostics; no SQL, parameter values, or raw exceptions in logs."""
import hashlib,json,logging,secrets,time
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
from .catalog import Error

_current=ContextVar('sync_diagnostic',default=None)
# Match known infrastructure messages, but publish only fixed descriptions.
_REASONS=(
 ('schema_missing',('no such table','no such column'),'数据库缺少所需表或字段，请执行正常升级，不要重置数据库'),
 ('query_limit',('too many subrequests','too many sql queries','too many statements','too many requests'),'单次请求的查询或事务数量超限'),
 ('parameter_limit',('too many sql variables','too many bound parameters','too many parameters'),'数据库绑定参数数量超限'),
 ('quota',('daily limit','daily quota','quota exceeded','exceeded your','d1_storage_limit'),'数据库用量或存储配额已耗尽'),
 ('size_limit',('string or blob too big','row too large','statement too long','sql statement is too long','value too large'),'SQL、记录或字段大小超限'),
 ('timeout',('timeout','timed out','exceeded time'),'数据库执行超时'),
 ('overloaded',('overloaded','overload'),'数据库暂时过载'),
 ('locked',('database is locked','database is busy','sqlite_busy'),'数据库被占用或锁定'),
 ('binding',('d1_type_error','unsupported type','wrong number of parameter','incorrect number of binding'),'数据库参数类型或数量不匹配'),
 ('sql',('syntax error','sql logic error','misuse of','no such function'),'数据库语句或函数不兼容'),
)

def reason(exc):
    # Pyodide may keep the D1 message in js_error.cause; never include it in output.
    values=[str(exc)]
    for item in (getattr(exc,'__cause__',None),getattr(exc,'__context__',None),getattr(exc,'js_error',None)):
        if item is None:continue
        try:
            cause=getattr(item,'cause','')
            values.extend((str(item),str(getattr(item,'message','')),str(cause),str(getattr(cause,'message',''))))
        except Exception:pass
    detail=' '.join(values).lower()
    for code,patterns,message in _REASONS:
        if any(p in detail for p in patterns):return code,message
    if 'd1_' in detail or 'database' in detail:return 'database','数据库请求失败，具体原因待按诊断编号排查'
    return 'server','同步服务运行异常，请按诊断编号检查服务日志'

@contextmanager
def database(statements):
    """Attach only failing SQL fingerprints to an active sync operation; zero extra queries."""
    try:yield
    except Exception:
        context=_current.get()
        if context is not None:
            rows=list(statements)
            context['database']={'statements':len(rows),'queries':[
                {'id':hashlib.sha256(sql.encode()).hexdigest()[:12],'parameters':len(args)} for sql,args in rows[:25]]}
        raise

@contextmanager
def operation(name):
    parent=_current.get();context={'operation':(parent['operation']+'/' if parent else '')+name}
    token=_current.set(context);started=time.monotonic()
    try:yield
    except Error:raise
    except Exception as exc:
        ref=secrets.token_hex(6);frames=[];tb=exc.__traceback__
        while tb:
            frames.append({'file':tb.tb_frame.f_code.co_filename.replace('\\','/').split('/')[-1],'line':tb.tb_lineno,'function':tb.tb_frame.f_code.co_name});tb=tb.tb_next
        category,message=reason(exc);code='sync_'+category
        logging.getLogger(__name__).error(json.dumps({**context,'component':'site-sync','diagnostic_id':ref,'code':code,
            'exception':type(exc).__name__,'frames':frames[-8:],'elapsed_ms':round((time.monotonic()-started)*1000)},ensure_ascii=False))
        raise Error('本站'+message+'；阶段：'+context['operation']+'；服务端诊断编号：'+ref,500,code) from None
    finally:_current.reset(token)

def traced(name):
    """Reuse operation for async steps without duplicating exception handlers."""
    def decorate(fn):
        @wraps(fn)
        async def run(*args,**kwargs):
            with operation(name):return await fn(*args,**kwargs)
        return run
    return decorate
