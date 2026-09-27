"""统一历史字段白名单和有界只读建议，复用原生权限与固定导航范围。"""
import re,unicodedata
from .catalog import Error,MODULES,label

SUGGESTION_FIELDS={
    'profiles':('role','title','organization','lab'),
    'publications':('venue','year','authors','publication_type','author_role','corresponding_authors','index_type','display_tags','keywords'),
    'projects':('source','fund_name','project_role','principal','members','status'),
    'patents':('country','patent_type','inventors','owner','legal_status'),
    'students':('degree','category','grade','direction','status'),
    'student_category_displays':('keywords',),'news':('category',),
    'courses':('semester','audience'),'media_assets':('category',),
}
MULTIVALUE={
    'publications':{'authors','publication_type','author_role','corresponding_authors','index_type','display_tags','keywords'},
    'projects':{'project_role','members'},'patents':{'inventors','owner'},
    'students':{'category','direction'},'student_category_displays':{'keywords'},
    'courses':{'audience'},'media_assets':{'category'},
}
MAX_ROWS=300
MAX_ITEMS=50
MAX_SOURCE=4096
MAX_TERM=240

def normalized(value):
    """统一宽窄字符、大小写和空白，用于候选去重、已选项排除和片段比较。"""
    return ' '.join(unicodedata.normalize('NFKC',value).split()).casefold()

def suggestion_catalog(principal):
    """向表单和词库提供同一字段目录，仅包含当前账号有查看权限的模块。"""
    return {table:{'label':MODULES[table],'fields':[{'name':name,'label':label(table,name),'multiple':name in MULTIVALUE.get(table,set())} for name in names]}
            for table,names in SUGGESTION_FIELDS.items() if principal and principal['permissions'].get(table,{}).get('can_view')}

async def suggestions(content,principal,data,base=None):
    """从最近至多300条匹配记录中提取至多50个建议；SQL投影只读取目标字段。"""
    table,field=data.get('table'),data.get('field');query=data.get('query','');exclude=data.get('exclude',[])
    if not isinstance(table,str) or not isinstance(field,str) or field not in SUGGESTION_FIELDS.get(table,()):raise Error('此模块或字段不支持历史建议')
    content.auth.require(principal,table)
    if not isinstance(query,str) or len(query)>MAX_TERM:raise Error('搜索片段最多240个字符')
    if not isinstance(exclude,list) or len(exclude)>MAX_ITEMS or any(not isinstance(v,str) or len(v)>MAX_TERM for v in exclude):raise Error('已选项格式无效或过多')
    query=query.strip();blocked={normalized(value) for value in exclude};needle=normalized(query)
    where,args=content.scope(table,principal);clauses=[where,f'"{field}" IS NOT NULL',f'length(CAST("{field}" AS TEXT)) BETWEEN 1 AND {MAX_SOURCE}'];args=list(args)
    if table=='media_assets':clauses.append("status='active'")
    # The base comes only from the validated navigation registry, never arbitrary request SQL.
    from .navigation import FixedScope,scope_conditions
    from .filtering import compile_conditions
    if isinstance(base,FixedScope):
        clause,values=compile_conditions(table,scope_conditions(base));clauses.append(clause);args.extend(values)
    for name,value in ({} if isinstance(base,FixedScope) else base or {}).items():clauses.append(f'"{name}"=?');args.append(value)
    if query:clauses.append(f'instr(lower(CAST("{field}" AS TEXT)),lower(?))>0');args.append(query)
    rows=await content.sql.query(f'SELECT CAST("{field}" AS TEXT) AS value FROM "{table}" WHERE '+ ' AND '.join(clauses)+f' ORDER BY updated_at DESC,id DESC LIMIT {MAX_ROWS}',args)
    values=[];seen=set(blocked);multiple=field in MULTIVALUE.get(table,set())
    for row in rows:
        parts=re.split(r'[;；\r\n]',row['value']) if multiple else [row['value']]
        for part in parts:
            value=' '.join(part.split());key=normalized(value)
            if not key or len(value)>MAX_TERM or needle not in key or key in seen:continue
            values.append(value);seen.add(key)
            if len(values)==MAX_ITEMS:break
        if len(values)==MAX_ITEMS:break
    return {'values':values,'multiple':multiple,'rows_examined':len(rows),'row_limit':MAX_ROWS,'item_limit':MAX_ITEMS}
