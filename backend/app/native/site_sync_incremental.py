"""Selected-record preparation and atomic one-record commits, shared by D1/SQLite.

Full rows live only in existing task-item storage. No global revision, snapshot,
whole-record digest, or end-of-job aggregation is used by this execution path.
"""
import json
from functools import lru_cache
from . import site_sync as core,site_sync_tasks as tasks,site_sync_preview as preview
from .site_sync_analysis import get,put,lookup_fields
from .catalog import Error,TABLES,TITLE,MODULES,now
from .data_tools import encoded
from .media_locks import lease,live_lease
from .media_references import REFERENCE_LOCK

@lru_cache(maxsize=1)
def table_order():
    pending={t:{v['references']['table'] for v in TABLES[t]['columns'].values()
                if v.get('references',{}).get('table') in core.SCOPES} for t in core.SCOPES}
    result=[]
    # Rich-text media links are not database foreign keys but still precede bodies.
    while pending:
        ready=sorted(t for t,refs in pending.items() if not refs)
        if not ready:raise Error('当前表结构存在循环引用，不能逐条同步',409)
        if 'media_assets' in ready:ready.remove('media_assets');ready.insert(0,'media_assets')
        for t in ready:result.append(t);pending.pop(t)
        for refs in pending.values():refs.difference_update(ready)
    result.remove('media_assets');result.insert(0,'media_assets')
    return tuple(result)

@lru_cache(maxsize=None)
def incoming(table):
    return tuple((t,f,v['references'].get('column','uid')) for t in sorted(TABLES)
                 for f,v in TABLES[t]['columns'].items() if v.get('references',{}).get('table')==table)

def context_fields(table):
    return sorted({'uid','created_at',TITLE[table]}|lookup_fields().get(table,set())|({'object_key','storage_kind'} if table=='media_assets' else set()))

async def record(sql,table,key,field='uid',head=False,context=False):
    names=core.columns(table)
    if field not in {'uid'}|lookup_fields().get(table,set()) or not isinstance(key,str) or not 1<=len(key)<=1024:
        raise Error('记录定位参数无效')
    singleton=table in ('site_settings','global_settings') and key=='@settings' and field=='uid'
    where='1' if singleton else '"'+field+'"=?';args=() if singleton else (key,)
    if context:names=context_fields(table)
    size='+'.join('length(coalesce(CAST("'+c+'" AS BLOB),x\'\'))' for c in names)
    expressions=[('substr("'+c+'",1,160) AS "'+c+'"') if context and c==TITLE[table] and c not in lookup_fields().get(table,set())|{'uid'} else '"'+c+'"' for c in names]
    extra=','+','.join(expr for c,expr in zip(names,expressions) if c!='uid') if context else '' if head else ',('+size+') AS bytes'
    rows=await sql.query('SELECT uid,updated_at'+extra+' FROM "'+table+'" WHERE '+where+' LIMIT 2',args)
    if len(rows)>1:raise Error('来源或目标记录定位不唯一：'+table,409)
    if not rows:return {'row':None,'uid':None,'stamp':None}
    meta=rows[0]
    if head:return {'uid':meta['uid'],'stamp':meta['updated_at']}
    if not context and meta['bytes']>core.RECORD_BYTES:raise Error('所选单条记录超过200KB：'+table+'/'+meta['uid'],413)
    values=[{c:meta[c] for c in names}] if context else await sql.query('SELECT '+','.join(expressions)+' FROM "'+table+'" WHERE uid=? AND updated_at=?',(meta['uid'],meta['updated_at']))
    if not values:raise Error('读取期间条目发生变化，请重新准备',409)
    if len(encoded(values[0]))>core.RECORD_BYTES:raise Error('所选单条记录编码后超过200KB',413)
    return {'row':values[0],'uid':meta['uid'],'stamp':meta['updated_at']}

