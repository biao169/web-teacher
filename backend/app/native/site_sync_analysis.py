"""Resumable snapshot analysis; auxiliary rows share the existing task lifecycle.

Only this task's immutable snapshots are read. Existing composite primary keys
serve lookups and reverse references; no schema/index migration is required.
"""
import json
from functools import lru_cache
from . import site_sync as core
from .catalog import Error
from .data_tools import encoded,digest
from .site_sync_work import DEPENDENCY_ROWS,REFERENCE_ROWS

DIFF='@diff:'
REFS='@refs:'
BACK='@back:'
LOOKUP='@lookup:'

@lru_cache(maxsize=1)
def lookup_fields():
    fields={t:set() for t in core.SCOPES};fields['media_assets'].add('uid')
    for table in core.SCOPES:
        for spec in core.TABLES[table]['columns'].values():
            target=spec.get('references',{})
            if target.get('table') in fields:fields[target['table']].add(target.get('column',target.get('field','uid')))
    return fields

def put(uid,side,module,key,value):
    return ('INSERT INTO sync_task_items(task_uid,side,module,record_uid,payload) VALUES(?,?,?,?,?) ON CONFLICT(task_uid,side,module,record_uid) DO UPDATE SET payload=excluded.payload',
            (uid,side,module,key,encoded(value).decode()))

def index_statements(uid,side,table,key,row):
    return [put(uid,side,LOOKUP+table+':'+field,digest(row[field]),key)
            for field in sorted(lookup_fields()[table]) if row.get(field) is not None]

async def get(sql,uid,side,module,key,default=None):
    rows=await sql.query('SELECT payload FROM sync_task_items WHERE task_uid=? AND side=? AND module=? AND record_uid=?',(uid,side,module,key))
    return json.loads(rows[0]['payload']) if rows else default

async def scan(sql,uid,side,modules,after,limit=REFERENCE_ROWS):
    # Separate same-module and next-module seeks: SQLite otherwise may rescan the
    # whole current module for a tuple cursor combined with an IN expression.
    if after[0] in modules:
        rows=await sql.query('SELECT module,record_uid,payload FROM sync_task_items WHERE task_uid=? AND side=? AND module=? AND record_uid>? ORDER BY record_uid LIMIT '+str(limit),(uid,side,*after))
        if rows:return rows
    remaining=sorted(m for m in modules if m>after[0])
    if not remaining:return []
    return await sql.query('SELECT module,record_uid,payload FROM sync_task_items WHERE task_uid=? AND side=? AND module IN ('+','.join('?' for _ in remaining)+') ORDER BY module,record_uid LIMIT '+str(limit),
                           (uid,side,*remaining))

def cursor(row):return [row['module'],row['record_uid']]

def transition(s,phase):
    s['phase']=phase;s['analysis']['after']=['',''];s['analysis'].pop('reverse_after',None)

async def references(sql,uid,s,source,target):
    a=s['analysis'];side=a['side']
    modules=[t for t in core.SCOPES if t in ('news','translation_cache') or any(v.get('references',{}).get('table') in core.SCOPES for v in core.TABLES[t]['columns'].values())]
    rows=await scan(sql,uid,side,modules,a['after'])
    if not rows:
        if side=='local':a['side']='remote';a['after']=['','']
        else:transition(s,'compare')
        return []
    record=rows[0];table,key=record['module'],record['record_uid']
    inputs,errors=core.reference_inputs(table,json.loads(record['payload']));refs=set()
    # Current schema/body policy yields <=20 references. Keep D1 queries and writes bounded.
    if len(inputs)>20:raise Error('单条记录引用超过低负载分析上限20项，请精简后重新预览：'+table+'/'+key)
    for other,field,value,error in inputs:
        match=await get(sql,uid,side,LOOKUP+other+':'+field,digest(value))
        if match is None:errors.append(error)
        else:refs.add((other,match))
    statements=[put(uid,side,REFS+table,key,{'refs':sorted(refs),'errors':errors})]
    if side==target:
        for other,ref in sorted(refs):
            statements.append(put(uid,side,BACK+other,digest(ref)+':'+table+':'+key,[table,key]))
    a['after']=cursor(record);a['processed']+=1
    return statements

