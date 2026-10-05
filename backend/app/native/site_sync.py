"""Read-only, platform-neutral business snapshots and dependency-aware differences."""
from functools import lru_cache
from .site_sync_diagnostics import traced
from .catalog import TABLES, SECRET, TITLE, MODULES, label, Error
from .data_tools import digest, encoded
from backend.app.domain.richtext import body_references

from .site_sync_work import PROTOCOL,VERSION_ROWS as REV_PAGE,CONTENT_ROWS as PAGE,TOTAL_ROWS as MAX_ROWS,TOTAL_BYTES as MAX_BYTES,PAGE_BYTES,RECORD_BYTES
from .site_sync_recovery import MODULES as SYNC_MODULES
SCOPES=tuple(t for t in TABLES if t in SYNC_MODULES)
PUBLIC_GLOBAL={'allow_public_registration','allow_anonymous_messages','news_pdf_engine',
 'news_pdf_allow_download','news_pdf_watermark','publication_display_style'}
OMIT={'id','created_at','updated_at','translation_job_state','error_message'}|SECRET

def columns(table):
    if table not in SCOPES:raise Error('不支持的同步范围')
    return [c for c in TABLES[table]['columns'] if c not in OMIT and
            (table!='global_settings' or c in PUBLIC_GLOBAL|{'uid'})]

@lru_cache(maxsize=1)
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

def page_limit(value,maximum):
    if value is None:return maximum
    if type(value) is not int or not 1<=value<=maximum:raise Error('同步分页大小无效',400)
    return value

def revision_fold(stamp,table,rows,*,first=False):
    # Table markers include empty tables; record order, never page boundaries, defines the digest.
    if first:stamp=digest([stamp,'table',table])
    for row in rows:stamp=digest([stamp,'record',row['uid'],row['updated_at']])
    return stamp

@traced('revision:page')
async def revision_page(sql,table,after='',limit=None):
    columns(table);limit=page_limit(limit,REV_PAGE)
    rows=await sql.query('SELECT uid,updated_at FROM "'+table+'" WHERE uid>? ORDER BY uid LIMIT '+str(limit+1),(after,))
    values=rows[:limit]
    return {'rows':values,'count':len(values),'next':values[-1]['uid'] if len(rows)>limit else None}

@traced('revision:read')
async def revision(sql):
    # Retain a bounded final execution guard; preview uses revision_page across requests.
    rows=await sql.query(' UNION ALL '.join(
        "SELECT '"+t+"' AS name,uid,updated_at FROM \""+t+'\"' for t in SCOPES)+' ORDER BY name,uid LIMIT 2001')
    if len(rows)>MAX_ROWS:raise Error('本阶段预览最多2000条；未截断数据，也不会生成删除清单')
    return revision_state({table:[{k:r[k] for k in ('uid','updated_at')} for r in rows if r['name']==table] for table in SCOPES})

def revision_state(state):
    """Reuse the already captured restore inventory instead of querying it again."""
    if any(t not in state for t in SCOPES):raise Error('版本清单缺少业务表，未提交',409)
    if sum(len(state[t]) for t in SCOPES)>MAX_ROWS:raise Error('同步记录超过2000条，未提交')
    stamp=''
    for table in sorted(SCOPES):
        values=sorted(state[table],key=lambda r:r['uid'])
        stamp=revision_fold(stamp,table,values,first=True)
    return stamp

