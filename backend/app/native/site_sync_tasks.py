"""Persisted preview jobs, resumed in small pages; no business writes or media reads."""
import json,secrets
from .site_sync_diagnostics import traced,operation
from .catalog import Error,now
from .data_tools import encoded,digest
from . import site_sync as core
from .site_sync_transport import origin,call

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
            raise Error('两站同步协议或字段定义不一致，请配套更新至v0.15.130或后续兼容版本',409)
        if not isinstance(result.get('site_id'),str) or not 1<=len(result['site_id'])<=128:
            raise Error('对端缺少有效站点身份',409)
        if with_revision:
            stamp=result.get('revision')
            if not isinstance(stamp,str) or len(stamp)!=64 or any(c not in '0123456789abcdef' for c in stamp):
                raise Error('对端数据检查未返回有效版本摘要，已停止同步预览',409)
        return result

@traced('preview:start')
async def start(r,direction,scopes):
    if direction not in ('pull','push') or not isinstance(scopes,list) or not scopes or any(t not in core.SCOPES for t in scopes):raise Error('同步方向或范围无效')
    p=await peer(r.sql);remote=await hello(r,p)
    uid=secrets.token_hex(16)
    state={'preview_format':3,'direction':direction,'scopes':scopes,'remote_id':remote['site_id'],'peer_revision':p['revision'],
        'phase':'baseline','side':'local','table_index':0,'after':'','count':0,'bytes':0,'table_count':0,
        'version_hash':'','version_count':0,'totals':{'local':{},'remote':{}}}
    # At most ten previews; cascading deletes discard only old preview snapshots.
    await r.sql.batch([("DELETE FROM sync_tasks WHERE coalesce(json_extract(state,'$.execution.phase'),'done') IN ('done','cancelled') AND uid NOT IN (SELECT uid FROM sync_tasks ORDER BY created_at DESC LIMIT 9)",()),
        ('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',(uid,'reading',encoded(state).decode(),now()))])
    return {'uid':uid,'status':'reading'}

async def get(sql,uid):
    rows=await sql.query('SELECT * FROM sync_tasks WHERE uid=?',(uid,))
    if not rows:raise Error('预览不存在或已清理',404)
    task=rows[0];task['_raw_state']=task['state'];task['state']=json.loads(task['state'])
    if task['state'].get('preview_format')!=3:raise Error('旧版同步任务不能继续，请在新版重新生成预览；不要重置业务数据库',409)
    return task

