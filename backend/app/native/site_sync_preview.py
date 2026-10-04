"""Metadata-only candidate preview. Full payloads belong to execution preparation.

Reuses sync_tasks and sync_task_items; no business schema changes. A candidate
is not evidence of a content change. Existing execution preparation remains the
authority for dependencies and writes during this first simplification step.
"""
import json
from . import site_sync as core, site_sync_tasks as tasks
from .site_sync_analysis import put, scan
from .site_sync_transport import call
from .catalog import Error, TITLE, MODULES
from .data_tools import encoded
from .site_sync_limits import STANDARD,for_resource

BRIEF='@brief:'
CANDIDATE='@candidate:'
PAGE=STANDARD['brief_rows']

async def page(sql,table,after='',limit=None):
    core.columns(table);limit=core.page_limit(limit,PAGE)
    title=TITLE[table]
    # SUBSTR bounds long source/translation titles at the database boundary.
    fields='uid,substr(coalesce("'+title+'",uid),1,160) AS title,updated_at'
    if table=='translation_cache':fields+=',is_manual'
    rows=await sql.query('SELECT '+fields+' FROM "'+table+'" WHERE uid>? ORDER BY uid LIMIT '+str(limit+1),(after,))
    return {'rows':rows[:limit],'next':rows[limit-1]['uid'] if len(rows)>limit else None}

def initialize(state):
    state.update(lightweight=True,phase='brief',side='local',table_index=0,after='',count=0,
                 candidate_count=0,selection=core.select([],[]))

async def advance(r,task,p):
    if task['state'].get('latest_only'):
        from .site_sync_latest import advance as latest_advance
        return await latest_advance(r,task,p)
    s=task['state'];uid=task['uid'];statements=[]
    modules=sorted(s['scopes'])
    if s['phase']=='brief':
        table=modules[s['table_index']]
        limit=min(core.page_limit(s.get('policy',{}).get('brief_rows'),PAGE),for_resource(r)['brief_rows'])
        if s['side']=='local':part=await page(r.sql,table,s['after'],limit)
        else:
            part=await call(r,p,{'op':'brief-page','schema':core.schema(),'protocol':core.PROTOCOL,
                                'table':table,'after':s['after'],'limit':limit})
            if part.get('site_id')!=s['remote_id']:raise Error('对端身份已变化，请重新预览',409)
        rows=part.get('rows');last=s['after']
        if not isinstance(rows,list) or len(rows)>limit:raise Error('简要分页响应无效',409)
        for row in rows:
            fields={'uid','title','updated_at'}|({'is_manual'} if table=='translation_cache' else set())
            if (not isinstance(row,dict) or set(row)!=fields or not isinstance(row['uid'],str)
                or not last<row['uid'] or len(row['uid'])>128 or not isinstance(row['title'],str)
                or len(row['title'])>160 or not isinstance(row['updated_at'],str) or len(row['updated_at'])>64):
                raise Error('简要记录字段或顺序无效',409)
            last=row['uid'];statements.append(put(uid,s['side'],BRIEF+table,core.identity(table,row),row))
        s['count']+=len(rows)
        if s['count']>core.MAX_ROWS*2:raise Error('候选预览超过4000条，请缩小模块范围；没有截断删除清单')
        more=part.get('next')
        if more is not None and (not rows or more!=last):raise Error('简要分页游标无效',409)
        if more:s['after']=more
        else:
            s['after']='';s['table_index']+=1
            if s['table_index']==len(modules):
                s['table_index']=0
                if s['side']=='local':s['side']='remote'
                else:s['phase']='candidates';s['candidate_after']=['','']
    else:
        source,target=('remote','local') if s['direction']=='pull' else ('local','remote')
        names=[BRIEF+t for t in modules];after=s['candidate_after']
        left=await scan(r.sql,uid,source,names,after);right=await scan(r.sql,uid,target,names,after)
        if not left and not right:
            s['phase']='complete'
            await tasks.persist(r.sql,task,status='ready')
            return {'uid':uid,'status':'ready','lightweight':True}
        at=min([x['module'],x['record_uid']] for x in left+right);table=at[0][len(BRIEF):];key=at[1]
        a=json.loads(left[0]['payload']) if left and [left[0]['module'],left[0]['record_uid']]==at else None
        b=json.loads(right[0]['payload']) if right and [right[0]['module'],right[0]['record_uid']]==at else None
        s['candidate_after']=at
        eligible=not (table=='media_assets' and a is None)
        if table=='translation_cache' and not ((a or {}).get('is_manual') or (b or {}).get('is_manual')):eligible=False
        if eligible:
            item={'id':table+':'+key,'table':table,'uid':key,'title':(a or b)['title'],
                  'module_label':MODULES[table],'action':'delete' if a is None else 'add' if b is None else 'update',
                  'fields':[],'dependencies':[],'blocked':[],'in_scope':True,'candidate':True}
            statements.append(put(uid,'local',CANDIDATE+table,key,item));s['candidate_count']+=1
    await tasks.persist(r.sql,task,statements)
    return {'uid':uid,'status':'reading','phase':s['phase'],'side':s['side'],'count':s['count']}