async def dependents(sql,table,key,index,after):
    core.columns(table);relations=incoming(table)
    if type(index) is not int or not 0<=index<len(relations) or not isinstance(after,str) or len(after)>128:raise Error('引用分页参数无效')
    other,field,target=relations[index]
    # Source key is canonical UID, except singleton settings (no incoming links).
    rows=await sql.query('SELECT uid FROM "'+other+'" WHERE "'+field+'"=(SELECT "'+target+'" FROM "'+table+'" WHERE uid=?) AND uid>? ORDER BY uid LIMIT 2',(key,after))
    return {'rows':rows[:1],'next':rows[0]['uid'] if len(rows)>1 else None}

async def remote(r,task,data):
    from .site_sync_apply import fetch
    return await fetch(r,task,data)

async def read(r,task,side,table,key,field='uid',head=False,context=False):
    if side=='local':return await record(r.sql,table,key,field,head,context)
    result=await remote(r,task,{'op':'record-head' if head else 'record-context' if context else 'record','table':table,'key':key,'field':field})
    row=result.get('row');stamp=result.get('stamp');uid=result.get('uid')
    if uid is not None and (not isinstance(uid,str) or not 1<=len(uid)<=128 or not isinstance(stamp,str) or len(stamp)>64):raise Error('对端记录版本无效',409)
    if not head and row is not None:
        if not isinstance(row,dict) or set(row)!=set(context_fields(table) if context else core.columns(table)) or row.get('uid')!=uid or len(encoded(row))>core.RECORD_BYTES:raise Error('对端记录字段或大小无效',409)
    if not head and (row is None)!=(uid is None):raise Error('对端记录响应不完整',409)
    return result

def initialize(state,parent):
    ids=parent['selection']['selected']
    state.update(incremental=True,lightweight=True,prepared=False,phase='selected-load',parent_uid=parent['uid'],
                 selection={'selected':list(ids),'automatic':[],'blocked':{}},load_index=0,check_index=0,
                 count=0,candidate_count=len(ids),media=[],media_bytes=0,auto_latest=bool(parent.get('latest_only')))
    state.pop('candidate_requested',None)

def sides(s):return ('remote','local') if s['direction']=='pull' else ('local','remote')

async def plan(sql,task,ident):
    table,key=ident.split(':',1)
    return await get(sql,task['uid'],'local',preview.CANDIDATE+table,key)

def queue(s,ident):
    if ident not in s['selection']['selected']:
        maximum=core.MAX_ROWS if s.get('auto_latest') else 500
        if len(s['selection']['selected'])>=maximum:raise Error('所选条目及必要依赖超过'+str(maximum)+'项，请缩小范围')
        s['selection']['selected'].append(ident);s['selection']['automatic'].append(ident);s['candidate_count']+=1

