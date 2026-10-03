"""Bounded execution planning reuses the persisted preview reference graph."""
from . import site_sync_analysis as snapshots
from .catalog import Error
from .site_sync_media import FILE_LIMIT,TOTAL_LIMIT

def media_entry(row,old):
    if old and (old['object_key']!=row['object_key'] or (old['storage_kind']=='external')!=(row['storage_kind']=='external')):
        raise Error('已有媒体的存储路径或类型发生变化；请以新媒体条目替换引用后同步，避免覆盖旧文件')
    if row['storage_kind']=='external':return None
    size=row['size']
    if type(size) is not int or not 0<size<=FILE_LIMIT:raise Error('同步单个媒体文件须为1字节至20MiB')
    return {'uid':row['uid'],'key':row['object_key'],'size':size,'mime_type':row['mime_type'],
            'source_checksum':row.get('checksum'),'version':None,'sha256':None,'created_version':None}

async def prepare_selection(r,task,selected):
    s=task['state'];uid=task['uid']
    p=s.setdefault('begin_plan',{'index':0,'keys':[],'media_index':0,'media':[],'bytes':0})
    if p['index']<len(selected):
        ident=selected[p['index']];item=next(v for v in s['items'] if v['id']==ident)
        table,key=item['table'],item['uid']
        r.auth.require(r.p,table,{'add':'create','update':'edit','delete':'delete'}[item['action']])
        if table=='media_assets' and item['action']=='delete':raise Error('媒体删除不参与同步，请重新预览',409)
        if item['action']!='delete':
            meta=await snapshots.get(r.sql,uid,'remote',snapshots.REFS+table,key,{'refs':[]})
            keys=[ref for other,ref in meta['refs'] if other=='media_assets']
            if table=='media_assets':keys.append(key)
            p['keys']=sorted(set(p['keys'])|set(keys))
        p['index']+=1
        return False
    if p['media_index']<len(p['keys']):
        key=p['keys'][p['media_index']]
        row=await snapshots.get(r.sql,uid,'remote','media_assets',key)
        old=await snapshots.get(r.sql,uid,'local','media_assets',key)
        if not row:raise Error('媒体快照不完整，请重新预览',409)
        media=media_entry(row,old)
        if media:
            p['bytes']+=media['size']
            if len(p['media'])>=100 or p['bytes']>TOTAL_LIMIT:raise Error('单次同步媒体最多100个、总计24MiB，请分批选择')
            p['media'].append(media)
        p['media_index']+=1
        return False
    return True

# Full record payloads stay in task rows. The execution state stores only cursors/counts.
from . import site_sync as core,site_sync_tasks as tasks,data_restore as restore
from .catalog import TABLES,now,defaults
from .data_tools import BUSINESS,TABLE_LIMIT,DATA_LIMIT,OMIT,encoded
from .media_policy import check_type
from backend.app.domain.richtext import body_references
WRITE='@write:'
EXPECTED='@expected:'

async def save(r,task,statements=()):
    await tasks.persist(r.sql,task,statements,status=task['status'])

async def prepare_rows(r,task):
    s=task['state'];e=s['execution'];uid=task['uid']
    p=e.setdefault('prepared',{'table_index':0,'after':'','counts':{},'hash':'','row_index':0,'tables':[],
        'removed':{},'permissions':{},'sizes':{},'bytes':0,'check_table':0,'check_after':'','add_index':0})
    if p['table_index']<len(BUSINESS):
        table=sorted(BUSINESS)[p['table_index']]
        rows=await r.sql.query('SELECT uid,updated_at FROM "'+table+'" WHERE uid>? ORDER BY uid LIMIT 21',(p['after'],))
        values=rows[:20];p['counts'][table]=p['counts'].get(table,0)+len(values)
        if sum(p['counts'].values())>20000:raise Error('本站业务记录超过在线校验上限')
        if table in core.SCOPES:p['hash']=core.revision_fold(p['hash'],table,values,first=not p['after'])
        statements=[snapshots.put(uid,'local',EXPECTED+table,row['uid'],row) for row in values]
        if len(rows)>20:p['after']=values[-1]['uid']
        else:p['table_index']+=1;p['after']=''
        await save(r,task,statements);return
    if p['hash']!=s['local_revision']:raise Error('本站数据已变化，未提交，请取消后重新预览',409)
    if p['row_index']<len(e['selected']):
        ident=e['selected'][p['row_index']];item=next(v for v in s['items'] if v['id']==ident)
        table,key=item['table'],item['uid'];action={'add':'create','update':'edit','delete':'delete'}[item['action']]
        r.auth.require(r.p,table,action);p['permissions'][table]=sorted(set(p['permissions'].get(table,[]))|{action})
        statements=[]
        if item['action']=='delete':
            if table!='media_assets':
                row=await snapshots.get(r.sql,uid,'local',table,key)
                p['removed'].setdefault(table,[]).append(row['uid'])
        else:
            source=await snapshots.get(r.sql,uid,'remote',table,key)
            if table in ('site_settings','global_settings'):
                old=await snapshots.get(r.sql,uid,'local',table,key)
                if old:source['uid']=old['uid']
            rows=await r.sql.query('SELECT * FROM "'+table+'" WHERE uid=?',(source['uid'],))
            row=restore.normalize_record(r,table,source,rows[0] if rows else {})
            if table=='media_assets' and row['storage_kind']!='external':
                row['checksum']=next(m['sha256'] for m in e['media'] if m['uid']==row['uid'])
            row['updated_at']=now(after=row['updated_at'])
            for field in OMIT & set(TABLES[table]['columns']):row[field]=defaults(table).get(field)
            size=len(encoded(row));p['bytes']+=size;p['sizes'][table]=p['sizes'].get(table,0)+size
            if p['bytes']>DATA_LIMIT or p['sizes'][table]>TABLE_LIMIT:raise Error('所选内容超过4MiB或单表900KiB，请缩小选择范围')
            p['tables']=sorted(set(p['tables'])|{table})
            statements=[snapshots.put(uid,'local',WRITE+table,row['uid'],row)]
            statements.extend(snapshots.put(uid,'local','@planned:'+table+':'+field,core.digest(row[field]),row['uid']) for field in snapshots.lookup_fields().get(table,()) if row.get(field) is not None)
        p['row_index']+=1;await save(r,task,statements);return
    e['phase']='validate-rows';await save(r,task)

