"""Admin previews/approval plus signed peer reads and metadata-only proposal delivery."""
from fastapi import Request
from fastapi.responses import JSONResponse,Response
from .catalog import Error,MODULES
from .data_tools import authorize
from . import site_sync as core,site_sync_tasks as tasks
from .site_sync_transport import verify,envelope,binary_frame,BINARY_TYPE
from .site_sync_diagnostics import operation
from . import site_sync_proposals as proposals
from . import site_sync_schedule as schedule
from . import site_sync_manual as manual
from .site_sync_work import policy,REQUEST_INTERVAL_MS
from .site_sync_limits import for_resource

def install(app,resources,csrf,render):
    from .web import payload
    @app.get('/admin/data-tools/sync')
    async def page(request:Request):
        with operation('page'):
            r=await resources(request);authorize(r)
            rows=await r.sql.query('SELECT local_id,origin,enabled FROM sync_peers WHERE id=1')
            from .site_sync_history import listing
            jobs=await listing(r.sql)
            return await render(r,'admin/native-site-sync.html','data_tools',title='两站同步 · 预览',
                sync_policy=policy(r),schedule=await schedule.status(r.sql),incoming=await proposals.inbox(r),allow_proposals=await proposals.enabled(r.sql),peer=rows[0] if rows else {},sync_tables=[{'key':t,'label':MODULES[t]} for t in core.SCOPES],sync_jobs=jobs)
    @app.post('/api/admin/site-sync/{action}')
    async def admin(request:Request,action:str):
        with operation('admin'):
            r=await resources(request);data=await payload(request,262144);csrf(request,r,data);authorize(r,'edit')
            background=data.get('background',True)
            if type(background) is not bool:raise Error('后台续跑选项无效')
            uid=str(data.get('uid',''))
            if action=='manual-pause':result=await manual.pause(r,uid)
            elif action=='history-delete':
                r.auth.require(r.p,'data_tools','delete')
                if data.get('confirmed') is not True:raise Error('请在弹窗中确认删除历史记录')
                from .site_sync_history import prune,listing
                result=await prune(r.sql,str(data.get('uid','')))
                if not result['more']:result['jobs']=await listing(r.sql)
            elif action=='schedule-save':result=await schedule.save(r,data)
            elif action=='schedule-status':result=await schedule.status(r.sql)
            elif action=='monitor':
                from .site_sync_status import read
                result=await read(r,data)
            elif action=='save':
                await tasks.save(r.sql,data)
                await r.sql.batch([r.content.audit(r.p,'data_tools','site-sync-config','',{'note':'更新同步连接配置；未记录密钥'})])
                result={'saved':True}
            elif action=='test':
                result=await tasks.hello(r,await tasks.peer(r.sql))
            elif action=='start':
                authorize(r,'export',core.SCOPES)
                mode=data.get('preview_mode','brief')
                if mode not in ('brief','detailed'):raise Error('预览模式无效')
                result=await tasks.start(r,data.get('direction'),data.get('scopes'),lightweight=mode=='brief',manual=background)
            elif action=='restart':result=await tasks.restart(r,uid,manual=background)
            elif action=='resume':
                result=await tasks.resume(r,uid)
                if background:await manual.resume(r,uid)
            elif action=='advance':
                authorize(r,'export',core.SCOPES)
                result=await tasks.advance(r,str(data.get('uid','')))
                if result['status']=='ready':
                    task=None if result.get('lightweight') else await tasks.get(r.sql,result['uid'])
                    if task and 'candidate_requested' in task['state']:
                        requested=task['state']['candidate_requested']
                        available={v['id'] for v in task['state'].get('items',[])}
                        await tasks.choose(r,result['uid'],[v for v in requested if v in available])
                    if result.get('approval'):await proposals.finish_review(r,result['uid'])
                    result=await present(r,result['uid'])
            elif action=='prepare-preview':
                authorize(r,'export',core.SCOPES)
                from .site_sync_preview import prepare
                if background:await manual.enroll(r,uid,'prepare')
                result=await prepare(r,uid,manual=background)
            elif action=='proposal-send':
                if background:await manual.enroll(r,uid,'send')
                result=await proposals.send(r,uid)
            elif action=='proposal-status':result=await proposals.sent_status(r,str(data.get('uid','')))
            elif action=='proposal-inbox':result=await proposals.inbox(r)
            elif action=='proposal-review':result=await proposals.review(r,str(data.get('request_id','')),manual=background)
            elif action=='proposal-reject':result=await proposals.reject(r,str(data.get('request_id','')))
            elif action=='proposal-approve':
                if data.get('confirmation')!='同意对端推送':raise Error('请输入“同意对端推送”确认最新差异和删除范围')
                from .site_sync_apply import begin
                if background:await manual.enroll(r,uid,'approve')
                result=await begin(r,uid,'从对端同步到本站',approval=True)
                if 'execution' in result:await proposals.update_progress(r,result)
            elif action=='pull-begin':
                from .site_sync_apply import begin
                if data.get('confirmation')!='从对端同步到本站':raise Error('请输入“从对端同步到本站”确认方向及删除范围')
                if background:await manual.enroll(r,uid,'pull')
                result=await begin(r,uid,data.get('confirmation'))
            elif action in ('pull-tick','pull-cancel'):
                from .site_sync_apply import tick
                if action=='pull-cancel':
                    await manual.pause(r,uid)
                    if background:await manual.enroll(r,uid,'cancel')
                result=await tick(r,uid,cancel=action=='pull-cancel')
                await proposals.update_progress(r,result)
            elif action=='select':result=await tasks.choose(r,str(data.get('uid','')),data.get('ids'))
            elif action=='get':
                authorize(r,'export',core.SCOPES)
                result=await present(r,str(data.get('uid','')),data)
            else:raise Error('不支持的预览操作',404)
            return JSONResponse(result,headers={'Cache-Control':'no-store'})
    @app.post('/api/site-sync/peer')
    async def peer(request:Request):
        with operation('peer'):
            # Peer capability is separate from browser sessions and only exports read-only manifests.
            r=await resources(request);p=await tasks.peer(r.sql);value=await payload(request,131072)
            data=verify(p['secret'],value)
            if not isinstance(data,dict) or data.get('schema')!=core.schema() or data.get('protocol')!=core.PROTOCOL:raise Error('同步协议或业务字段结构不一致，请将两站配套更新至v0.15.139或后续兼容版本',409)
            op=data.get('op')
            with operation('peer:'+op if op in ('hello','inspect','revision-page','page','brief-page','latest-page','record','record-head','record-context','record-dependents','proposal-submit','proposal-status','media-head','media-range','media-range-binary','media-record') else 'peer:unknown'):
                if op in ('hello','inspect'):
                    result={'schema':core.schema(),'protocol':core.PROTOCOL,'data_check':1,'brief_preview':1,'latest_preview':1,'selected_execute':1,'media_ranges':1,'proposals':1 if await proposals.enabled(r.sql) else 0,'policy':policy(r)}
                    if op=='inspect':result['revision']=await core.revision(r.sql)
                elif op=='latest-page':
                    from .site_sync_latest import page as latest_page
                    result=await latest_page(r.sql,data.get('table'),data.get('after'))
                elif op in ('page','revision-page','brief-page'):
                    table=data.get('table');after=data.get('after','');core.columns(table)
                    if not isinstance(after,str) or len(after)>128:raise Error('分页参数无效')
                    if op=='brief-page':
                        from .site_sync_preview import page as brief_page
                        from .site_sync_preview import PAGE as brief_max
                        limit=min(core.page_limit(data.get('limit'),brief_max),for_resource(r)['brief_rows'])
                        result=await brief_page(r.sql,table,after,limit)
                    else:
                        revisions=op=='revision-page'
                        limit=min(core.page_limit(data.get('limit'),core.REV_PAGE if revisions else core.PAGE),for_resource(r)['version_rows' if revisions else 'content_rows'])
                        result=await (core.revision_page(r.sql,table,after,limit) if revisions else core.page(r.sql,table,after,limit))
                elif op in ('record','record-head','record-context','record-dependents'):
                    from .site_sync_incremental import record,dependents
                    if op=='record-dependents':result=await dependents(r.sql,data.get('table'),data.get('key'),data.get('index'),data.get('after',''))
                    else:result=await record(r.sql,data.get('table'),data.get('key'),data.get('field','uid'),op=='record-head',op=='record-context')
                elif op=='proposal-submit':result=await proposals.receive(r,p,data)
                elif op=='proposal-status':
                    proposals.validate(data,p)
                    result=await proposals.receipt(r,data)
                elif op in ('media-head','media-range','media-range-binary','media-record'):
                    from .site_sync_media import serve
                    result=await serve(r,data)
                else:raise Error('对端不支持此操作，不能直接执行内容写入',404)
                result.update(site_id=p['local_id'],request_nonce=value['nonce'])
                if op=='media-range-binary':
                    raw=result.pop('raw')
                    return Response(binary_frame(p['secret'],result,raw),media_type=BINARY_TYPE,headers={'Cache-Control':'no-store'})
                return JSONResponse(envelope(p['secret'],result),headers={'Cache-Control':'no-store'})


