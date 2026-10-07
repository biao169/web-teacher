"""后台导航的规范路径、固定条件及只读预览；复用原生字段，不增加数据表。"""
import re
from urllib.parse import urlsplit, parse_qsl, urlencode
from .catalog import TABLES, CONTENT, TITLE, SECRET, Error, label, MODULES
from .student_categories import page_numbers

from .filtering import MAX_CONDITIONS as MAX_FILTERS, normalize_value
PREVIEW_FIELDS={
    'profiles':('name','title','organization','is_active','visibility'),
    'students':('name','degree','category','grade','status','visibility'),
    'research_interests':('name','description','sort_order','visibility'),
    'projects':('name','fund_name','status','start_date','amount','visibility'),
    'publications':('title','year','authors','venue','visibility'),
    'patents':('name','patent_type','legal_status','application_date','visibility'),
    'courses':('name','semester','audience','is_featured','visibility'),
    'news':('title','category','published_at','visibility'),
}

def filter_fields(table):
    """提供固定条件白名单及显示标签；字段名称仅来自原生结构。"""
    if table not in CONTENT:raise Error('请选择受支持的内容模块')
    return {key:{'key':key,'label':label(table,key),'kind':spec['kind'],'enum':spec.get('enum',[])}
            for key in dict.fromkeys([*PREVIEW_FIELDS[table],*TABLES[table]['columns']]) if key in TABLES[table]['columns'] and key not in SECRET
            for spec in [TABLES[table]['columns'][key]]}

def filter_value(table,key,value):
    """规范整数与开关条件，文本按原文相等；拒绝空条件及过长/无效输入。"""
    return normalize_value(table,key,value)


class FixedScope(dict):
    """Equality defaults/locked fields remain dict-compatible; keep all predicates separately."""
    def __init__(self,conditions):
        self.conditions=conditions
        super().__init__((c['field'],c['value']) for c in conditions if c['operator']=='eq')
    def __bool__(self):
        return bool(self.conditions)


def scope_conditions(base):
    return base.conditions if isinstance(base,FixedScope) else [{'field':k,'value':v} for k,v in (base or {}).items()]


def build_path(table,conditions):
    """Shared validation; legacy f. equality and c. literal contains use ASCII encoding."""
    from .filtering import normalize_conditions
    if isinstance(conditions,FixedScope):conditions=scope_conditions(conditions)
    normalized=normalize_conditions(table,conditions)
    pairs=[(('c.' if c['operator']=='contains' else 'f.')+c['field'],c['value']) for c in normalized]
    path='/admin/'+table+('?' +urlencode(pairs) if pairs else '')
    if len(path)>16384:raise Error('编码后的筛选路径过长，请减少条件')
    return path


def parse_path(path):
    """Parse only allowlisted equality/contains conditions, with duplicate-field rejection."""
    from .filtering import normalize_conditions
    if not isinstance(path,str) or len(path)>16384 or any(ord(c)<32 for c in path):raise Error('后台导航路径无效')
    try:
        parsed=urlsplit(path)
        if parsed.scheme or parsed.netloc or parsed.fragment or not parsed.path.startswith('/admin/'):raise ValueError()
        table=parsed.path[len('/admin/'):]
        if table not in CONTENT or re.search(r'%(?![0-9a-fA-F]{2})',parsed.query):raise ValueError()
        pairs=parse_qsl(parsed.query,keep_blank_values=True,strict_parsing=True,errors='strict',max_num_fields=MAX_FILTERS)
        if any(not key.startswith(('f.','c.')) for key,_ in pairs):raise ValueError()
    except (ValueError,UnicodeError):raise Error('后台路径使用 /admin/模块名 和 f.等于或 c.包含条件，不含外链或额外参数') from None
    conditions=normalize_conditions(table,[{'field':key[2:],'operator':'contains' if key.startswith('c.') else 'eq','value':value} for key,value in pairs])
    build_path(table,conditions)
    return table,FixedScope(conditions)


def in_scope(table,row,base):
    """Match write guards with SQL semantics, including literal ASCII-insensitive contains."""
    fold=str.maketrans('ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')
    for item in scope_conditions(base):
        key,value=item['field'],item['value'];actual=row.get(key)
        if actual is None:return False
        if item.get('operator','eq')=='contains':
            if str(value).translate(fold) not in str(actual).translate(fold):return False
        elif TABLES[table]['columns'][key]['kind'] in ('integer','boolean'):
            if str(int(actual))!=value:return False
        elif str(actual)!=value:return False
    return True

def editor_state(row,principal):
    """One visual editor; public conditions expose only public-safe field metadata."""
    from .navigation_options import PRESETS
    from .filtering import field_options
    result={'presets':PRESETS,'table':'','lang':'en','conditions':[],'error':'',
            'modules':{t:{'label':MODULES[t],'fields':sorted(field_options(t),key=lambda f: list(filter_fields(t)).index(f['key'])),
                          'public_fields':field_options(t,public=True)} for t in CONTENT},'can_preview':False}
    path=row.get('path') or '';location=row.get('location')
    candidate=location=='admin-sidebar' or has_public_conditions(path) or bool(re.fullmatch(r'/(en|zh)/('+'|'.join(CONTENT)+r')',path))
    if path and candidate:
        try:result.update(draft_state(path,location,principal))
        except Error as exc:result['error']=exc.message
    return result