async def advance(r,task,p=None):
    s=task['state'];source,target=sides(s);statements=[];uid=task['uid']
    p=p or await tasks.peer(r.sql)
    if p['revision']!=s['peer_revision']:raise Error('连接配置变化，请重新准备',409)
    if s['phase']=='selected-check':
        if s['check_index']>=len(s['selection']['selected']):
            s.update(phase='complete',prepared=True)
            table_order() # reject unsupported schema cycles before consent
            await tasks.persist(r.sql,task,status='ready');return {'uid':uid,'status':'ready','lightweight':True,'approval':s.get('approval')}
        ident=s['selection']['selected'][s['check_index']];item=await plan(r.sql,task,ident)
        n=s.get('check_ref',0);refs=item.get('references',[])
        if item['action']!='delete' and n<len(refs):
            ref=refs[n];other=await plan(r.sql,task,ref['id'])
            if other['action']=='delete':raise Error('来源条目仍引用待删除项：'+ident+' → '+ref['id'],409)
            if other['table']=='media_assets':
                from .media_policy import check_type
                asset=await get(r.sql,uid,source,'media_assets',other['uid'])
                if asset['status']!='active':raise Error('来源引用的媒体仍在回收站：'+ref['id'],409)
                if ref['field']:check_type(item['table'],ref['field'],asset['mime_type'])
                if ref['kind']=='image' and asset['mime_type'] not in ('image/png','image/jpeg','image/gif','image/webp'):raise Error('正文图片媒体类型不适用',409)
                ref['mime_type']=asset['mime_type']
                statements=[put(uid,'local',preview.CANDIDATE+item['table'],item['uid'],item)]
            s['check_ref']=n+1
        else:s['check_index']+=1;s['check_ref']=0
    elif s['load_index']>=len(s['selection']['selected']):s['phase']='selected-check'
    else:
        ident=s['selection']['selected'][s['load_index']];table,key=ident.split(':',1)
        current=s.setdefault('current',{'stage':'source','ref_index':0,'back_index':0,'after':''})
        item=await plan(r.sql,task,ident)
        if current['stage']=='source':
            a=await read(r,task,source,table,key)
            original=await get(r.sql,s['parent_uid'],'local',preview.CANDIDATE+table,key)
            if original and (original['action']=='delete')!=(a['row'] is None):raise Error('候选操作已变化，请重新预览：'+ident,409)
            if table=='media_assets' and a['row'] is None:
                if s.get('skip_missing') and ident not in s['selection']['automatic']:return await skip_missing(r,task,ident)
                raise Error('媒体已在来源删除，不参与同步；请重新预览',409)
            item={'id':ident,'table':table,'uid':key,'title':str((a['row'] or {}).get(TITLE[table]) or key)[:160],
                  'module_label':MODULES[table],'fields':[],'dependencies':[],'references':[],'blocked':[],'in_scope':table in s['scopes'],
                  'candidate':True,'source_uid':a['uid'],'source_stamp':a['stamp'],'action':'update' if a['row'] is not None else 'delete'}
            statements=[put(uid,source,table,key,a['row'])]
            current['stage']='target'
        elif current['stage']=='target':
            b=await read(r,task,target,table,key,context=True)
            item.update(target_uid=b['uid'],target_stamp=b['stamp'])
            a=await get(r.sql,uid,source,table,key)
            if a is None and b['row'] is None:
                if s.get('skip_missing') and ident not in s['selection']['automatic']:return await skip_missing(r,task,ident)
                raise Error('条目已不存在，请重新预览：'+ident,409)
            if a is not None and b['row'] is None:item['action']='add'
            if a is None:item['title']=str((b['row'] or {}).get(TITLE[table]) or key)[:160]
            if source=='remote':r.auth.require(r.p,table,{'add':'create','update':'edit','delete':'delete'}[item['action']])
            statements=[put(uid,target,table,key,b['row'])]
            if a is not None:
                from .data_restore import normalize_record
                normalized=normalize_record(r,table,dict(a,uid=b['uid'] or a['uid']),b['row'] or {})
                statements.append(put(uid,'local','@write:'+table,key,normalized))
                inputs,errors=core.reference_inputs(table,a,with_kind=True)
                if errors:raise Error('；'.join(errors),409)
                if len(inputs)>20:raise Error('单条引用超过20项，请精简后重试')
                current['refs']=inputs;current['stage']='refs'
                if table=='media_assets':
                    from .site_sync_execute_plan import media_entry
                    media=media_entry(a,b['row'])
                    if media:
                        from .site_sync_media import TOTAL_LIMIT
                        if len(s['media'])>=100 or s['media_bytes']+media['size']>TOTAL_LIMIT:raise Error('本次媒体超过100个或24MiB，请分批选择')
                        s['media'].append(media);s['media_bytes']+=media['size']
            else:current['stage']='back'
        elif current['stage']=='refs':
            refs=current['refs'];n=current['ref_index']
            if n<len(refs):
                other,field,value,message,requirement=refs[n]
                found=await read(r,task,source,other,str(value),field,head=True)
                if found.get('uid') is None:raise Error(message,409)
                dep=other+':'+found['uid']
                if dep!=ident and dep not in item['dependencies']:item['dependencies'].append(dep);queue(s,dep)
                item['references'].append({'id':dep,'field':requirement[0],'kind':requirement[1]})
                current['ref_index']+=1
            else:s['load_index']+=1;s['count']+=1;s.pop('current',None)
        else:
            relations=incoming(table);n=current['back_index']
            if n<len(relations):
                other=relations[n][0]
                if target=='local':part=await dependents(r.sql,table,item['target_uid'],n,current['after'])
                else:part=await remote(r,task,{'op':'record-dependents','table':table,'key':item['target_uid'],'index':n,'after':current['after']})
                rows=part.get('rows');more=part.get('next')
                if not isinstance(rows,list) or len(rows)>1:raise Error('引用分页无效',409)
                for row in rows:
                    if not isinstance(row,dict) or not isinstance(row.get('uid'),str) or not current['after']<row['uid'] or len(row['uid'])>128:raise Error('引用游标无效',409)
                    if other not in core.SCOPES:raise Error('待删除条目仍被同步范围外的业务表引用：'+other,409)
                    dep=other+':'+core.identity(other,row)
                    if dep!=ident and dep not in item['dependencies']:item['dependencies'].append(dep);queue(s,dep)
                if more is not None:
                    if not rows or more!=rows[0]['uid']:raise Error('引用分页不完整',409)
                    current['after']=more
                else:current['back_index']+=1;current['after']=''
            else:s['load_index']+=1;s['count']+=1;s.pop('current',None)
        if item:statements.append(put(uid,'local',preview.CANDIDATE+table,key,item))
    await tasks.persist(r.sql,task,statements)
    return {'uid':uid,'status':'reading','phase':s['phase'],'count':s['count']}