async def present(r,uid,options=None):
    task=await tasks.get(r.sql,uid);s=task['state']
    result={'uid':uid,'status':task['status'],'items':s.get('items',[]),'selection':s.get('selection',{}),'direction':s['direction'],'scopes':s['scopes'],'approval':s.get('approval'),'work':s.get('work',{}),'policy':s.get('policy',policy(r)),'request_interval_ms':s.get('work',{}).get('request_interval_ms',REQUEST_INTERVAL_MS)}
    if s.get('lightweight'):
        from .site_sync_preview import listing
        result.update(await listing(r.sql,task,options))
        result['prepared_uid']=s.get('prepared_uid');result['prepared']=bool(s.get('prepared'));result['incremental']=bool(s.get('incremental'))
    if s.get('outgoing'):result['outgoing']=s['outgoing'].get('receipt',{'status':'unconfirmed',**{key:s['outgoing'].get('payload',{}).get(key) for key in ('request_id','sequence')}})
    continuation=await schedule.load(r.sql,manual.PREFIX+uid)
    result['continuation']={k:continuation.get(k) for k in ('enabled','mode','message','due','paused_by_user','receipt')} if continuation else None
    if continuation.get('receipt'):result['outgoing']=continuation['receipt']
    if s.get('execution'):
        from .site_sync_apply import progress
        result.update(progress(task))
    return result