async def persist(sql,task,statements=(),status='reading'):
    # Existing guard table provides compare-and-swap inside the same atomic batch.
    # A competing browser/cron page rolls back, including its snapshot inserts.
    gid=secrets.token_hex(16);at=now();uid=task['uid']
    guard=('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(CASE WHEN EXISTS(SELECT 1 FROM sync_tasks WHERE uid=? AND status=? AND state=?) THEN ? ELSE \'\' END,?,?,?,?)',
        (uid,task['status'],task['_raw_state'],gid,'data_tools',uid,at,at))
    with operation('snapshot:write'):
        await sql.batch([guard,*statements,('UPDATE sync_tasks SET status=?,state=? WHERE uid=?',(status,encoded(task['state']).decode(),uid)),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    task['_raw_state']=encoded(task['state']).decode();task['status']=status

async def version_step(r,p,s):
    table=sorted(core.SCOPES)[s['table_index']];side=s['side']
    if side=='local':part=await core.revision_page(r.sql,table,s['after'])
    else:
        part=await call(r,p,{'op':'revision-page','schema':core.schema(),'protocol':core.PROTOCOL,'table':table,'after':s['after']})
        if part.get('site_id')!=s['remote_id']:raise Error('对端站点身份已变化',409)
    count=part.get('count');stamp=part.get('hash');more=part.get('next')
    if type(count) is not int or not 0<=count<=core.REV_PAGE or not isinstance(stamp,str) or len(stamp)!=64 or any(c not in '0123456789abcdef' for c in stamp):raise Error('版本分页响应不完整，停止预览',409)
    if more is not None and (not isinstance(more,str) or not s['after']<more or len(more)>120 or count!=core.REV_PAGE):raise Error('版本分页游标无效',409)
    s['version_count']+=count;s['table_count']+=count
    if s['version_count']>core.MAX_ROWS:raise Error('本阶段预览最多2000条/站；停止而非截断')
    s['version_hash']=core.revision_fold(s['version_hash'],table,stamp)
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
                'phase':'verify','side':'local','table_index':0,'after':'','table_count':0,'version_count':0,'version_hash':''}
    check=s[key]
    if check['phase']!='done':await version_step(r,p,check)
    return check['phase']=='done'

@traced('preview:page')
async def advance(r,uid):
    task=await get(r.sql,uid);s=task['state'];p=await peer(r.sql)
    if task['status']!='reading':return {'uid':uid,'status':task['status']}
    if s['peer_revision']!=p['revision']:raise Error('对端配置已变化，请重新预览',409)
    if s['phase']=='done':return await finish(r,uid)
    if s['phase'] in ('baseline','verify'):
        await version_step(r,p,s);await persist(r.sql,task)
    else:
        table=core.SCOPES[s['table_index']]
        if s['side']=='local':data=await core.page(r.sql,table,s['after'])
        else:
            data=await call(r,p,{'op':'page','schema':core.schema(),'protocol':core.PROTOCOL,'table':table,'after':s['after']})
            if data.get('site_id')!=s['remote_id']:raise Error('对端站点身份已变化',409)
        rows=data.get('rows');total=s['totals'][s['side']][table]
        if not isinstance(rows,list) or len(rows)>core.PAGE:raise Error('对端分页响应无效')
        statements=[];last=s['after']
        for row in rows:
            if not isinstance(row,dict) or set(row)!=set(core.columns(table)) or not isinstance(row.get('uid'),str) or row['uid']<=last:raise Error('对端记录格式或分页顺序不正确')
            last=row['uid'];key=core.identity(table,row);raw=encoded(row).decode()
            s['count']+=1;s['bytes']+=len(raw.encode())
            if s['count']>core.MAX_ROWS*2 or s['bytes']>core.MAX_BYTES:raise Error('预览超过2000条/站或总计4MiB；停止而非截断')
            statements.append(('INSERT INTO sync_task_items(task_uid,side,module,record_uid,payload) VALUES(?,?,?,?,?)',(uid,s['side'],table,key,raw)))
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
async def finish(r,uid):
    task=await get(r.sql,uid);s=task['state'];p=await peer(r.sql)
    if s['phase']!='done':raise Error('预览未完整读取及校验，不能比较删除')
    if p['revision']!=s['peer_revision']:raise Error('连接配置已变化，请重新预览',409)
    snapshots={'local':{t:{} for t in core.SCOPES},'remote':{t:{} for t in core.SCOPES}}
    for row in await r.sql.query('SELECT side,module,record_uid,payload FROM sync_task_items WHERE task_uid=?',(uid,)):
        snapshots[row['side']][row['module']][row['record_uid']]=json.loads(row['payload'])
    source,target=(snapshots['remote'],snapshots['local']) if s['direction']=='pull' else (snapshots['local'],snapshots['remote'])
    items=core.compare(source,target,s['scopes']);s['items']=items;s['selection']=core.select(items,[])
    await persist(r.sql,task,status='ready')
    return {'uid':uid,'status':'ready','items':items,'selection':s['selection'],'direction':s['direction']}

async def choose(sql,uid,ids):
    task=await get(sql,uid)
    if task['status']!='ready':raise Error('请先完成预览',409)
    if task['state'].get('approval') and not task['state']['approval'].get('ready'):raise Error('请先完成最新审批预览',409)
    if task['state'].get('execution'):raise Error('实际同步已确认，不能修改这份选择；请新建预览',409)
    p=await peer(sql)
    if task['state']['peer_revision']!=p['revision']:raise Error('配置已变化，请重新预览',409)
    result=core.select(task['state']['items'],ids);task['state']['selection']=result
    await sql.batch([('UPDATE sync_tasks SET state=? WHERE uid=?',(encoded(task['state']).decode(),uid))])
    return result