async def skip_missing(r,task,ident):
    """A requested item may disappear while a proposal waits; absent media never deletes target."""
    s=task['state'];table,key=ident.split(':',1)
    s['selection']['selected'].remove(ident);s['candidate_count']-=1;s['skipped']+=1;s.pop('current',None)
    await tasks.persist(r.sql,task,[("DELETE FROM sync_task_items WHERE task_uid=? AND record_uid=? AND module IN (?,?,?)",
                                  (task['uid'],key,table,preview.CANDIDATE+table,'@write:'+table))])
    return {'uid':task['uid'],'status':'reading','phase':s['phase']}

async def choose(r,task,ids):
    """Prepared approval selection: indexed dependency closure; never read whole record bodies."""
    s=task['state']
    if not s.get('approval',{}).get('ready') or not s.get('prepared'):raise Error('请先完成审批准备',409)
    if not isinstance(ids,list) or len(ids)>500 or any(not isinstance(v,str) or ':' not in v or len(v)>256 for v in ids):raise Error('每次最多选择500项')
    ids=sorted(set(ids));raw=encoded(ids).decode()
    # UNION deduplicates shared/cyclic dependencies; only prepared candidate keys are traversed.
    rows=await r.sql.query("""WITH RECURSIVE chosen(ident) AS (
        SELECT value FROM json_each(?) UNION
        SELECT dep.value FROM chosen c JOIN sync_task_items t
          ON t.task_uid=? AND t.side='local'
          AND t.module=?||substr(c.ident,1,instr(c.ident,':')-1)
          AND t.record_uid=substr(c.ident,instr(c.ident,':')+1)
          JOIN json_each(t.payload,'$.dependencies') dep
        ) SELECT c.ident,t.record_uid FROM chosen c LEFT JOIN sync_task_items t
          ON t.task_uid=? AND t.side='local'
          AND t.module=?||substr(c.ident,1,instr(c.ident,':')-1)
          AND t.record_uid=substr(c.ident,instr(c.ident,':')+1) LIMIT 501""",
          (raw,task['uid'],preview.CANDIDATE,task['uid'],preview.CANDIDATE))
    if len(rows)>500 or any(v['record_uid'] is None for v in rows):raise Error('选择或依赖不在已准备范围内，或超过500项')
    selected=sorted(v['ident'] for v in rows)
    s['selection']={'selected':selected,'automatic':sorted(set(selected)-set(ids)),'blocked':{}}
    await tasks.persist(r.sql,task,status=task['status'])
    return s['selection']