async def listing(sql,task,options=None):
    options=options or {};s=task['state'];after=options.get('after',['',''])
    if not isinstance(after,list) or len(after)!=2 or any(not isinstance(v,str) or len(v)>256 for v in after):raise Error('列表游标无效')
    term=options.get('search','');action=options.get('action','')
    if not isinstance(term,str) or len(term)>160 or action not in ('','add','update','delete'):raise Error('筛选条件无效')
    clauses=["task_uid=? AND side='local' AND module>=? AND module<?"]
    args=[task['uid'],CANDIDATE,'@candidate;']
    if term:
        clauses.append("instr(lower(json_extract(payload,'$.title')||' '||json_extract(payload,'$.module_label')||' '||record_uid),lower(?))>0");args.append(term)
    if action:clauses.append("json_extract(payload,'$.action')=?");args.append(action)
    # Two index seeks avoid OFFSET and the broad OR cursor that rescans prior rows.
    rows=[]
    if after[0]:
        rows=await sql.query('SELECT module,record_uid,payload FROM sync_task_items WHERE '+' AND '.join(clauses)+' AND module=? AND record_uid>? ORDER BY record_uid LIMIT 21',(*args,*after))
    if len(rows)<21:
        rows+=await sql.query('SELECT module,record_uid,payload FROM sync_task_items WHERE '+' AND '.join(clauses)+' AND module>? ORDER BY module,record_uid LIMIT '+str(21-len(rows)),(*args,after[0]))
    values=rows[:PAGE]
    return {'items':[json.loads(v['payload']) for v in values],
            'next':[values[-1]['module'],values[-1]['record_uid']] if len(rows)>PAGE else None,
            'candidate_count':s['candidate_count'],'lightweight':True}

async def choose(r,task,ids):
    s=task['state']
    if s.get('incremental'):
        if s.get('approval'):
            from .site_sync_incremental import choose as choose_prepared
            return await choose_prepared(r,task,ids)
        raise Error('已准备的选择及依赖已冻结；需要改变范围时请重新开始',409)
    if s.get('prepared_uid'):raise Error('已开始准备执行数据；请打开对应准备任务，或重新生成候选预览',409)
    if not isinstance(ids,list) or len(ids)>500 or any(not isinstance(v,str) or len(v)>256 for v in ids):raise Error('每次最多选择500项')
    # JSON input is only selected identifiers, never the entire candidate inventory.
    rows=await r.sql.query("SELECT json_extract(payload,'$.id') AS ident FROM sync_task_items WHERE task_uid=? AND side='local' AND module>=? AND module<? AND json_extract(payload,'$.id') IN (SELECT value FROM json_each(?))",(task['uid'],CANDIDATE,'@candidate;',encoded(ids).decode()))
    if set(ids)!={v['ident'] for v in rows}:raise Error('候选选择项无效')
    s['selection']={'selected':sorted(set(ids)),'automatic':[],'blocked':{}}
    await tasks.persist(r.sql,task,status=task['status'])
    return s['selection']

@tasks.step('prepare-preview')
async def prepare(r,uid):
    """Start on-demand selected-record preparation once requested.

    Does not write business records or media. A separate confirmation is still
    required after actual dependencies/deletes have been presented.
    """
    task=await tasks.get(r.sql,uid);s=task['state'];p=await tasks.peer(r.sql)
    if not s.get('lightweight') or task['status']!='ready':raise Error('请先完成候选预览',409)
    if p['revision']!=s['peer_revision']:raise Error('连接配置已变化，请重新预览',409)
    if s.get('prepared_uid'):return {'uid':s['prepared_uid'],'status':'reading'}
    ids=s['selection']['selected']
    if not ids:raise Error('请选择需要准备的候选条目')
    if s.get('incremental'):raise Error('该任务已进入按需准备，请继续原任务',409)
    job=await tasks.start(r,s['direction'],s['scopes'],prepare_parent=task)
    return job
