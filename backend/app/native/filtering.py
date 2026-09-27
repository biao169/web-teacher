"""Shared condition validation and bound predicates; public fields are explicit.

Fixed conditions are server-owned arguments, never merged into visitor query values.
Legacy navigation conditions without an operator retain exact equality.
"""
import re
from .catalog import TABLES, CONTENT, SECRET, Error, label

MAX_CONDITIONS=12
MAX_VALUE_LENGTH=500
# Contact gates, project private data, source citations and storage keys are excluded.
PUBLIC_FILTER_FIELDS={
    'profiles':('uid','name','name_en','title','role','organization','lab','bio','bio_en','is_active','is_featured'),
    'students':('uid','name','name_en','degree','category','grade','direction','status','enrollment_date','graduation_date','destination','awards','bio','is_featured'),
    'research_interests':('uid','name','name_en','description'),
    'projects':('uid','name','source','fund_name','project_number','project_role','start_date','end_date','status','is_featured'),
    'publications':('uid','title','authors','venue','year','doi','publication_type','author_role','corresponding_authors','index_type','display_tags','keywords','is_featured'),
    'patents':('uid','name','country','patent_type','application_number','grant_number','application_date','grant_date','inventors','owner','legal_status','summary','is_featured'),
    'courses':('uid','name','semester','audience','summary','is_featured'),
    'news':('uid','title','category','published_at','is_featured'),
}
PUBLIC_SEARCH_FIELDS={
    'profiles':('name','name_en','title','role','organization','lab','bio','bio_en'),
    'students':('name','name_en','degree','category','grade','direction','status','destination','awards','bio'),
    'research_interests':('name','name_en','description'),
    'projects':('name','source','fund_name','project_number','project_role','status'),
    'publications':('title','authors','venue','year','doi','publication_type','author_role','corresponding_authors','index_type','display_tags','keywords'),
    'patents':('name','country','patent_type','application_number','grant_number','inventors','owner','legal_status','summary'),
    'courses':('name','semester','audience','summary'),
    'news':('title','category'),
}
EXACT_ONLY={'uid','status','legal_status','project_role','publication_type','patent_type','degree',
            'start_date','end_date','enrollment_date','graduation_date','application_date','grant_date','published_at'}


def fields(table,*,public=False):
    if not isinstance(table,str) or table not in CONTENT:raise Error('请选择受支持的内容模块')
    columns=TABLES[table]['columns']
    keys=PUBLIC_FILTER_FIELDS[table] if public else columns
    return {key:columns[key] for key in keys if key in columns and key not in SECRET}


def operators(table,field,*,public=False):
    spec=fields(table,public=public).get(field) if isinstance(field,str) else None
    if spec is None:raise Error('固定筛选字段不正确')
    return ('eq','contains') if spec['kind'] in ('text','json') and not spec.get('enum') and field not in EXACT_ONLY else ('eq',)


def field_options(table,*,public=False):
    """Metadata for the existing visual editor; new text rows default to contains."""
    result=[]
    for key,spec in fields(table,public=public).items():
        allowed=operators(table,key,public=public)
        result.append({'key':key,'label':label(table,key),'kind':spec['kind'],'enum':list(spec.get('enum',[])),
                       'operators':list(allowed),'default_operator':'contains' if 'contains' in allowed else 'eq'})
    return result


def normalize_value(table,field,value,*,public=False):
    spec=fields(table,public=public).get(field) if isinstance(field,str) else None
    if spec is None:raise Error('固定筛选字段不正确')
    if isinstance(value,bool):value=int(value)
    if not isinstance(value,(str,int)):raise Error('筛选值必须是文本或整数')
    value=str(value).strip()
    if not value or len(value)>MAX_VALUE_LENGTH or any(ord(c)<32 or 0x7f<=ord(c)<=0x9f or 0xd800<=ord(c)<=0xdfff for c in value):
        raise Error('筛选值需为1—500个字符，不能包含控制字符')
    if spec['kind'] in ('integer','boolean'):
        if not re.fullmatch(r'-?[0-9]+',value):raise Error(label(table,field)+'筛选值必须是整数')
        number=int(value)
        if not spec.get('min',-9007199254740991)<=number<=spec.get('max',9007199254740991):raise Error('筛选整数超出范围')
        if spec['kind']=='boolean' and number not in (0,1):raise Error('开关筛选使用0或1')
        value=str(number)
    if spec.get('enum') and value not in [str(v) for v in spec['enum']]:raise Error(label(table,field)+'筛选选项无效')
    return value


def normalize_conditions(table,conditions,*,public=False):
    """One fixed condition per field; additional user predicates stay independent."""
    fields(table,public=public)
    if not isinstance(conditions,list) or len(conditions)>MAX_CONDITIONS:raise Error('固定条件最多12项')
    result=[];seen=set()
    for item in conditions:
        if not isinstance(item,dict) or set(item) not in ({'field','value'},{'field','operator','value'}):raise Error('固定条件格式不正确')
        field=item['field'];operator=item.get('operator','eq')
        if not isinstance(field,str) or field in seen:raise Error('同一字段只能固定一次')
        if not isinstance(operator,str) or operator not in operators(table,field,public=public):raise Error('此字段不支持该匹配方式')
        result.append({'field':field,'operator':operator,'value':normalize_value(table,field,item['value'],public=public)})
        seen.add(field)
    return result


def contains_pattern(value):
    """Literal substring matching; %, _ and backslash never become wildcards."""
    return '%'+str(value).replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'


def contains_predicate(table,field,value):
    # Internal identifiers still pass the native schema/secret allowlist.
    if table not in TABLES or field not in TABLES[table]['columns'] or field in SECRET:raise Error('未知文本筛选列')
    return f'"{table}"."{field}" LIKE ? ESCAPE \'\\\'',[contains_pattern(value)]


def compile_conditions(table,conditions,*,public=False):
    """Return one AND predicate plus bound values, independent of permissions."""
    clauses=[];args=[]
    for item in normalize_conditions(table,conditions,public=public):
        if item['operator']=='contains':clause,values=contains_predicate(table,item['field'],item['value'])
        else:clause,values=f'"{table}"."{item["field"]}"=?',[item['value']]
        clauses.append(clause);args.extend(values)
    return '('+' AND '.join(clauses)+')' if clauses else '1',args


def search_predicate(table,term,*,public=False):
    """Raw/manual-English branch; public listing adds the shared effective-cache branch."""
    keys=PUBLIC_SEARCH_FIELDS.get(table,()) if public else TABLES[table].get('search',())
    clauses=[];args=[]
    for field in keys:
        if field not in TABLES[table]['columns'] or field in SECRET:continue
        clause,values=contains_predicate(table,field,term);clauses.append(clause);args.extend(values)
    return '('+' OR '.join(clauses)+')' if clauses else '1',args