async def begin(r,task,approval=False):
    from .site_sync_apply import progress
    s=task['state']
    if not s.get('prepared') or s['direction']!='pull':raise Error('请完成按需准备后在本站确认拉取',409)
    if not s['selection']['selected'] and (not approval or s['candidate_count']):raise Error('请选择需要执行的条目')
    p=await tasks.peer(r.sql);hello=await tasks.hello(r,p)
    if p['revision']!=s['peer_revision'] or hello['site_id']!=s['remote_id'] or hello.get('selected_execute')!=1:raise Error('两站配置或能力变化，请配套更新并重新准备',409)
    selected_tables={v.split(':',1)[0] for v in s['selection']['selected']}
    approval_sql=[]
    if approval:
        from .site_sync_proposals import approval_statements
        approval_sql=await approval_statements(r,task)
    selected=set(s['selection']['selected'])
    media=[v for v in s.pop('media') if 'media_assets:'+v['uid'] in selected]
    s['execution']={'phase':'download' if selected else 'done','selected':list(s['selection']['selected']),'media':media,
                    'file_index':0,'offset':0,'bytes':0,'committed':False,'applied':0,'cleanup_index':0,'cleanup_offset':0,
                    'cancelled':False,'write_table':0,'write_after':'','write_delete':False,
                    'write_tables':[t for t in table_order() if t in selected_tables]}
    await tasks.persist(r.sql,task,[*approval_sql,r.content.audit(r.p,'data_tools','sync_pull_begin',task['uid'],{'mode':'one-record','selected':len(s['selection']['selected'])})],status='ready')
    return progress(task)