@traced('page:read')
async def page(sql,table,after='',limit=None):
    # Only bounded UID/size metadata is read ahead. Oversized lookahead never blocks earlier rows.
    names=columns(table);limit=page_limit(limit,PAGE)
    size='+'.join('length(coalesce(CAST("'+c+'" AS BLOB),x\'\'))' for c in names)
    stats=await sql.query('SELECT uid,('+size+') AS bytes FROM "'+table+'" WHERE uid>? ORDER BY uid LIMIT '+str(limit+1),(after,))
    chosen=[];estimate=2
    overhead=sum(len(c.encode())*6+20 for c in names)
    for entry in stats[:limit]:
        cost=entry['bytes']*6+overhead
        if chosen and (estimate+cost>PAGE_BYTES or entry['bytes']>RECORD_BYTES):break
        if entry['bytes']>RECORD_BYTES:raise Error('单条记录超过200KB，请精简内容后重新预览：'+table+'/'+entry['uid'])
        chosen.append(entry['uid']);estimate+=cost
    if not chosen:return {'rows':[],'next':None,'bytes':2}
    rows=await sql.query('SELECT '+','.join('"'+c+'"' for c in names)+' FROM "'+table+'" WHERE uid IN ('+','.join('?' for _ in chosen)+') ORDER BY uid',tuple(chosen))
    if [r['uid'] for r in rows]!=chosen:raise Error('读取期间记录变化，请重新预览',409)
    kept=[];used=2
    for row in rows:
        count=len(encoded(row))
        if kept and (used+count+1>PAGE_BYTES or count>RECORD_BYTES):break
        if count>RECORD_BYTES:raise Error('单条记录序列化后超过200KB，请精简内容后重新预览：'+table+'/'+row['uid'])
        used+=count+(1 if kept else 0);kept.append(row)
    return {'rows':kept,'next':kept[-1]['uid'] if len(stats)>len(kept) else None,'bytes':used}


def reference_inputs(table,row,with_kind=False):
    """Share field/body semantics between indexed preview and execution verification."""
    inputs=[];errors=[]
    for field,spec in TABLES[table]['columns'].items():
        target=spec.get('references',{});value=row.get(field)
        if value and target.get('table') in SCOPES:
            item=(target['table'],target.get('column',target.get('field','uid')),value,field+' 引用不存在')
            inputs.append(item+((field,None),) if with_kind else item)
    bodies=[]
    if table=='news':bodies=[(row.get('content',''),row.get('content_format','html'))]
    if table=='translation_cache':bodies=[(row.get('translated_text',''),'html'),(row.get('translated_text',''),'markdown')]
    for text,fmt in bodies:
        try:
            for uid,kind in body_references(text or '',fmt).items():
                item=('media_assets','uid',uid,'正文媒体不存在: '+uid)
                inputs.append(item+((None,kind),) if with_kind else item)
        except Exception:errors.append('正文引用无法确认')
    return inputs,errors

def references(table,row,inventory):
    refs=set();inputs,errors=reference_inputs(table,row)
    for other,field,value,error in inputs:
        matches=[(other,key) for key,item in inventory.get(other,{}).items() if item.get(field)==value]
        if matches:refs.update(matches)
        else:errors.append(error)
    return refs,errors

def difference(table,key,a,b,scopes):
    # Absence at the source never propagates deletion of target media.
    if table=='media_assets' and a is None:return None
    # Normalize each side once, including when calculating changed field labels.
    ca=canonical(table,a or {});cb=canonical(table,b or {})
    if a is not None and b is not None and ca==cb:return None
    if table=='translation_cache' and not ((a or {}).get('is_manual') or (b or {}).get('is_manual')):return None
    row=a if a is not None else b
    return {'id':table+':'+key,'table':table,'uid':key,
            'action':'add' if b is None else 'delete' if a is None else 'update',
            'title':str(row.get(TITLE[table]) or key)[:240],'module_label':MODULES[table],
            'fields':[label(table,f) for f in columns(table) if f!='uid' and ca.get(f)!=cb.get(f)],
            'dependencies':[],'blocked':[],'in_scope':table in scopes,
            'media_check':table=='media_assets' and row.get('storage_kind') in ('local','r2')}

def compare(source,target,scopes):
    items={}
    for t in SCOPES:
        for key in sorted(source[t].keys()|target[t].keys()):
            a,b=source[t].get(key),target[t].get(key)
            item=difference(t,key,a,b,scopes)
            if item:items[item['id']]=item
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
