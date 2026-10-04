"""Bounded latest-first automatic preview, using existing task checkpoints.

One stream page or one counterpart lookup per advance. Never infer absence from
truncated inventories: only an exact record lookup can propose a deletion.
"""
from . import site_sync as core, site_sync_tasks as tasks
from .site_sync_analysis import put
from .site_sync_limits import AUTO_PULL_CANDIDATES
from .catalog import TITLE, MODULES, Error
from .site_sync_transport import call

async def page(sql, table, after=None):
    core.columns(table)
    if after is not None and (not isinstance(after,list) or len(after)!=2 or
        not isinstance(after[0],str) or len(after[0])>64 or type(after[1]) is not int or after[1]<0):
        raise Error('最新内容分页游标无效')
    where=' WHERE is_manual=1' if table=='translation_cache' else ' WHERE 1'
    args=()
    if after is not None:
        where+=' AND (updated_at,id)<(?,?)';args=tuple(after)
    title=TITLE[table]
    rows=await sql.query('SELECT uid,id,updated_at,substr(coalesce("'+title+'",uid),1,160) AS title FROM "'+table+'"'+where+' ORDER BY updated_at DESC,id DESC LIMIT 1',args)
    return {'rows':rows}

def initialize(state):
    state.update(latest_only=True,phase='latest',streams=[
        {'side':side,'table':table,'after':None,'head':None,'done':False}
        for table in sorted(set(state['scopes'])) for side in ('local','remote')
        if table!='media_assets' or side=='remote'])

async def advance(r,task,p):
    from .site_sync_preview import CANDIDATE
    from .site_sync_incremental import read
    s=task['state'];uid=task['uid'];statements=[]
    if s['candidate_count']>=AUTO_PULL_CANDIDATES:
        s['phase']='complete';s['latest_limit_reached']=True
        await tasks.persist(r.sql,task,status='ready')
        return {'uid':uid,'status':'ready','lightweight':True}
    pending=s.get('latest_pending')
    if pending:
        table=pending['table'];row=pending['row'];key=core.identity(table,row)
        # Exact primary/unique-key lookup, independent of latest-page selection.
        other='remote' if pending['side']=='local' else 'local'
        result=await read(r,task,other,table,key,head=True)
        source_present=pending['side']=='remote' or result.get('uid') is not None
        target_present=pending['side']=='local' or result.get('uid') is not None
        if source_present or table!='media_assets':
            item={'id':table+':'+key,'table':table,'uid':key,'title':row['title'],
                  'updated_at':row['updated_at'],'module_label':MODULES[table],
                  'action':'delete' if not source_present else 'update' if target_present else 'add',
                  'fields':[],'dependencies':[],'blocked':[],'in_scope':True,'candidate':True}
            statements=[put(uid,'local',CANDIDATE+table,key,item)]
            s['candidate_count']+=1
        s.pop('latest_pending')
    else:
        stream=next((v for v in s['streams'] if not v['done'] and v['head'] is None),None)
        if stream is not None:
            if stream['side']=='local':part=await page(r.sql,stream['table'],stream['after'])
            else:
                part=await call(r,p,{'op':'latest-page','schema':core.schema(),'protocol':core.PROTOCOL,
                                    'table':stream['table'],'after':stream['after']})
                if part.get('site_id')!=s['remote_id']:raise Error('对端身份已变化，请重新预览',409)
            rows=part.get('rows')
            if not isinstance(rows,list) or len(rows)>1:raise Error('最新摘要分页无效',409)
            if rows:
                row=rows[0]
                if (not isinstance(row,dict) or set(row)!={'uid','id','updated_at','title'} or
                    not isinstance(row['uid'],str) or not 1<=len(row['uid'])<=128 or
                    type(row['id']) is not int or row['id']<0 or
                    not isinstance(row['updated_at'],str) or len(row['updated_at'])!=24 or
                    not isinstance(row['title'],str) or len(row['title'])>160 or
                    (stream['after'] is not None and (row['updated_at'],row['id'])>=tuple(stream['after']))):
                    raise Error('最新摘要字段或顺序无效',409)
                stream['head']=row;stream['after']=[row['updated_at'],row['id']];s['count']+=1
            else:stream['done']=True
        else:
            ready=[v for v in s['streams'] if v['head'] is not None]
            if not ready:
                s['phase']='complete';s['latest_limit_reached']=False
                await tasks.persist(r.sql,task,status='ready')
                return {'uid':uid,'status':'ready','lightweight':True}
            chosen=max(ready,key=lambda v:(v['head']['updated_at'],v['head']['id'],v['table'],v['side']))
            row=chosen['head'];chosen['head']=None;table=chosen['table'];key=core.identity(table,row)
            found=await r.sql.query("SELECT 1 FROM sync_task_items WHERE task_uid=? AND side='local' AND module=? AND record_uid=?",(uid,CANDIDATE+table,key))
            if not found:
                s['latest_pending']={'side':chosen['side'],'table':table,'row':row}
    await tasks.persist(r.sql,task,statements)
    return {'uid':uid,'status':'reading','phase':'latest','side':s['side'],'count':s['count']}
