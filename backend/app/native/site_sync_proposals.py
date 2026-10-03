"""Latest-wins proposal inbox. Peer writes metadata only; local approval owns all business writes."""
import json,re,secrets
from .catalog import Error,now
from .data_tools import encoded,digest,authorize
from . import site_sync as core,site_sync_tasks as tasks
from .site_sync_transport import call
from .media_locks import lease

INBOX='site-sync:inbox'
ALLOW='site-sync:allow-proposals'

async def enabled(sql):
    rows=await sql.query('SELECT value FROM service_meta WHERE key=?',(ALLOW,))
    return bool(rows and rows[0]['value']=='1')

async def box(sql):
    rows=await sql.query('SELECT value FROM service_meta WHERE key=?',(INBOX,))
    raw=rows[0]['value'] if rows else None
    return raw,json.loads(raw) if raw else {'highest':0,'source_id':None,'current':None,'history':[]}

async def cas(sql,old,value):
    raw=encoded(value).decode()
    if old is None:
        result=await sql.batch([('INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING RETURNING key',(INBOX,raw))])
    else:result=await sql.batch([('UPDATE service_meta SET value=? WHERE key=? AND value=? RETURNING key',(raw,INBOX,old))])
    return bool(result[0])

def validate(data,p):
    if data.get('target_id')!=p['local_id'] or not re.fullmatch('[a-f0-9]{32}',str(data.get('source_id',''))) or data['source_id']==p['local_id']:raise Error('提案站点标识不匹配',409)
    if type(data.get('sequence')) is not int or not 0<data['sequence']<2**53:raise Error('提案序号无效')
    if not re.fullmatch('[a-f0-9]{32}',str(data.get('request_id',''))):raise Error('提案标识无效')

def summary(value):
    return {k:value.get(k) for k in ('request_id','sequence','source_id','target_id','created_at','received_at','status','review_uid','task_uid','phase','committed','requested_count','skipped')}

async def receive(r,p,data):
    if not await enabled(r.sql):raise Error('接收方未开启待批准推送',403)
    validate(data,p)
    if not isinstance(data.get('created_at'),str) or len(data['created_at'])!=24:raise Error('提案时间无效')
    scopes=data.get('scopes');ids=data.get('ids')
    if not isinstance(scopes,list) or not scopes or any(t not in core.SCOPES for t in scopes) or len(scopes)!=len(set(scopes)):raise Error('提案范围无效')
    if not isinstance(ids,list) or not 1<=len(ids)<=500 or any(not isinstance(x,str) or ':' not in x or x.split(':',1)[0] not in core.SCOPES or not 1<=len(x.split(':',1)[1])<=128 for x in ids) or len(set(ids))!=len(ids):raise Error('提案选择无效，最多500项')
    # Check the sender is the configured peer; a shared key alone cannot nominate an arbitrary site.
    remote=await tasks.hello(r,p)
    if remote['site_id']!=data['source_id']:raise Error('提案来源不是当前配置对端',403)
    for _ in range(3):
        old,value=await box(r.sql)
        if value['source_id'] not in (None,data['source_id']):
            if (value.get('current') or {}).get('status')=='pending':raise Error('请先拒绝原对端的待批准提案，再更换来源',409)
            value={'highest':0,'source_id':data['source_id'],'current':None,'history':value['history']}
        if data['sequence']<=value['highest']:
            return await receipt(r,data) # delayed/replayed submissions never replace newer intent
        prior=value.get('current')
        if prior:
            archived=dict(prior)
            if archived['status']=='pending':archived['status']='superseded'
            value['history']=(value['history']+[summary(archived)])[-20:]
        proposal={k:data[k] for k in ('request_id','sequence','source_id','target_id','scopes','ids')}
        proposal.update(status='pending',created_at=data.get('created_at',''),received_at=now(),peer_revision=p['revision'],requested_count=len(ids),review_uid=None)
        value.update(highest=data['sequence'],source_id=data['source_id'],current=proposal)
        if await cas(r.sql,old,value):return summary(proposal)
    raise Error('提案正在变化，请重试；未修改业务数据',409)