async def write_one(r,task):
    s=task['state'];e=s['execution'];uid=task['uid'];tables=e['write_tables']
    if e['write_delete']:tables=tuple(reversed(tables))
    if e['write_table']>=len(tables):
        if not e['write_delete']:e.update(write_delete=True,write_table=0,write_after='')
        else:e['phase']='cleanup'
        await tasks.persist(r.sql,task,status='ready');return
    table=tables[e['write_table']]
    rows=await r.sql.query("SELECT record_uid,payload FROM sync_task_items WHERE task_uid=? AND side='local' AND module=? AND record_uid>? AND json_extract(payload,'$.id') IN (SELECT value FROM json_each(?)) AND json_extract(payload,'$.action')"+('=' if e['write_delete'] else '<>')+"'delete' ORDER BY record_uid LIMIT 1",(uid,preview.CANDIDATE+table,e['write_after'],encoded(e['selected']).decode()))
    if not rows:
        e['write_table']+=1;e['write_after']='';await tasks.persist(r.sql,task,status='ready');return
    key=rows[0]['record_uid'];item=json.loads(rows[0]['payload'])
    remote_head=await read(r,task,'remote',table,key,head=True)
    if remote_head.get('uid')!=item['source_uid'] or remote_head.get('stamp')!=item['source_stamp']:raise Error('来源条目变化，请重新准备：'+item['id'],409)
    async with lease(r,REFERENCE_LOCK,'edit') as owner:
        old=await record(r.sql,table,key,context=True)
        if old['uid']!=item['target_uid'] or old['stamp']!=item['target_stamp']:raise Error('本站条目变化；已完成条目保留，请重新准备：'+item['id'],409)
        action={'add':'create','update':'edit','delete':'delete'}[item['action']]
        r.auth.require(r.p,table,action)
        target_uid=item['target_uid'] or item['source_uid'];conditions=[];args=[]
        if old['uid'] is None:
            conditions.append('NOT EXISTS(SELECT 1 FROM "'+table+'" WHERE uid=?)');args.append(target_uid)
        else:
            conditions.append('EXISTS(SELECT 1 FROM "'+table+'" WHERE uid=? AND updated_at=?)');args.extend((target_uid,old['stamp']))
        if table in ('site_settings','global_settings'):
            conditions.append('NOT EXISTS(SELECT 1 FROM "'+table+'" WHERE uid<>?)');args.append(target_uid)
        if item['action']=='delete':
            if table=='media_assets':raise Error('媒体删除不参与同步',409)
            for other,field,target in incoming(table):
                conditions.append('NOT EXISTS(SELECT 1 FROM "'+other+'" WHERE "'+field+'"=?)');args.append(old['row'].get(target))
            mutation=('DELETE FROM "'+table+'" WHERE uid=?',(target_uid,))
        else:
            row=await get(r.sql,uid,'local','@write:'+table,key)
            row['updated_at']=now(after=old['stamp'])
            # References were resolved during preparation; guard current target assets/parents.
            for field,spec in TABLES[table]['columns'].items():
                ref=spec.get('references');value=row.get(field)
                if not ref or value is None:continue
                other=ref['table'];column=ref.get('column','uid')
                conditions.append('EXISTS(SELECT 1 FROM "'+other+'" WHERE "'+column+'"=?)');args.append(value)
            for ref in item.get('references',[]):
                if ref['id'].startswith('media_assets:'):
                    conditions.append("EXISTS(SELECT 1 FROM media_assets WHERE uid=? AND status='active' AND mime_type=?)");args.extend((ref['id'].split(':',1)[1],ref['mime_type']))
            if table=='media_assets':
                conditions.append("NOT EXISTS(SELECT 1 FROM admin_mutation_guards WHERE module='media-purge' AND json_extract(target_uid,'$.uid')=?)");args.append(target_uid)
            if table=='media_assets' and row['storage_kind']!='external':
                from .media_inventory_store import inventory
                media=next(m for m in e['media'] if m['uid']==item['source_uid'])
                head=await inventory(r.media_store).head(media['key'])
                if not head or head['version']!=media['target_version'] or head['size']!=media['size']:raise Error('媒体尚未准备好或文件已变化',409)
                row['checksum']=media['sha256']
            cols=[c for c in row if c!='id']
            # Never overwrite target-only secrets/configuration fields from public sync data.
            updates=[c for c in core.columns(table) if c!='uid']+['updated_at']
            mutation=('INSERT INTO "'+table+'" ('+','.join('"'+c+'"' for c in cols)+') VALUES('+','.join('?' for _ in cols)+') ON CONFLICT(uid) DO UPDATE SET '+','.join('"'+c+'"=excluded."'+c+'"' for c in updates),tuple(row[c] for c in cols))
        lock,values=live_lease(REFERENCE_LOCK,owner);conditions.append(lock);args.extend(values)
        gid,guard=r.auth.guard(r.p,table,action,' AND '.join(conditions),tuple(args))
        e['applied']+=1;e['committed']=True;e['write_after']=key
        item['applied']=True
        # Business mutation and cursor share one atomic batch. Lost replies cannot double-write.
        try:await tasks.persist(r.sql,task,[guard,mutation,put(uid,'local',preview.CANDIDATE+table,key,item),
            r.content.audit(r.p,table,'sync_record_'+item['action'],target_uid,{'task':uid}),
            ('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))],status='ready')
        except Exception as exc:
            if 'constraint' in str(exc).lower():raise Error('本条记录的权限、引用、唯一字段或版本已变化；本条未提交，已完成条目保留',409,'sync_conflict') from exc
            raise
