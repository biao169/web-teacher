"""Bounded server-side sync failures: correlate requests without logging data or secrets."""
import json,logging,secrets,time
from contextlib import contextmanager
from .catalog import Error

@contextmanager
def operation(name):
    started=time.monotonic()
    try:yield
    except Error:raise
    except Exception as exc:
        ref=secrets.token_hex(6);frames=[];tb=exc.__traceback__
        while tb:
            frames.append({'file':tb.tb_frame.f_code.co_filename.replace('\\','/').split('/')[-1], 'line':tb.tb_lineno,'function':tb.tb_frame.f_code.co_name})
            tb=tb.tb_next
        # Match only known infrastructure categories; never publish raw SQL/exception text.
        detail=str(exc).lower()
        if 'no such table' in detail or 'no such column' in detail:
            code='sync_schema_missing';message='本站数据库缺少同步所需表或字段，请执行正常数据库升级；不要重置数据库'
        elif any(x in detail for x in ('too many subrequests','too many sql','d1_error','database is locked')):
            code='sync_database';message='本站数据库请求失败，请按诊断编号检查D1/SQLite及请求限制'
        else:code='sync_server';message='本站同步服务运行异常，请按诊断编号检查服务日志'
        logging.getLogger(__name__).error(json.dumps({'component':'site-sync','diagnostic_id':ref,'operation':name,'code':code,'exception':type(exc).__name__,'frames':frames[-8:],'elapsed_ms':round((time.monotonic()-started)*1000)},ensure_ascii=False))
        raise Error(message+'；服务端诊断编号：'+ref,500,code) from None
