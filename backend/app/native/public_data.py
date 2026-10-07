"""Bounded public list projections; full details still use the existing authorized reader."""
from .catalog import TABLES,Error
from backend.app.domain.public_projects import project_role,project_role_expression,ROLE_LABELS
BATCH_SIZE=10
MAX_BATCH_SIZE=20
PUBLIC_FIELDS={
 'profiles':('uid','name','name_en','title','organization','role','lab','bio','bio_en','recruiting','avatar_key','email','phone','office','orcid','personal_homepage','google_scholar','dblp','github','cnki','orcid_value','personal_homepage_value','google_scholar_value','dblp_value','github_value','cnki_value','contact_visibility','is_featured','sort_order'),
 'students':('uid','name','name_en','degree','category','grade','direction','status','bio','email','contact_visibility','avatar_key','enrollment_date','graduation_date','destination','awards','homepage'),
 'research_interests':('uid','name','name_en','description'),
 'projects':('uid','name','source','fund_name','principal','project_role','project_number','start_date','end_date','status','amount','members'),
 'publications':('uid','title','authors','venue','year','volume','issue','pages','corresponding_authors','publication_type','author_role','index_type','display_tags','url','doi','pdf_key','pdf_visibility','citation_gbt','citation_elsevier','citation_apa','citation_ieee','highlight_gbt','highlight_elsevier','highlight_apa','highlight_ieee'),
 'patents':('uid','name','patent_type','country','application_number','grant_number','application_date','grant_date','legal_status','inventors','owner','summary','certificate_key'),
 'courses':('uid','name','semester','audience','summary','syllabus_key','material_key','material_visibility'),
 'news':('uid','title','category','cover_key','published_at'),
}
SNIPPETS={'bio','bio_en','summary'}
DEFAULT_SORT={table:('student_category' if table=='students' else 'sort_order') for table in PUBLIC_FIELDS}
HOME_FIELDS={'publications':('homepage_publication_limit',6),'projects':('homepage_project_limit',10),'news':('homepage_news_limit',5),'students':('homepage_student_limit',0),'patents':('homepage_patent_limit',0)}
CITATION_STYLES=('gbt','elsevier','apa','ieee')
def project_private_allowed(principal):
    """Use the live system-role marker, never a role name or a client flag."""
    return bool(principal and principal.get('is_system')==1
                and not principal.get('must_change_password')
                and principal.get('permissions',{}).get('projects',{}).get('can_view'))

def citation_style(site):
    value=(site or {}).get('publication_citation_style','gbt')
    return value if value in CITATION_STYLES else 'gbt'


def page_number(value):
    try:return max(1,int(value))
    except (TypeError,ValueError):raise Error('页码无效') from None