async def receipt(r,data):
    _,value=await box(r.sql)
    candidates=[value.get('current'),*reversed(value['history'])]
    found=next((v for v in candidates if v and v['request_id']==data['request_id'] and v['source_id']==data['source_id']),None)
    if not found:return {'request_id':data['request_id'],'status':'superseded_or_unknown','sequence':data['sequence']}
    result=summary(found)
    if found.get('task_uid'):
        rows=await r.sql.query('SELECT state FROM sync_tasks WHERE uid=?',(found['task_uid'],))
        if rows:
            e=json.loads(rows[0]['state']).get('execution',{})
            result.update(phase=e.get('phase'),committed=e.get('committed'))
    return result

@tasks.step('proposal-send')
async def send(r,uid):
    authorize(r,'export',core.SCOPES)
    async with lease(r,'site-sync:proposal-send','edit'):
        task=await tasks.get(r.sql,uid);s=task['state'];p=await tasks.peer(r.sql)
        if task['status']!='ready' or s['direction']!='push':raise Error('请先完成“本站 → 对端”的预览')
        if p['revision']!=s['peer_revision']:raise Error('对端配置已变化，请重新预览',409)
        chosen=core.select(s['items'],s.get('selection',{}).get('selected',[]))
        if chosen['blocked'] or not chosen['selected']:raise Error('请选择条目并处理依赖问题')
        ids=sorted(set(chosen['selected'])-set(s['selection'].get('automatic',[])))
        if not 1<=len(ids)<=500:raise Error('提案最多500个主动选择项')
        fingerprint=digest([ids,s['scopes'],s['local_revision'],s['remote_revision'],p['revision']])
        outgoing=s.get('outgoing')
        if s.get('proposal_check_fingerprint')!=fingerprint:
            s.pop('proposal_check',None);s['proposal_check_fingerprint']=fingerprint
        if 'proposal_check' not in s:
            remote=await tasks.hello(r,p)
            if remote['site_id']!=s['remote_id'] or remote.get('proposals')!=1:raise Error('对端身份已变化或未开启接收待批准推送',409)
        if not await tasks.check_step(r,task,'proposal_check',peer_config=p):
            await tasks.persist(r.sql,task,status=task['status'])
            return {'checking':True,'phase':'verify-proposal'}
        remote=await tasks.hello(r,p)
        if remote['site_id']!=s['remote_id'] or remote.get('proposals')!=1:raise Error('对端身份已变化或未开启接收待批准推送',409)
        if not outgoing or outgoing.get('confirmed') or outgoing['fingerprint']!=fingerprint:
            key='site-sync:sequence:'+p['local_id']+':'+s['remote_id']
            seq=(await r.sql.batch([("INSERT INTO service_meta(key,value) VALUES(?,'1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) RETURNING value",(key,))]))[0][0]['value']
            payload={'op':'proposal-submit','schema':core.schema(),'protocol':core.PROTOCOL,'source_id':p['local_id'],'target_id':s['remote_id'],
                     'sequence':int(seq),'request_id':secrets.token_hex(16),'ids':ids,'scopes':s['scopes'],'created_at':now()}
            outgoing={'fingerprint':fingerprint,'payload':payload,'confirmed':False};s['outgoing']=outgoing
            await tasks.persist(r.sql,task,status=task['status'])
        answer=await call(r,p,outgoing['payload'])
        if answer.get('site_id')!=s['remote_id'] or answer.get('request_id')!=outgoing['payload']['request_id']:raise Error('提案回执不匹配',409)
        outgoing.update(confirmed=True,receipt=answer)
        s.pop('proposal_check',None);s.pop('proposal_check_fingerprint',None)
        await tasks.persist(r.sql,task,[r.content.audit(r.p,'data_tools','sync_proposal_send',uid,{'sequence':outgoing['payload']['sequence']})],status=task['status'])
        return {'outgoing':answer}

async def sent_status(r,uid):
    task=await tasks.get(r.sql,uid);s=task['state'];out=s.get('outgoing')
    if not out:raise Error('该预览尚未发送提案')
    p=await tasks.peer(r.sql)
    if p['revision']!=s['peer_revision']:raise Error('连接配置已变化',409)
    data={k:out['payload'][k] for k in ('source_id','target_id','request_id','sequence')}
    result=await call(r,p,dict(data,op='proposal-status',schema=core.schema(),protocol=core.PROTOCOL))
    if result.get('site_id')!=data['target_id'] or result.get('request_id')!=data['request_id']:raise Error('回执来源不匹配',409)
    return {'outgoing':result}

