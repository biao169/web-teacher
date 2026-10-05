"""Bounded request parsing shared by full and sync-only HTTP applications."""
import json
from urllib.parse import parse_qs
from .catalog import Error

async def payload(request,limit=500000):
    """Bound request size and reject duplicate form/JSON keys before dispatch."""
    buf=bytearray()
    async for chunk in request.stream():
        if len(buf)+len(chunk)>limit:raise Error('请求内容过大',413)
        buf.extend(chunk)
    try:
        if request.headers.get('content-type','').split(';')[0]=='application/json':
            def pairs(items):
                """为访客模板组织有值的原生字段标签及内容。"""
                d={}
                for k,v in items:
                    if k in d:raise ValueError()
                    d[k]=v
                return d
            d=json.loads(buf,object_pairs_hook=pairs)
            if not isinstance(d,dict):raise ValueError()
            return d
        parsed=parse_qs(buf.decode(),keep_blank_values=True,max_num_fields=300)
        if any(len(v)!=1 for v in parsed.values()):raise ValueError()
        return {k:v[0] for k,v in parsed.items()}
    except (ValueError,UnicodeDecodeError):raise Error('请求格式不正确') from None