async def prospective(r,task,table,field,value):
    uid=task['uid'];p=task['state']['execution']['prepared']
    key=await snapshots.get(r.sql,uid,'local','@planned:'+table+':'+field,core.digest(value))
    if key is not None:return await snapshots.get(r.sql,uid,'local',WRITE+table,key)
    rows=await r.sql.query('SELECT * FROM "'+table+'" WHERE "'+field+'"=? LIMIT 1',(value,))
    if not rows or rows[0]['uid'] in p['removed'].get(table,[]):return None
    return await snapshots.get(r.sql,uid,'local',WRITE+table,rows[0]['uid'],rows[0])

async def validate_row(r,task,table,row,prepared=False):
    if row['uid'] in task['state']['execution']['prepared']['removed'].get(table,[]):return
    for field,spec in TABLES[table]['columns'].items():
        ref=spec.get('references');value=row.get(field)
        if not ref or value is None:continue
        target=await prospective(r,task,ref['table'],ref.get('column','uid'),value)
        if not target:raise Error(table+'.'+field+' 缺少关联记录',409)
        if ref['table']=='media_assets':
            if target['status']!='active':raise Error('关联媒体在回收站',409)
            check_type(table,field,target['mime_type'])
    if prepared and table=='news':
        for key,kind in body_references(row.get('content') or '',row.get('content_format')).items():
            asset=await prospective(r,task,'media_assets','uid',key)
            if not asset or asset['status']!='active' or (kind=='image' and asset['mime_type'] not in ('image/png','image/jpeg','image/gif','image/webp')):
                raise Error('正文媒体缺失、已回收或类型不适用',409)

async def validate_rows(r,task):
    e=task['state']['execution'];p=e['prepared'];uid=task['uid']
    if p['check_table']<len(BUSINESS):
        table=sorted(BUSINESS)[p['check_table']]
        fields=['uid']+[k for k,v in TABLES[table]['columns'].items() if v.get('references')]
        rows=await r.sql.query('SELECT '+','.join('"'+f+'"' for f in fields)+' FROM "'+table+'" WHERE uid>? ORDER BY uid LIMIT 1',(p['check_after'],))
        if rows:
            old=rows[0];row=await snapshots.get(r.sql,uid,'local',WRITE+table,old['uid'])
            await validate_row(r,task,table,row or old,prepared=row is not None)
            p['check_after']=old['uid']
        else:p['check_table']+=1;p['check_after']=''
        await save(r,task);return
    if p['add_index']<len(e['selected']):
        item=next(v for v in task['state']['items'] if v['id']==e['selected'][p['add_index']])
        if item['action']=='add':
            source=await snapshots.get(r.sql,uid,'remote',item['table'],item['uid'])
            row=await snapshots.get(r.sql,uid,'local',WRITE+item['table'],source['uid'])
            if row:await validate_row(r,task,item['table'],row,prepared=True)
        p['add_index']+=1;await save(r,task);return
    e['phase']='verify-commit';await save(r,task)

def inventory_condition(task):
    uid=task['uid'];p=task['state']['execution']['prepared'];conditions=[];args=[]
    for table in BUSINESS:
        conditions.append('(SELECT count(*) FROM "'+table+'")=? AND NOT EXISTS(SELECT 1 FROM sync_task_items j LEFT JOIN "'+table+'" t ON t.uid=j.record_uid WHERE j.task_uid=? AND j.side=\'local\' AND j.module=\''+EXPECTED+table+'\' AND (t.uid IS NULL OR t.updated_at<>json_extract(j.payload,\'$.updated_at\')))')
        args.extend((p['counts'][table],uid))
    conditions.append("NOT EXISTS(SELECT 1 FROM sync_task_items j JOIN admin_mutation_guards g ON g.module='media-purge' AND json_extract(g.target_uid,'$.uid')=j.record_uid WHERE j.task_uid=? AND j.side='local' AND j.module='@write:media_assets')")
    args.append(uid)
    return ' AND '.join(conditions),tuple(args)
