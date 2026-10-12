"""Server-owned public navigation scope and bounded ASCII visitor query state."""
import base64,hashlib,json,re
from urllib.parse import urlencode
from .catalog import Error
from .navigation import PUBLIC_LOCATIONS,has_public_conditions,parse_public_path

SLUG=re.compile(r'[a-z0-9][a-z0-9_-]{0,79}')

def visible_scopes(principal):
    result=['public']
    if principal:
        result.append('authenticated')
        if 'staff' in principal.get('scopes',[]):result.append('staff')
    return result

async def resolve(r,slug,table=None,stamp=None):
    if not isinstance(slug,str) or not SLUG.fullmatch(slug):raise Error('导航不存在',404)
    if stamp is not None and not re.fullmatch('[a-f0-9]{32}',stamp):raise Error('导航版本无效')
    rows=await r.sql.query('SELECT * FROM navigation_items WHERE url_name=?',(slug,))
    rows=[row for row in rows if row['location'] in PUBLIC_LOCATIONS]
    if len(rows)!=1:raise Error('导航不存在',404)
    row=rows[0]
    if row['enabled']!=1 or row['visibility'] not in visible_scopes(r.p) or row['kind'] not in ('','route','button',None) or row.get('fragment'):raise Error('导航不存在或不可见',404)
    # Removed conditions must not silently broaden an old fixed-entry address.
    if not has_public_conditions(row.get('path')):raise Error('固定入口已移除，请重新选择导航',404)
    try:target,conditions,_=parse_public_path(row['path'])
    except Error:raise Error('导航配置无效',404) from None
    if not conditions or (table is not None and target!=table):raise Error('导航与内容模块不一致',404)
    version=hashlib.sha256(json.dumps([row['uid'],row['path'],row['visibility'],row['location'],row['updated_at']],ensure_ascii=False).encode()).hexdigest()[:32]
    if stamp is not None and stamp!=version:raise Error('导航条件已更新，请刷新页面',409)
    return {'slug':slug,'table':target,'conditions':conditions,'stamp':version,'title':row['title']}

async def api_scope(r,params,table):
    for key in ('nav','nv'):
        if len(params.getlist(key))>1:raise Error('导航参数重复')
    slug=params.get('nav');stamp=params.get('nv')
    if stamp is not None and not slug:raise Error('缺少导航标识')
    return await resolve(r,slug,table,stamp) if slug is not None else None

def _pairs(items):
    out={}
    for key,value in items:
        if key in out:raise ValueError()
        out[key]=value
    return out

def encode_state(values):
    return base64.urlsafe_b64encode(json.dumps(values,ensure_ascii=False,separators=(',',':'),sort_keys=True).encode()).decode().rstrip('=')

def query_url(path,query):
    """Only visitor text filters are encoded; numeric pagination stays inspectable."""
    text={k:str(v) for k,v in query.items() if (k=='q' or k.startswith(('f.','c.'))) and str(v)!=''}
    simple={k:str(v) for k,v in query.items() if k in ('page','size','direction','home','nv','sort')}
    if text:simple['s']=encode_state(text)
    return path+('?' +urlencode(simple) if simple else '')

def visitor_query(params,table,*,scoped=False):
    from .public_data import public_filter
    from .filtering import normalize_conditions
    pairs=list(params.multi_items())
    if len(pairs)>40 or sum(len(k)+len(v) for k,v in pairs)>32768:raise Error('查询参数过长')
    try:raw=_pairs(pairs)
    except ValueError:raise Error('查询参数重复') from None
    raw.pop('_rev',None) # Transport cache revision is not a business filter.
    token=raw.pop('s',None);text={}
    if token is not None:
        try:
            if len(token)>24576 or not re.fullmatch(r'[A-Za-z0-9_-]+',token):raise ValueError()
            text=json.loads(base64.b64decode(token+'='*((-len(token))%4),altchars=b'-_',validate=True).decode(),object_pairs_hook=_pairs)
            if not isinstance(text,dict) or len(text)>30 or any(not isinstance(k,str) or not isinstance(v,str) or not(k=='q' or k.startswith(('f.','c.'))) for k,v in text.items()):raise ValueError()
        except (ValueError,UnicodeError,RecursionError):raise Error('搜索状态编码无效') from None
        if any(k=='q' or k.startswith(('f.','c.')) for k in raw):raise Error('编码状态不能与原始筛选参数混用')
    query=raw|text
    for key,value in query.items():
        if any(ord(c)<32 or ord(c)==127 or 0xD800<=ord(c)<=0xDFFF for c in value):raise Error('查询值含无效字符')
        if key=='q':
            if len(value)>200:raise Error('搜索关键词过长')
        elif key.startswith(('f.','c.')):
            if len(value)>500:raise Error('筛选值过长')
            if key.startswith('f.'):public_filter(table,key[2:],value)
            elif value:normalize_conditions(table,[{'field':key[2:],'operator':'contains','value':value}],public=True)
        elif key in ('page','size'):
            if not re.fullmatch('[0-9]{1,7}',value) or not 1<=int(value)<=1000000:raise Error('分页参数无效')
        elif key=='direction':
            if value not in ('asc','desc'):raise Error('排序方向无效')
        elif key=='home':
            if scoped or value!='1':raise Error('固定入口不支持首页分页模式')
        elif key=='nv':
            if not scoped or not re.fullmatch('[a-f0-9]{32}',value):raise Error('导航版本无效')
        elif key=='sort':
            from .public_data import DEFAULT_SORT
            query[key]=DEFAULT_SORT[table] # Legacy URLs retain only configured ordering.
        elif scoped or key in ('nf','nav','fixed_conditions'):raise Error('不支持此查询参数')
    return {k:v for k,v in query.items() if k in ('q','page','size','direction','home','nv','sort') or k.startswith(('f.','c.'))}

def list_return(value,list_path,table,scope=None):
    """Accept only a relative return to this list; switch its language with the detail."""
    from urllib.parse import urlsplit
    from starlette.datastructures import QueryParams
    try:
        if not value or len(value)>32768 or '\\' in value:return list_path
        url=urlsplit(value)
        if url.scheme or url.netloc or url.fragment or url.path[:3] not in ('/en','/zh') or url.path[3:]!=list_path[3:]:return list_path
        query=visitor_query(QueryParams(url.query),table,scoped=bool(scope))
        if scope and query.get('nv',scope['stamp'])!=scope['stamp']:return list_path
        return query_url(list_path,query)
    except (Error,ValueError,UnicodeError):return list_path


def query_identity(query):
    """Detect mixed fragments; this identifier is not a permission or fixed-scope token."""
    state={k:str(v) for k,v in query.items() if k not in ('page','nv')}
    return hashlib.sha256(json.dumps(state,ensure_ascii=True,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:24]