async def inbox(r):
    _,value=await box(r.sql)
    current=value.get('current')
    return {'proposal':summary(current) if current else None,'history':[summary(v) for v in reversed(value['history'])]}

async def current(r,request_id):
    old,value=await box(r.sql);p=value.get('current')
    if not p or p['request_id']!=request_id or p['status']!='pending':raise Error('提案已被更新、拒绝或批准，请刷新待批准列表',409)
    return old,value,p

async def review(r,request_id):
    authorize(r,'export',core.SCOPES)
    old,value,p=await current(r,request_id);peer=await tasks.peer(r.sql)
    if not await enabled(r.sql) or peer['revision']!=p['peer_revision']:raise Error('接收配置已变化，请要求对端重新发起',409)
    job=await tasks.start(r,'pull',p['scopes']);task=await tasks.get(r.sql,job['uid'])
    if task['state']['remote_id']!=p['source_id']:raise Error('提案来源已变化',409)
    task['state']['approval']={'request_id':request_id,'sequence':p['sequence'],'ready':False}
    p['review_uid']=job['uid']
    gid,guard=r.auth.guard(r.p,'data_tools','edit','EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(INBOX,old))
    await r.sql.batch([guard,('UPDATE sync_tasks SET state=? WHERE uid=?',(encoded(task['state']).decode(),job['uid'])),('UPDATE service_meta SET value=? WHERE key=?',(encoded(value).decode(),INBOX)),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    return job

@tasks.step('review-finish')
async def finish_review(r,uid):
    task=await tasks.get(r.sql,uid);s=task['state'];link=s.get('approval')
    if not link or link['ready']:return
    old,value,p=await current(r,link['request_id'])
    if p['review_uid']!=uid:raise Error('已有更新的审批预览，请打开最新预览',409)
    ids={x['id'] for x in s['items']};requested=[x for x in p['ids'] if x in ids]
    selection=core.select(s['items'],requested)
    allowed=set(selection['selected']);s['items']=[x for x in s['items'] if x['id'] in allowed]
    s['selection']=selection;link.update(ready=True,skipped=len(p['ids'])-len(requested))
    p['skipped']=link['skipped']
    gid,guard=r.auth.guard(r.p,'data_tools','edit','EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(INBOX,old))
    await r.sql.batch([guard,('UPDATE sync_tasks SET state=? WHERE uid=?',(encoded(s).decode(),uid)),('UPDATE service_meta SET value=? WHERE key=?',(encoded(value).decode(),INBOX)),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])

async def approval_statements(r,task):
    link=task['state']['approval'];old,value,p=await current(r,link['request_id']);peer=await tasks.peer(r.sql)
    if not link.get('ready') or p['sequence']!=link['sequence'] or p['review_uid']!=task['uid'] or peer['revision']!=p['peer_revision'] or not await enabled(r.sql):raise Error('审批预览已失效，请重新核对最新提案',409)
    p.update(status='approved',task_uid=task['uid'],approved_at=now())
    gid,guard=r.auth.guard(r.p,'data_tools','edit','EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(INBOX,old))
    return [guard,('UPDATE service_meta SET value=? WHERE key=?',(encoded(value).decode(),INBOX)),r.content.audit(r.p,'data_tools','sync_proposal_approve',p['request_id'],{'sequence':p['sequence'],'task_uid':task['uid']}),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))]

async def reject(r,request_id):
    old,value,p=await current(r,request_id);p['status']='rejected'
    gid,guard=r.auth.guard(r.p,'data_tools','edit','EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',(INBOX,old))
    await r.sql.batch([guard,('UPDATE service_meta SET value=? WHERE key=?',(encoded(value).decode(),INBOX)),r.content.audit(r.p,'data_tools','sync_proposal_reject',request_id),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    return {'proposal':summary(p)}

async def update_progress(r,result):
    task=await tasks.get(r.sql,result['uid']);link=task['state'].get('approval')
    if not link:return
    for _ in range(3):
        old,value=await box(r.sql)
        found=next((v for v in [value.get('current'),*value['history']] if v and v['request_id']==link['request_id']),None)
        if not found:return
        found.update(phase=result['execution']['phase'],committed=result['execution']['committed'])
        if await cas(r.sql,old,value):return
