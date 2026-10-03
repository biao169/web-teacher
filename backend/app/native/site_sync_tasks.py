"""Persisted preview jobs, resumed in small pages; no business writes or media reads."""
import json,secrets
from .site_sync_diagnostics import traced,operation
from .catalog import Error,now
from .data_tools import encoded,digest
from . import site_sync as core
from .site_sync_transport import origin,call
from .site_sync_work import step,policy,TASK_FORMAT,REQUEST_INTERVAL_MS

async def peer(sql,enabled=True):
    rows=await sql.query('SELECT * FROM sync_peers WHERE id=1')
    if not rows or (enabled and not rows[0]['enabled']):raise Error('请先保存并启用对端连接')
    return rows[0]

async def save(sql,data):
    from .site_sync_apply import active
    if await active(sql):raise Error('请先完成或取消实际同步，再修改连接',409)
    rows=await sql.query('SELECT * FROM sync_peers WHERE id=1');old=rows[0] if rows else {}
    secret=data.get('secret') or old.get('secret','')
    if not isinstance(secret,str) or not 32<=len(secret)<=128:raise Error('共享密钥须为32至128个字符，建议生成随机密钥')
    value=origin(data.get('origin',''));enabled=bool(data.get('enabled'))
    from .site_sync_proposals import ALLOW
    await sql.batch([('INSERT INTO sync_peers(id,local_id,origin,secret,enabled,revision) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET origin=excluded.origin,secret=excluded.secret,enabled=excluded.enabled,revision=excluded.revision',
        (old.get('local_id') or secrets.token_hex(16),value,secret,int(enabled),secrets.token_hex(16))),
        ("UPDATE sync_tasks SET status='expired' WHERE status IN ('reading','ready')",()),
        ('INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(ALLOW,'1' if data.get('allow_proposals') else '0'))])

async def hello(r,p,*,with_revision=False):
    # Same signed transport and validation; only data operations request a revision.
    with operation('data:check' if with_revision else 'connection:test'):
        result=await call(r,p,{'op':'inspect' if with_revision else 'hello','schema':core.schema(),'protocol':core.PROTOCOL})
        if result.get('schema')!=core.schema() or result.get('protocol')!=core.PROTOCOL or result.get('data_check')!=1:
            raise Error('两站同步协议或字段定义不一致，请配套更新至v0.15.139或后续兼容版本',409)
        if not isinstance(result.get('site_id'),str) or not 1<=len(result['site_id'])<=128:
            raise Error('对端缺少有效站点身份',409)
        if with_revision:
            stamp=result.get('revision')
            if not isinstance(stamp,str) or len(stamp)!=64 or any(c not in '0123456789abcdef' for c in stamp):
                raise Error('对端数据检查未返回有效版本摘要，已停止同步预览',409)
        return result

@traced('preview:start')
async def start(r,direction,scopes,*,previous=None,lightweight=False,prepare_parent=None,requested=None):
    if direction not in ('pull','push') or not isinstance(scopes,list) or not scopes or any(t not in core.SCOPES for t in scopes):raise Error('同步方向或范围无效')
    p=await peer(r.sql);remote=await hello(r,p)
    if lightweight and remote.get('brief_preview')!=1:raise Error('简要预览需要两站更新至 v0.15.140；请先更新对端',409)
    uid=secrets.token_hex(16)
    state={'preview_format':TASK_FORMAT,'policy':policy(),'work':{'status':'saved','completed_steps':0,'created_at':now()},'direction':direction,'scopes':scopes,'remote_id':remote['site_id'],'peer_revision':p['revision'],
        'phase':'baseline','side':'local','table_index':0,'after':'','count':0,'bytes':0,'table_count':0,
        'version_hash':'','version_count':0,'totals':{'local':{},'remote':{}}}
    if lightweight:
        from .site_sync_preview import initialize
        initialize(state)
    extra=[]
    if requested is not None:
        if remote.get('selected_execute')!=1:raise Error('按需审批需要两站更新至 v0.15.141 或后续版本',409)
        from .site_sync_incremental import initialize as initialize_selected
        initialize_selected(state,{'uid':'','selection':{'selected':requested}})
        state.update(skip_missing=True,skipped=0)
    if prepare_parent:
        parent=prepare_parent['state'];parent['prepared_uid']=uid
        if remote.get('selected_execute')!=1:raise Error('按需准备需要两站更新至 v0.15.141',409)
        from .site_sync_incremental import initialize as initialize_selected
        initialize_selected(state,dict(parent,uid=prepare_parent['uid']))
        gid,guard=r.auth.guard(r.p,'data_tools','edit',
            'EXISTS(SELECT 1 FROM sync_tasks WHERE uid=? AND state=?)',(prepare_parent['uid'],prepare_parent['_raw_state']))
        extra=[guard,('UPDATE sync_tasks SET state=? WHERE uid=?',(encoded(parent).decode(),prepare_parent['uid'])),
               ('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))]
    if previous:
        old=previous['state'];old['restart_uid']=uid
        gid,guard=r.auth.guard(r.p,'data_tools','edit',
            'EXISTS(SELECT 1 FROM sync_tasks WHERE uid=? AND state=?)',(previous['uid'],previous['_raw_state']))
        extra=[guard,('UPDATE sync_tasks SET status=?,state=? WHERE uid=?',('expired',encoded(old).decode(),previous['uid'])),
               ('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))]
    # Retire completed/replaced previews only; keep this restart's receipt for retries.
    await r.sql.batch([*extra,("DELETE FROM sync_tasks WHERE ((status='ready' AND coalesce(json_extract(state,'$.work.status'),'saved')='saved') OR (status='expired' AND json_extract(state,'$.restart_uid') IS NOT NULL)) AND coalesce(json_extract(state,'$.execution.phase'),'done') IN ('done','cancelled') AND uid<>? AND uid NOT IN (SELECT uid FROM sync_tasks ORDER BY created_at DESC LIMIT 9)",(previous['uid'] if previous else prepare_parent['uid'] if prepare_parent else '',)),
        ('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',(uid,'reading',encoded(state).decode(),now()))])
    return {'uid':uid,'status':'reading','policy':state['policy'],'work':state['work'],'request_interval_ms':REQUEST_INTERVAL_MS}

async def restart(r,uid):
    from .site_sync_work import task_lease
    from .media_locks import lease
    from .data_tools import authorize
    authorize(r,'export',core.SCOPES)
    async with task_lease(r,uid):
        async with lease(r,'site-sync:run','edit'):
            task=await get(r.sql,uid);s=task['state']
            if s.get('restart_uid'):
                new=await get(r.sql,s['restart_uid'])
                return {'uid':new['uid'],'status':new['status']}
            if s.get('approval'):raise Error('审批预览请使用“重新读取最新差异并核对”；不能继承旧批准',409)
            e=s.get('execution')
            if e and e['phase'] not in ('done','cancelled'):raise Error('请先取消旧执行并完成暂存清理，再重新开始',409)
            return await start(r,s['direction'],s['scopes'],previous=task,lightweight=bool(s.get('lightweight')))

async def resume(r,uid):
    from .site_sync_work import task_lease
    from .data_tools import authorize
    authorize(r,'edit',core.SCOPES)
    async with task_lease(r,uid):
        task=await get(r.sql,uid);s=task['state']
        if task['status'] not in ('reading','ready'):raise Error('任务已被替代，请打开新的预览',409)
        # Explicit manual retry selects smaller metadata/content pages, without changing digests.
        s.setdefault('policy',policy()).update(content_rows=1,version_rows=5)
        for key in ('begin_check','commit_check','proposal_check'):
            if key in s:s[key].setdefault('policy',policy()).update(content_rows=1,version_rows=5)
        work=s.setdefault('work',{})
        for key in ('retry_count','retryable','retry_after','error','error_code'):work.pop(key,None)
        work['status']='saved'
        if s.get('execution'):
            s['execution'].pop('error',None);s['execution'].pop('error_code',None)
        await persist(r.sql,task,status=task['status'])
        return {'uid':uid,'status':task['status'],'work':work,'policy':s['policy']}

async def get(sql,uid):
    rows=await sql.query('SELECT * FROM sync_tasks WHERE uid=?',(uid,))
    if not rows:raise Error('预览不存在或已清理',404)
    task=rows[0];task['_raw_state']=task['state'];task['state']=json.loads(task['state'])
    if task['state'].get('preview_format')!=TASK_FORMAT:raise Error('旧版同步任务不能继续，请在新版重新生成预览；不要重置业务数据库',409)
    return task

async def persist(sql,task,statements=(),status='reading',*,publish=False):
    # Existing guard table provides compare-and-swap inside the same atomic batch.
    # A competing browser/cron page rolls back, including its snapshot inserts.
    gid=secrets.token_hex(16);at=now();uid=task['uid']
    guard=('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(CASE WHEN EXISTS(SELECT 1 FROM sync_tasks WHERE uid=? AND status=? AND state=?) THEN ? ELSE \'\' END,?,?,?,?)',
        (uid,task['status'],task['_raw_state'],gid,'data_tools',uid,at,at))
    raw=encoded(task['state']).decode()
    update=('UPDATE sync_tasks SET status=?,state=? WHERE uid=?',(status,raw,uid))
    if publish:
        # Publish only compact completed differences; no full business payload enters Python here.
        update=("UPDATE sync_tasks SET status=?,state=json_set(?,'$.items',json((SELECT json_group_array(json(payload)) FROM (SELECT payload FROM sync_task_items WHERE task_uid=? AND side='local' AND module>='@diff:' AND module<'@diff;' ORDER BY module,record_uid)))) WHERE uid=?",(status,raw,uid,uid))
    with operation('snapshot:write'):
        await sql.batch([guard,*statements,update,('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    task['_raw_state']=None if publish else raw;task['status']=status

async def version_step(r,p,s):
    table=sorted(core.SCOPES)[s['table_index']];side=s['side']
    limit=core.page_limit(s.get('policy',{}).get('version_rows'),core.REV_PAGE)
    if side=='local':part=await core.revision_page(r.sql,table,s['after'],limit)
    else:
        part=await call(r,p,{'op':'revision-page','schema':core.schema(),'protocol':core.PROTOCOL,'table':table,'after':s['after'],'limit':limit})
        if part.get('site_id')!=s['remote_id']:raise Error('对端站点身份已变化',409)
    count=part.get('count');rows=part.get('rows');more=part.get('next');last=s['after']
    if not isinstance(rows,list) or type(count) is not int or count!=len(rows) or not 0<=count<=limit:raise Error('版本分页响应不完整，停止预览',409)
    for row in rows:
        if not isinstance(row,dict) or set(row)!={'uid','updated_at'} or not isinstance(row['uid'],str) or not last<row['uid'] or len(row['uid'])>128 or not isinstance(row['updated_at'],str) or len(row['updated_at'])>64:raise Error('版本记录格式或顺序无效',409)
        last=row['uid']
    if more is not None and (not rows or more!=last):raise Error('版本分页游标无效',409)
    s['version_count']+=count;s['table_count']+=count
    if s['version_count']>core.MAX_ROWS:raise Error('本阶段预览最多2000条/站；停止而非截断')
    s['version_hash']=core.revision_fold(s['version_hash'],table,rows,first=not s['after'])
    if more:s['after']=more;return
    if s['phase']=='baseline':s['totals'][side][table]=s['table_count']
    elif s['table_count']!=s['totals'][side][table]:raise Error('分页读取后记录数变化，请重新预览',409)
    s['after']='';s['table_count']=0;s['table_index']+=1
    if s['table_index']<len(core.SCOPES):return
    if s['phase']=='baseline':s[side+'_revision']=s['version_hash']
    elif s['version_hash']!=s[side+'_revision']:raise Error('读取期间数据已变化，请重新预览',409)
    s['table_index']=0;s['version_hash']='';s['version_count']=0
    if side=='local':s['side']='remote'
    else:
        s['side']='local';s['phase']='content' if s['phase']=='baseline' else 'done'

async def check_step(r,task,key,*,peer_config=None):
    """One shared verification page for execution and proposal sending; caller persists."""
    s=task['state'];p=peer_config or await peer(r.sql)
    if p['revision']!=s['peer_revision']:raise Error('连接配置已变化，请重新预览',409)
    if key not in s:
        s[key]={**{k:s[k] for k in ('totals','local_revision','remote_revision','remote_id')},
                'policy':s.get('policy',policy()),'phase':'verify','side':'local','table_index':0,'after':'','table_count':0,'version_count':0,'version_hash':''}
    check=s[key]
    if check['phase']!='done':await version_step(r,p,check)
    return check['phase']=='done'

@step('advance')
@traced('preview:page')
async def advance(r,uid):
    task=await get(r.sql,uid);s=task['state'];p=await peer(r.sql)
    if task['status']!='reading':return {'uid':uid,'status':task['status'],'approval':s.get('approval'),'lightweight':bool(s.get('lightweight'))}
    if s['peer_revision']!=p['revision']:raise Error('对端配置已变化，请重新预览',409)
    if s.get('incremental'):
        from .site_sync_incremental import advance as selected_advance
        return await selected_advance(r,task,p)
    if s.get('lightweight'):
        from .site_sync_preview import advance as brief_advance
        return await brief_advance(r,task,p)
    if s['phase'] in ('done','references','compare','dependencies','publish'):return await finish(r,uid,task)
    if s['phase'] in ('baseline','verify'):
        await version_step(r,p,s);await persist(r.sql,task)
    else:
        table=core.SCOPES[s['table_index']]
        limit=core.page_limit(s.get('policy',{}).get('content_rows'),core.PAGE)
        if s['side']=='local':data=await core.page(r.sql,table,s['after'],limit)
        else:
            data=await call(r,p,{'op':'page','schema':core.schema(),'protocol':core.PROTOCOL,'table':table,'after':s['after'],'limit':limit})
            if data.get('site_id')!=s['remote_id']:raise Error('对端站点身份已变化',409)
        rows=data.get('rows');total=s['totals'][s['side']][table]
        if not isinstance(rows,list) or len(rows)>limit:raise Error('对端分页响应无效')
        from .site_sync_analysis import index_statements
        statements=[];last=s['after'];page_bytes=2;row_count=0
        for row in rows:
            if not isinstance(row,dict) or set(row)!=set(core.columns(table)) or not isinstance(row.get('uid'),str) or row['uid']<=last or len(row['uid'])>128:raise Error('对端记录格式或分页顺序不正确')
            last=row['uid'];key=core.identity(table,row);payload=encoded(row);raw=payload.decode()
            if len(payload)>core.RECORD_BYTES:raise Error('对端单条记录超过200KB，停止而非跳过')
            page_bytes+=len(payload)+(1 if row_count else 0);row_count+=1
            s['count']+=1;s['bytes']+=len(payload)
            if s['count']>core.MAX_ROWS*2 or s['bytes']>core.MAX_BYTES:raise Error('预览超过2000条/站或总计4MiB；停止而非截断')
            statements.append(('INSERT INTO sync_task_items(task_uid,side,module,record_uid,payload) VALUES(?,?,?,?,?)',(uid,s['side'],table,key,raw)))
            statements.extend(index_statements(uid,s['side'],table,key,row))
        if page_bytes>core.PAGE_BYTES and len(rows)!=1:raise Error('对端分页超过字节预算')
        s['table_count']+=len(rows)
        if s['table_count']>total:raise Error('分页记录数不一致，请重新预览')
        more=data.get('next')
        if more is not None and (not rows or more!=last):raise Error('对端游标无效')
        if more:s['after']=more
        else:
            if s['table_count']!=total:raise Error('分页结果不完整，不能生成删除预览')
            s['table_count']=0;s['after']='';s['table_index']+=1
            if s['table_index']==len(core.SCOPES):
                s['table_index']=0
                if s['side']=='local':s['side']='remote'
                else:s['side']='local';s['phase']='verify'
        await persist(r.sql,task,statements)
    return {'uid':uid,'status':'reading','phase':s['phase'],'side':s['side'],'table':core.SCOPES[s['table_index']] if s['phase']=='content' else sorted(core.SCOPES)[s['table_index']], 'count':s['count']}

@traced('preview:compare')
async def finish(r,uid,task=None):
    from .site_sync_analysis import advance
    task=task or await get(r.sql,uid)
    return await advance(r,task)

@step('select')
async def choose(r,uid,ids):
    sql=r.sql
    task=await get(sql,uid)
    if task['status']!='ready':raise Error('请先完成预览',409)
    if task['state'].get('approval') and not task['state']['approval'].get('ready'):raise Error('请先完成最新审批预览',409)
    if task['state'].get('execution'):raise Error('实际同步已确认，不能修改这份选择；请新建预览',409)
    p=await peer(sql)
    if task['state']['peer_revision']!=p['revision']:raise Error('配置已变化，请重新预览',409)
    if task['state'].get('lightweight'):
        from .site_sync_preview import choose as brief_choose
        return await brief_choose(r,task,ids)
    result=core.select(task['state']['items'],ids);task['state']['selection']=result;task['state'].pop('candidate_requested',None)
    await persist(sql,task,status=task['status'])
    return result
