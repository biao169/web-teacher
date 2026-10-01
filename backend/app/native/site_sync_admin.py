"""Admin previews/approval plus signed peer reads and metadata-only proposal delivery."""
from fastapi import Request
from fastapi.responses import JSONResponse
from .catalog import Error,MODULES
from .data_tools import authorize
from . import site_sync as core,site_sync_tasks as tasks
from .site_sync_transport import verify,envelope
from . import site_sync_proposals as proposals
from . import site_sync_schedule as schedule

def install(app,resources,csrf,render):
    from .web import payload
    @app.get('/admin/data-tools/sync')
    async def page(request:Request):
        r=await resources(request);authorize(r)
        rows=await r.sql.query('SELECT local_id,origin,enabled FROM sync_peers WHERE id=1')
        jobs=await r.sql.query("SELECT uid,status,created_at,json_extract(state,'$.execution.phase') AS execution_phase FROM sync_tasks ORDER BY CASE WHEN json_extract(state,'$.execution.phase') NOT IN ('done','cancelled') THEN 0 ELSE 1 END,created_at DESC LIMIT 10")
        return await render(r,'admin/native-site-sync.html','data_tools',title='两站同步 · 预览',
            schedule=await schedule.status(r.sql),incoming=await proposals.inbox(r),allow_proposals=await proposals.enabled(r.sql),peer=rows[0] if rows else {},sync_tables=[{'key':t,'label':MODULES[t]} for t in core.SCOPES],sync_jobs=jobs)

    @app.post('/api/admin/site-sync/{action}')
    async def admin(request:Request,action:str):
        r=await resources(request);data=await payload(request,262144);csrf(request,r,data);authorize(r,'edit')
        if action=='schedule-save':result=await schedule.save(r,data)
        elif action=='schedule-status':result=await schedule.status(r.sql)
        elif action=='save':
            await tasks.save(r.sql,data)
            await r.sql.batch([r.content.audit(r.p,'data_tools','site-sync-config','',{'note':'更新同步连接配置；未记录密钥'})])
            result={'saved':True}
        elif action=='test':
            result=await tasks.hello(r,await tasks.peer(r.sql))
        elif action=='start':
            authorize(r,'export',core.SCOPES)
            result=await tasks.start(r,data.get('direction'),data.get('scopes'))
        elif action=='advance':
            authorize(r,'export',core.SCOPES)
            result=await tasks.advance(r,str(data.get('uid','')))
            if result['status']=='ready':
                await proposals.finish_review(r,result['uid'])
                result=await present(r,result['uid'])
        elif action=='proposal-send':result=await proposals.send(r,str(data.get('uid','')))
        elif action=='proposal-status':result=await proposals.sent_status(r,str(data.get('uid','')))
        elif action=='proposal-inbox':result=await proposals.inbox(r)
        elif action=='proposal-review':result=await proposals.review(r,str(data.get('request_id','')))
        elif action=='proposal-reject':result=await proposals.reject(r,str(data.get('request_id','')))
        elif action=='proposal-approve':
            if data.get('confirmation')!='同意对端推送':raise Error('请输入“同意对端推送”确认最新差异和删除范围')
            from .site_sync_apply import begin
            result=await begin(r,str(data.get('uid','')),'从对端同步到本站',approval=True)
            await proposals.update_progress(r,result)
        elif action=='pull-begin':
            from .site_sync_apply import begin
            result=await begin(r,str(data.get('uid','')),data.get('confirmation'))
        elif action in ('pull-tick','pull-cancel'):
            from .site_sync_apply import tick
            result=await tick(r,str(data.get('uid','')),cancel=action=='pull-cancel')
            await proposals.update_progress(r,result)
        elif action=='select':result=await tasks.choose(r.sql,str(data.get('uid','')),data.get('ids'))
        elif action=='get':
            authorize(r,'export',core.SCOPES)
            result=await present(r,str(data.get('uid','')))
        else:raise Error('不支持的预览操作',404)
        return JSONResponse(result,headers={'Cache-Control':'no-store'})

    @app.post('/api/site-sync/peer')
    async def peer(request:Request):
        # Peer capability is separate from browser sessions and only exports read-only manifests.
        r=await resources(request);p=await tasks.peer(r.sql);value=await payload(request,131072)
        data=verify(p['secret'],value)
        if not isinstance(data,dict) or data.get('schema')!=core.schema() or data.get('protocol')!=core.PROTOCOL:raise Error('同步协议或业务字段结构不一致',409)
        op=data.get('op')
        if op=='hello':result={'schema':core.schema(),'protocol':core.PROTOCOL,'revision':await core.revision(r.sql),'media_ranges':1,'proposals':1 if await proposals.enabled(r.sql) else 0}
        elif op=='page':
            t=data.get('table');after=data.get('after','');stamp=data.get('revision')
            core.columns(t)
            if not isinstance(after,str) or len(after)>120 or not isinstance(stamp,str) or len(stamp)!=64:raise Error('分页参数无效')
            result=await core.page(r.sql,t,after,stamp)
        elif op=='proposal-submit':result=await proposals.receive(r,p,data)
        elif op=='proposal-status':
            proposals.validate(data,p)
            result=await proposals.receipt(r,data)
        elif op in ('media-head','media-range'):
            from .site_sync_media import serve
            result=await serve(r,data)
        else:raise Error('对端不支持此操作，不能直接执行内容写入',404)
        result.update(site_id=p['local_id'],request_nonce=value['nonce'])
        return JSONResponse(envelope(p['secret'],result),headers={'Cache-Control':'no-store'})


async def present(r,uid):
    task=await tasks.get(r.sql,uid);s=task['state']
    result={'uid':uid,'status':task['status'],'items':s.get('items',[]),'selection':s.get('selection',{}),'direction':s['direction'],'approval':s.get('approval')}
    if s.get('outgoing'):result['outgoing']=s['outgoing'].get('receipt',{'status':'unconfirmed'})
    if s.get('execution'):
        from .site_sync_apply import progress
        result.update(progress(task))
    return result
