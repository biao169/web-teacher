"""Read-only, platform-neutral business snapshots and dependency-aware differences."""
from .catalog import TABLES, SECRET, TITLE, MODULES, label, Error
from .data_tools import digest, encoded
from backend.app.domain.richtext import body_references

PROTOCOL=1
PAGE=20
MAX_ROWS=2000
MAX_BYTES=4*1024*1024
SCOPES=tuple(t for t in TABLES if t in {
 'profiles','students','student_category_displays','research_interests','projects',
 'publications','patents','courses','news','navigation_items','site_settings',
 'global_settings','translation_cache','media_assets'})
PUBLIC_GLOBAL={'allow_public_registration','allow_anonymous_messages','news_pdf_engine',
 'news_pdf_allow_download','news_pdf_watermark','publication_display_style'}
OMIT={'id','created_at','updated_at','translation_job_state','error_message'}|SECRET

def columns(table):
    if table not in SCOPES:raise Error('不支持的同步范围')
    return [c for c in TABLES[table]['columns'] if c not in OMIT and
            (table!='global_settings' or c in PUBLIC_GLOBAL|{'uid'})]

def schema():
    return digest({t:{c:TABLES[t]['columns'][c] for c in columns(t)} for t in SCOPES})

def identity(table,row):
    return '@settings' if table in ('site_settings','global_settings') else row['uid']

def canonical(table,row):
    value={c:row.get(c) for c in columns(table)}
    if table in ('site_settings','global_settings'):value.pop('uid',None)
    if table=='media_assets' and value.get('storage_kind') in ('local','r2'):
        value['storage_kind']='managed'
    return value

async def revision(sql):
    # Application mutation paths issue monotonically changing updated_at values.
    rows=await sql.query(' UNION ALL '.join(
        "SELECT '"+t+"' AS name,uid,updated_at FROM \""+t+'\"' for t in SCOPES)+' ORDER BY name,uid LIMIT 2001')
    if len(rows)>MAX_ROWS:raise Error('本阶段预览最多2000条；未截断数据，也不会生成删除清单')
    return digest(rows)

async def page(sql,table,after='',expected=None):
    before=await revision(sql)
    if expected and before!=expected:raise Error('数据已变化，请重新生成预览',409)
    # Bound rows before fetching large text values (D1 and SQLite share this SQL).
    names=columns(table)
    size='+'.join('length(coalesce(CAST("'+c+'" AS BLOB),x\'\'))' for c in names)
    stats=await sql.query('SELECT uid,('+size+') AS bytes FROM "'+table+'" WHERE uid>? ORDER BY uid LIMIT 21',(after,))
    if any(r['bytes']>200000 for r in stats):raise Error('单条记录超过200KB，预览停止；没有忽略该记录')
    rows=await sql.query('SELECT '+','.join('"'+c+'"' for c in names)+' FROM "'+table+'" WHERE uid>? ORDER BY uid LIMIT 20',(after,))
    if len(encoded(rows))>1024*1024:raise Error('本页字段过大，请缩小记录内容后重试')
    total=(await sql.query('SELECT count(*) AS n FROM \"'+table+'\"'))[0]['n']
    if await revision(sql)!=before:raise Error('读取期间数据变化，请重新预览',409)
    return {'revision':before,'total':total,'rows':rows,'next':rows[-1]['uid'] if len(stats)>PAGE else None}

def references(table,row,inventory):
    refs=set(); unknown=[]
    for field,spec in TABLES[table]['columns'].items():
        target=spec.get('references',{});value=row.get(field)
        if not value or target.get('table') not in SCOPES:continue
        other=target['table']; key=target.get('column',target.get('field','uid'))
        matches=[(other,k) for k,r in inventory.get(other,{}).items() if r.get(key)==value]
        if not matches:unknown.append(field+' 引用不存在')
        refs.update(matches)
    bodies=[]
    if table=='news':bodies=[(row.get('content',''),row.get('content_format','html'))]
    # Conservative: include all retained translations, including stale ones.
    if table=='translation_cache':bodies=[(row.get('translated_text',''),'html'),(row.get('translated_text',''),'markdown')]
    for text,fmt in bodies:
        try:
            for uid in body_references(text or '',fmt):
                if uid in inventory.get('media_assets',{}):refs.add(('media_assets',uid))
                else:unknown.append('正文媒体不存在: '+uid)
        except Exception:unknown.append('正文引用无法确认')
    return refs,unknown

def compare(source,target,scopes):
    items={}
    for t in SCOPES:
        for key in sorted(source[t].keys()|target[t].keys()):
            a,b=source[t].get(key),target[t].get(key)
            if a is not None and b is not None and canonical(t,a)==canonical(t,b):continue
            if t=='translation_cache' and not ((a or {}).get('is_manual') or (b or {}).get('is_manual')):continue
            action='add' if b is None else 'delete' if a is None else 'update'
            row=a if a is not None else b
            ident=t+':'+key
            items[ident]={'id':ident,'table':t,'uid':key,'action':action,
                'title':str(row.get(TITLE[t]) or key)[:240], 'module_label':MODULES[t],
                'fields':[label(t,f) for f in columns(t) if f!='uid' and canonical(t,a or {}).get(f)!=canonical(t,b or {}).get(f)],
                'dependencies':[],'blocked':[], 'in_scope':t in scopes,
                'media_check':t=='media_assets' and row.get('storage_kind') in ('local','r2')}
    source_refs={};target_refs={}
    for inv,out in ((source,source_refs),(target,target_refs)):
        for t in SCOPES:
            for key,row in inv[t].items():out[(t,key)]=references(t,row,inv)
    for ident,item in items.items():
        key=(item['table'],item['uid'])
        if item['action']!='delete':
            refs,errors=source_refs[key];item['blocked'].extend(errors)
            for t,k in refs:
                dep=t+':'+k
                if dep in items and dep!=ident:item['dependencies'].append(dep)
        else:
            # A delete needs every target reference removed/replaced first.
            for ref,(refs,errors) in target_refs.items():
                if key not in refs:continue
                dep=':'.join(ref)
                if ref in source_refs and key in source_refs[ref][0]:
                    item['blocked'].append('来源仍被引用: '+dep)
                elif dep in items:item['dependencies'].append(dep)
                else:item['blocked'].append('引用无法解除: '+dep)
            if item['table']=='media_assets' and any(errors for _,errors in target_refs.values()):
                item['blocked'].append('部分引用无法确认，禁止删除媒体')
    return list(items.values())

def select(items,requested):
    index={x['id']:x for x in items}
    if not isinstance(requested,list) or any(k not in index for k in requested):raise Error('选择项无效')
    result=set(requested);todo=list(result)
    while todo:
        for key in index[todo.pop()]['dependencies']:
            if key not in result:result.add(key);todo.append(key)
    return {'selected':sorted(result),'automatic':sorted(result-set(requested)),
            'blocked':{k:index[k]['blocked'] for k in sorted(result) if index[k]['blocked']}}