async def preview(content,principal,data):
    """Read-only bounded preview; public preview applies public gates even for admins."""
    location=data.get('location','admin-sidebar');table=data.get('table')
    if location=='admin-sidebar':
        path=build_path(table,data.get('conditions'));table,base=parse_path(path);fixed=None
    elif location in PUBLIC_LOCATIONS:
        path=build_public_path(table,data.get('conditions'),data.get('lang','en'))
        table,fixed,_=parse_public_path(path);base=None
    else:raise Error('此显示位置不支持固定筛选')
    content.auth.require(principal,table)
    query={key:data.get(key,default) for key,default in [('size',10),('page',1)]}
    if any(isinstance(v,bool) or not re.fullmatch(r'[0-9]+',str(v)) for v in query.values()):raise Error('预览分页参数无效')
    is_public=location!='admin-sidebar'
    columns=[k for k in PREVIEW_FIELDS[table] if k in TABLES[table]['columns']]
    if is_public:
        from .filtering import PUBLIC_FILTER_FIELDS
        from .public_data import PUBLIC_FIELDS,DEFAULT_SORT
        query['sort']=DEFAULT_SORT[table]
        columns=[k for k in columns if k in PUBLIC_FILTER_FIELDS[table] and k in PUBLIC_FIELDS[table]]
    if TITLE[table] not in columns:columns.insert(0,TITLE[table])
    listing=await content.listing(table,principal,query,base,public=is_public,projection=['uid',*columns],fixed_conditions=fixed)
    listing['page_numbers']=page_numbers(listing['page'],listing['pages'])
    return {'table':table,'path':path,'columns':columns,'listing':listing,'labels':{key:label(table,key) for key in columns}}


def navigation_guard(navigation):
    """把导航版本和启用状态纳入写事务，避免检查后规则改变仍能提交。"""
    if not navigation:return '1',()
    return "EXISTS(SELECT 1 FROM navigation_items WHERE uid=? AND updated_at=? AND enabled=1 AND location='admin-sidebar')",(navigation['uid'],navigation['updated_at'])

# Public fixed conditions are stored in the existing path, without raw Chinese URLs.
# This is configuration storage; step 3 resolves a stable entry route for visitors.
PUBLIC_LOCATIONS=('',None,'header','hero','footer')

def has_public_conditions(path):
    try:return any(k=='nf' for k,_ in parse_qsl(urlsplit(path or '').query,keep_blank_values=True))
    except (ValueError,TypeError):return False


def build_public_path(table,conditions,lang='en'):
    import base64,json
    from .filtering import normalize_conditions
    if lang not in ('en','zh'):raise Error('页面语言无效')
    normalized=normalize_conditions(table,conditions,public=True)
    path='/'+lang+'/'+table
    if normalized:
        token=base64.urlsafe_b64encode(json.dumps(normalized,ensure_ascii=False,separators=(',',':')).encode()).decode().rstrip('=')
        path+='?nf='+token
    if len(path)>16384:raise Error('编码后的筛选路径过长，请减少条件')
    return path


def parse_public_path(path):
    import base64,json
    from .filtering import normalize_conditions
    try:
        if not isinstance(path,str) or len(path)>16384 or any(ord(c)<32 for c in path):raise ValueError()
        u=urlsplit(path);parts=u.path.split('/')
        if u.scheme or u.netloc or u.fragment or len(parts)!=3 or parts[1] not in ('en','zh') or parts[2] not in CONTENT:raise ValueError()
        if re.search(r'%(?![0-9a-fA-F]{2})',u.query):raise ValueError()
        pairs=parse_qsl(u.query,keep_blank_values=True,strict_parsing=True,errors='strict',max_num_fields=MAX_FILTERS)
        if len(pairs)==1 and pairs[0][0]=='nf':
            token=pairs[0][1]
            if not re.fullmatch('[A-Za-z0-9_-]+',token):raise ValueError()
            conditions=json.loads(base64.b64decode(token+'='*((-len(token))%4),altchars=b'-_',validate=True).decode('utf-8'))
        else:
            if any(not k.startswith(('f.','c.')) for k,_ in pairs):raise ValueError()
            conditions=[{'field':k[2:],'operator':'contains' if k.startswith('c.') else 'eq','value':v} for k,v in pairs]
        conditions=normalize_conditions(parts[2],conditions,public=True)
        return parts[2],conditions,parts[1]
    except (ValueError,UnicodeError,TypeError,RecursionError):raise Error('前台筛选路径需为 /en/模块 或 /zh/模块，并使用有效固定条件') from None


def draft_state(path,location,principal):
    if location=='admin-sidebar':
        table,base=parse_path(path);conditions=[{k:v for k,v in c.items() if k!='operator' or v!='eq'} for c in scope_conditions(base)]
        canonical=build_path(table,conditions);lang='en'
    elif location in PUBLIC_LOCATIONS:
        table,conditions,lang=parse_public_path(path);canonical=build_public_path(table,conditions,lang)
    else:raise Error('此显示位置不支持固定筛选')
    return {'table':table,'conditions':conditions,'path':canonical,'lang':lang,
            'can_preview':bool(principal and principal['permissions'].get(table,{}).get('can_view'))}