async def compare(sql,uid,s,source,target):
    a=s['analysis'];left=await scan(sql,uid,source,core.SCOPES,a['after']);right=await scan(sql,uid,target,core.SCOPES,a['after'])
    candidates=left+right
    if not candidates:transition(s,'dependencies');return []
    at=min(cursor(row) for row in candidates);table,key=at
    src=json.loads(left[0]['payload']) if left and cursor(left[0])==at else None
    dst=json.loads(right[0]['payload']) if right and cursor(right[0])==at else None
    item=core.difference(table,key,src,dst,s['scopes'])
    a['after']=at;a['processed']+=1
    return [put(uid,'local',DIFF+table,key,item)] if item else []

async def dependencies(sql,uid,s,source,target):
    a=s['analysis'];rows=await scan(sql,uid,'local',[DIFF+t for t in core.SCOPES],a['after'])
    if not rows:transition(s,'publish');return []
    record=rows[0];item=json.loads(record['payload']);table,key=item['table'],item['uid']
    if item['action']!='delete':
        meta=await get(sql,uid,source,REFS+table,key,{'refs':[],'errors':[]})
        item['blocked']=meta['errors']
        for other,ref in meta['refs']:
            dep=other+':'+ref
            if dep!=item['id'] and await get(sql,uid,'local',DIFF+other,ref) is not None:item['dependencies'].append(dep)
    else:
        # Seek only this record's incoming edges, never scan unrelated records.
        prefix=digest(key)+':'
        back=await sql.query('SELECT record_uid,payload FROM sync_task_items WHERE task_uid=? AND side=? AND module=? AND record_uid>? AND record_uid<? ORDER BY record_uid LIMIT '+str(DEPENDENCY_ROWS+1),
                             (uid,target,BACK+table,a.get('reverse_after',prefix),prefix+'\uffff'))
        for edge in back[:DEPENDENCY_ROWS]:
            other,ref=json.loads(edge['payload']);dep=other+':'+ref
            meta=await get(sql,uid,source,REFS+other,ref,{'refs':[]})
            if [table,key] in meta['refs']:item['blocked'].append('来源仍被引用: '+dep)
            elif await get(sql,uid,'local',DIFF+other,ref) is not None:item['dependencies'].append(dep)
            else:item['blocked'].append('引用无法解除: '+dep)
        if len(back)>DEPENDENCY_ROWS:
            a['reverse_after']=back[DEPENDENCY_ROWS-1]['record_uid']
            return [put(uid,'local',record['module'],key,item)]
    a['after']=cursor(record);a.pop('reverse_after',None);a['processed']+=1
    return [put(uid,'local',record['module'],key,item)]

async def advance(r,task):
    from . import site_sync_tasks as tasks
    s=task['state'];uid=task['uid'];peer=await tasks.peer(r.sql)
    if peer['revision']!=s['peer_revision']:raise Error('连接配置已变化，请重新预览',409)
    if s['phase']=='done':
        s['analysis']={'side':'local','after':['',''],'processed':0}
        s['phase']='references'
    source,target=('remote','local') if s['direction']=='pull' else ('local','remote')
    if s['phase']=='publish':
        s['phase']='complete';s['selection']=core.select([],[])
        await tasks.persist(r.sql,task,status='ready',publish=True)
        return {'uid':uid,'status':'ready','approval':s.get('approval')}
    handlers={'references':references,'compare':compare,'dependencies':dependencies}
    if s['phase'] not in handlers:raise Error('分析阶段无效，请重新预览',409)
    statements=await handlers[s['phase']](r.sql,uid,s,source,target)
    await tasks.persist(r.sql,task,statements)
    return {'uid':uid,'status':'reading','phase':s['phase'],'side':s['analysis']['side'],
            'count':s['count'],'analyzed':s['analysis']['processed']}
