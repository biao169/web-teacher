"""Persisted preview jobs, resumed in small pages; no business writes or media reads."""
import json,secrets
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

async def hello(r,p):
    result=await call(r,p,{'op':'hello','schema':core.schema(),'protocol':core.PROTOCOL})
    if result.get('schema')!=core.schema() or result.get('protocol')!=core.PROTOCOL:raise Error('两站版本或同步字段结构不一致',409)
    return result

async def start(r,direction,scopes):
    if direction not in ('pull','push') or not isinstance(scopes,list) or not scopes or any(t not in core.SCOPES for t in scopes):raise Error('同步方向或范围无效')
    p=await peer(r.sql);remote=await hello(r,p)
    uid=secrets.token_hex(16)
    state={'direction':direction,'scopes':scopes,'local_revision':await core.revision(r.sql),
        'remote_revision':remote['revision'],'remote_id':remote['site_id'],'peer_revision':p['revision'],
        'side':'local','table_index':0,'after':'','count':0,'bytes':0,'table_count':0}
    # At most ten previews; cascading deletes discard only old preview snapshots.
    await r.sql.batch([("DELETE FROM sync_tasks WHERE coalesce(json_extract(state,'$.execution.phase'),'done') IN ('done','cancelled') AND uid NOT IN (SELECT uid FROM sync_tasks ORDER BY created_at DESC LIMIT 9)",()),
        ('INSERT INTO sync_tasks(uid,status,state,created_at) VALUES(?,?,?,?)',(uid,'reading',encoded(state).decode(),now()))])
    return {'uid':uid,'status':'reading'}

async def get(sql,uid):
    rows=await sql.query('SELECT * FROM sync_tasks WHERE uid=?',(uid,))
    if not rows:raise Error('预览不存在或已清理',404)
    task=rows[0];task['state']=json.loads(task['state']);return task

async def advance(r,uid):
    task=await get(r.sql,uid);s=task['state'];p=await peer(r.sql)
    if task['status']!='reading':return {'uid':uid,'status':task['status']}
    if s['peer_revision']!=p['revision']:raise Error('对端配置已变化，请重新预览',409)
    if s['side']=='done':return await finish(r,uid)
    table=core.SCOPES[s['table_index']]
    if s['side']=='local':data=await core.page(r.sql,table,s['after'],s['local_revision'])
    else:
        data=await call(r,p,{'op':'page','schema':core.schema(),'protocol':core.PROTOCOL,
             'table':table,'after':s['after'],'revision':s['remote_revision']})
        if data.get('site_id')!=s['remote_id'] or data.get('revision')!=s['remote_revision']:raise Error('对端已变化，请重新预览',409)
    rows=data.get('rows')
    total=data.get('total')
    if type(total) is not int or not 0<=total<=core.MAX_ROWS:raise Error('对端缺少完整记录数，不能生成删除预览')
    if not isinstance(rows,list) or len(rows)>core.PAGE:raise Error('对端分页响应无效')
    statements=[]
    last=s['after']
    for row in rows:
        if not isinstance(row,dict) or set(row)!=set(core.columns(table)) or not isinstance(row.get('uid'),str) or row['uid']<=last:raise Error('对端记录格式或分页顺序不正确')
        last=row['uid'];key=core.identity(table,row);raw=encoded(row).decode()
        s['count']+=1;s['bytes']+=len(raw.encode())
        if s['count']>core.MAX_ROWS*2 or s['bytes']>core.MAX_BYTES:raise Error('预览超过2000条/站或总计4MiB；停止而非截断')
        statements.append(('INSERT INTO sync_task_items(task_uid,side,module,record_uid,payload) VALUES(?,?,?,?,?)',
            (uid,s['side'],table,key,raw)))
    s['table_count']+=len(rows)
    if s['table_count']>total:raise Error('分页记录数不一致，请重新预览')
    more=data.get('next')
    if more is not None and (not rows or more!=last):raise Error('对端游标无效')
    if more:s['after']=more
    else:
        if s['table_count']!=total:raise Error('分页结果不完整，不能生成删除预览')
        s['table_count']=0;s['after']='';s['table_index']+=1
        if s['table_index']==len(core.SCOPES):
            s['table_index']=0;s['side']='remote' if s['side']=='local' else 'done'
    # Unique snapshot keys make a repeated non-empty page roll back atomically.
    statements.append(('UPDATE sync_tasks SET state=? WHERE uid=?',(encoded(s).decode(),uid)))
    await r.sql.batch(statements)
    if s['side']=='done':return await finish(r,uid)
    return {'uid':uid,'status':'reading','side':s['side'],'table':core.SCOPES[s['table_index']],'count':s['count']}

async def finish(r,uid):
    task=await get(r.sql,uid);s=task['state'];p=await peer(r.sql)
    if s['side']!='done':raise Error('预览未完整读取，不能比较删除')
    remote=await hello(r,p)
    if p['revision']!=s['peer_revision'] or await core.revision(r.sql)!=s['local_revision'] or remote['revision']!=s['remote_revision'] or remote['site_id']!=s['remote_id']:raise Error('两站数据或配置已变化，请重新预览',409)
    snapshots={'local':{t:{} for t in core.SCOPES},'remote':{t:{} for t in core.SCOPES}}
    for row in await r.sql.query('SELECT side,module,record_uid,payload FROM sync_task_items WHERE task_uid=?',(uid,)):
        snapshots[row['side']][row['module']][row['record_uid']]=json.loads(row['payload'])
    source,target=(snapshots['remote'],snapshots['local']) if s['direction']=='pull' else (snapshots['local'],snapshots['remote'])
    items=core.compare(source,target,s['scopes']);s['items']=items;s['selection']=core.select(items,[])
    await r.sql.batch([("UPDATE sync_tasks SET status='ready',state=? WHERE uid=?",(encoded(s).decode(),uid))])
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