async def public_listing(r,table,query,site=None,home=False,profile_overview=False,*,fixed_conditions=None):
    """One SQL page per request; home totals cap all subsequent pages as well as the first."""
    if table not in PUBLIC_FIELDS:raise Error('页面不存在',404)
    if fixed_conditions is not None:
        from .filtering import normalize_conditions
        fixed_conditions=normalize_conditions(table,fixed_conditions,public=True)
    q=dict(query);q.pop('home',None)
    limit=None
    if home:
        if table not in HOME_FIELDS:raise Error('此模块没有首页分页',400)
        field,default=HOME_FIELDS[table];value=(site or {}).get(field)
        limit=max(0,int(default if value is None else value))
        if not limit:return {'rows':[],'total':0,'page':1,'pages':1,'size':BATCH_SIZE,'query':{'home':'1','size':BATCH_SIZE,'page':1}}
        q={'size':BATCH_SIZE,'page':min(page_number(q.get('page',1)),max(1,(limit+BATCH_SIZE-1)//BATCH_SIZE)),'f.is_featured':1}
    else:
        try:size=int(q.get('size',BATCH_SIZE))
        except (TypeError,ValueError):raise Error('每页数量无效') from None
        if size not in (10,20,50,100):raise Error('每页支持10、20条；旧50/100链接按20条分批读取')
        q['size']=min(size,MAX_BATCH_SIZE)
    default=DEFAULT_SORT.get(table,'created_at')
    if default!='student_category' and default not in TABLES[table]['columns']:default='created_at'
    # Public presentation has one configured order; normalize legacy field-sort URLs.
    q['sort']=default;q['direction']='desc' if q.get('direction')=='desc' else 'asc'
    projection=[f for f in PUBLIC_FIELDS[table] if f in TABLES[table]['columns']]
    if table=='profiles' and not profile_overview:
        projection=[f for f in projection if f!='recruiting']
    # The principal is freshly resolved by resources() for every HTTP request.
    if table=='projects' and not project_private_allowed(getattr(r,'p',None)):
        projection=[f for f in projection if f not in ('principal','amount','members')]
    style=citation_style(site)
    if table=='publications':projection=[f for f in projection if not f.startswith(('citation_','highlight_')) or f in ('citation_'+style,'highlight_'+style)]
    limits={f:65537 for f in projection if TABLES[table]['columns'][f]['kind'] in ('text','json')}
    result=await r.content.listing(table,public=True,query=q,projection=projection,projection_limits=limits,homepage_contacts=table=='profiles' and profile_overview,fixed_conditions=fixed_conditions)
    for row in result['rows']:
        if row.get('contact_visibility')!='public':
            # Homepage faculty keeps public office/email; phone remains filtered server-side.
            fields=('phone',) if table=='profiles' and profile_overview else ('email','phone','office')
            for field in fields:row.pop(field,None)
        if table=='publications':row['_citation_style']=style;row['_citation_text']=row.get('citation_'+style) or ''
    if limit is not None:
        result['total']=min(result['total'],limit)
        result['pages']=max(1,(result['total']+result['size']-1)//result['size'])
        result['rows']=result['rows'][:max(0,limit-(result['page']-1)*result['size'])]
    q['page']=result['page']
    if home:q={'home':'1','page':result['page'],'size':result['size']}
    result['query']=q
    return result

async def public_media_map(r,data):
    """Only resolve keys referenced by this response, never scan the whole media library."""
    keys=sorted({row.get(f) for rows in data.values() for row in rows for f in ('avatar_key','cover_key','pdf_key','certificate_key','syllabus_key','material_key','logo_key','favicon_key') if row.get(f) and (f!='pdf_key' or row.get('pdf_visibility')=='public') and (f!='material_key' or row.get('material_visibility')=='public')})
    result={}
    types={}
    for offset in range(0,len(keys),40):
        batch=keys[offset:offset+40]
        rows=await r.sql.query("SELECT uid,object_key,mime_type FROM media_assets WHERE status='active' AND object_key IN ("+','.join('?' for _ in batch)+')',batch)
        result.update({m['object_key']:m['uid'] for m in rows})
        types.update({m['object_key']:m['mime_type'] for m in rows})
    for row in data.get('news',[]):
        row['_cover_type']=types.get(row.get('cover_key'),'')
    for row in data.get('courses',[]):
        row['_attachment_types']={f:types.get(row.get(f),'') for f in ('syllabus_key','material_key') if f!='material_key' or row.get('material_visibility')=='public'}
    return result

def trim_snippets(row,table=None):
    """Trim only after exact-source translation lookup; never hash a shortened original."""
    for f in SNIPPETS-({'summary'} if table=='patents' else set()):
        if isinstance(row.get(f),str) and len(row[f])>2000:
            row.setdefault('_truncated_fields',[]).append(f)
            row[f]=row[f][:2000]+'…'

# One preset catalog for public controls, aggregation and exact filtering.
PEOPLE_FACETS={
 'profiles':(('title','职称','Title'),('organization','单位','Organization')),
 'students':(('category','学生分类','Category'),('degree','学位','Degree'),('grade','年级','Cohort'),('status','状态','Status'),('direction','研究方向','Research area')),
 'publications':(('publication_type','论文类型','Paper type'),('year','年份','Year'),('index_type','收录类型','Index'),('venue','期刊/会议','Journal / Conference')),
 'projects':(('source','来源','Source'),('fund_name','基金计划','Fund / Program'),('status','状态','Status'),('project_role','承担角色','Role')),
 'patents':(('patent_type','类型','Type'),('legal_status','法律状态','Legal status'),('country','国家/地区','Country / Region'),('application_year','申请年份','Filed year'),('grant_year','授权年份','Granted year')),
 'news':(('category','分类','Category'),('published_year','发布年份','Published year')),
 'courses':(('semester','学期','Semester'),('audience','授课对象','Audience')),
}
FACET_BATCH=50
DERIVED_YEARS={'news':{'published_year':'published_at'},'patents':{'application_year':'application_date','grant_year':'grant_date'}}

def facet_column(table,field):
    """Only trusted catalog fields may become SQL identifiers."""
    if field not in {f[0] for f in PEOPLE_FACETS.get(table,())}:raise Error('不支持此公开分类',404)
    original=DERIVED_YEARS.get(table,{}).get(field,field)
    return f'"{table}"."{original}"'

def year_expression(column):
    value=f'trim(CAST({column} AS TEXT))'
    return f"CASE WHEN substr({value},1,4) GLOB '[0-9][0-9][0-9][0-9]' AND substr({value},5,1)='-' THEN substr({value},1,4) END"

def facet_parts(column,source=''):
    """Same ; / fullwidth ; / CR / LF delimiters as existing history suggestions.
    SQLite/D1 recursion keeps quotes, backslashes and literal wildcard characters intact.
    Source is an internal scoped SELECT suffix, never user SQL.
    """
    value=f"replace(replace(replace(coalesce(CAST({column} AS TEXT),''),'；',';'),char(13),';'),char(10),';')"
    return f"WITH RECURSIVE facet_parts(value,rest) AS (SELECT '',{value}||';' {source} UNION ALL SELECT trim(substr(rest,1,instr(rest,';')-1),char(9)||' '),substr(rest,instr(rest,';')+1) FROM facet_parts WHERE rest<>'') "

def public_filter(table,field,value):
    """Public-only predicates, shared with the facet catalog. Admin equality is unchanged."""
    from .suggestions import MULTIVALUE
    from .filtering import fields
    allowed=set(fields(table,public=True))|set(DERIVED_YEARS.get(table,{}))
    if field not in allowed:raise Error('不支持此公开筛选字段')
    if field in DERIVED_YEARS.get(table,{}):
        return year_expression(facet_column(table,field))+'=?',[str(value)]
    if field not in TABLES[table]['columns']:raise Error('未知筛选列')
    column=f'"{table}"."{field}"'
    if table=='projects' and field=='project_role':
        expression=project_role_expression('value')
        return f'({column}=? OR EXISTS ('+facet_parts(column)+f"SELECT 1 FROM facet_parts WHERE value<>'' AND {expression}=? COLLATE NOCASE))",[value,project_role(value)]
    if field in MULTIVALUE.get(table,set()) and field in {f[0] for f in PEOPLE_FACETS.get(table,())}:
        # Retain old combined-value links, while a new individual option matches a whole token.
        return f'({column}=? OR EXISTS ('+facet_parts(column)+"SELECT 1 FROM facet_parts WHERE value<>'' AND value=? COLLATE NOCASE))",[value,str(value).strip()]
    return column+'=?',[value]

async def people_facet(content,table,field,page=1,*,fixed_conditions=None,lang='zh'):
    if lang not in ('zh','en'):raise Error('页面语言无效')
    from .suggestions import MULTIVALUE
    column=facet_column(table,field)
    page=page_number(page)
    if page>1000000:raise Error('分类页码超出范围')
    where,args=content.scope(table,public=True,fixed_conditions=fixed_conditions)
    # All aggregation uses the entire public scope, not the filtered/current list page.
    source=f'FROM "{table}" WHERE '+where
    if field in DERIVED_YEARS.get(table,{}):
        expression=year_expression(column)
        sql=f'SELECT DISTINCT {expression} AS value {source} AND {expression} IS NOT NULL ORDER BY value DESC'
    elif table=='projects' and field=='project_role':
        expression=project_role_expression('value')
        sql=facet_parts(column,source)+f"SELECT min({expression}) AS value FROM facet_parts WHERE value<>'' GROUP BY {expression} COLLATE NOCASE ORDER BY value COLLATE NOCASE,value"
    elif field in MULTIVALUE.get(table,set()):
        sql=facet_parts(column,source)+"SELECT min(value) AS value FROM facet_parts WHERE value<>'' GROUP BY value COLLATE NOCASE ORDER BY value COLLATE NOCASE,value"
    else:
        order='value DESC' if field=='year' else 'value COLLATE NOCASE,value'
        sql=f'SELECT DISTINCT {column} AS value {source} AND {column} IS NOT NULL AND length(trim({column}))>0 ORDER BY '+order
    rows=await content.sql.query(sql+' LIMIT ? OFFSET ?',(*args,FACET_BATCH+1,(page-1)*FACET_BATCH))
    values=[str(row['value']) for row in rows[:FACET_BATCH]]
    labels={}
    if lang=='en':
        from .public_translation import facet_labels
        labels=await facet_labels(content,table,field,values,fixed_conditions)
    return {'table':table,'field':field,'page':page,'values':values,'labels':labels,'has_more':len(rows)>FACET_BATCH,**({'labels_en':ROLE_LABELS} if table=='projects' and field=='project_role' else {})}

async def people_facets(content,table,*,fixed_conditions=None,lang='zh',query=None):
    result=[]
    for field,zh,en in PEOPLE_FACETS.get(table,()):
        item=await people_facet(content,table,field,fixed_conditions=fixed_conditions,lang=lang)
        current=(query or {}).get('f.'+field)
        if lang=='en' and current and current not in item['values']:
            from .public_translation import facet_labels
            where,args=content.scope(table,public=True,fixed_conditions=fixed_conditions)
            condition,params=public_filter(table,field,current)
            if await content.sql.query(f'SELECT 1 FROM "{table}" WHERE '+where+' AND '+condition+' LIMIT 1',[*args,*params]):
                item['labels'].update(await facet_labels(content,table,field,[current],fixed_conditions))
        result.append(item|{'label':zh,'label_en':en})
    return result
