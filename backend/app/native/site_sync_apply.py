"""Persistent pull: bounded download, one atomic content commit, target media retained.

The execution state lives inside the v120 internal tables, never in a login session.
Every tick requires current administrator authorization. No remote write API exists.
"""
import base64,hashlib,json
from .site_sync_diagnostics import operation
from .site_sync_work import CLEANUP_BATCH
from .catalog import Error,TABLES
from .data_tools import encoded,authorize
from . import site_sync as core,site_sync_tasks as tasks
from .site_sync_transport import call
from .site_sync_media import CHUNK,chunk_key,chunk_size,negotiate
from .site_sync_limits import for_resource
from .media_inventory_store import inventory
from .media_locks import lease,live_lease
from .media_references import REFERENCE_LOCK

TERMINAL=('done','cancelled')

def progress(task):
    e=task['state'].get('execution',{})
    return {'uid':task['uid'],'execution':{k:e.get(k) for k in ('phase','file_index','offset','bytes','committed','cleanup_index','cancelled','error','error_code','retained_files','applied')},
            'media_count':len(e.get('media',[]))}

async def persist(r,task):
    await tasks.persist(r.sql,task,status=task['status'])

from .site_sync_gate import active

async def remote_check(r,task):
    s=task['state'];p=await tasks.peer(r.sql)
    if p['revision']!=s['peer_revision']:raise Error('连接配置变化，请取消旧任务后重新预览',409)
    result=await tasks.hello(r,p,with_revision=True)
    if result['site_id']!=s['remote_id'] or result['revision']!=s['remote_revision']:raise Error('对端内容已变化，请取消旧任务并重新预览',409)
    return p,result

@tasks.step('begin')
async def begin(r,uid,confirmation,*,approval=False):
    authorize(r,'edit',core.SCOPES)
    if confirmation!='从对端同步到本站':raise Error('请输入“从对端同步到本站”确认方向及删除范围')
    async with lease(r,'site-sync:run','edit'):
        task=await tasks.get(r.sql,uid);s=task['state']
        if s.get('lightweight') and not s.get('incremental'):raise Error('请先准备所选内容并核对依赖，再确认执行或发送；若已经准备，请打开对应的执行准备任务',409,'sync_prepare_required')
        if task['status']!='ready' or s['direction']!='pull':raise Error('只有完整的“对端 → 本站”预览可以执行')
        if bool(s.get('approval'))!=bool(approval):raise Error('此任务需要通过对应的本地审批入口确认',409)
        if 'execution' in s:return progress(task)
        if await active(r.sql):raise Error('已有同步任务，请先继续或取消该任务',409)
        if s.get('incremental'):
            from .site_sync_incremental import begin as begin_selected
            return await begin_selected(r,task,approval)
        selected=core.select(s['items'],s.get('selection',{}).get('selected',[]))
        if selected['blocked'] or (not selected['selected'] and not (approval and not s['items'])):raise Error('请选择条目并处理依赖阻止原因')
        if len(selected['selected'])>500:raise Error('本阶段每次实际同步最多500个变更项，请分批选择')
        if s.get('begin_selection')!=selected['selected']:
            s.pop('begin_check',None);s.pop('begin_plan',None);s['begin_selection']=selected['selected']
        if not await tasks.check_step(r,task,'begin_check'):
            await persist(r,task)
            return {'uid':uid,'checking':True,'phase':'verify-begin'}
        p=await tasks.peer(r.sql);hello=await tasks.hello(r,p)
        if p['revision']!=s['peer_revision'] or hello['site_id']!=s['remote_id']:raise Error('对端配置已变化，请重新预览',409)
        if hello.get('media_ranges')!=1:raise Error('对端需更新到v0.15.121或兼容版本')
        from .site_sync_execute_plan import prepare_selection
        if not await prepare_selection(r,task,selected['selected']):
            await persist(r,task)
            return {'uid':uid,'checking':True,'phase':'prepare-selection'}
        plan=s.pop('begin_plan');media=plan['media']
        s.pop('begin_check',None);s.pop('begin_selection',None)
        approval_sql=[]
        if approval:
            from .site_sync_proposals import approval_statements
            approval_sql=await approval_statements(r,task)
        s['execution']={'phase':'download' if selected['selected'] else 'done','selected':selected['selected'],'media':media,
                        'file_index':0,'offset':0,'bytes':0,'committed':False,'cleanup_index':0,'cleanup_offset':0,'cancelled':False}
        await tasks.persist(r.sql,task,[*approval_sql,
                           r.content.audit(r.p,'data_tools','sync_pull_begin',uid,{'selected':len(selected['selected']),'media':len(media)})],status=task['status'])
        return progress(task)

async def fetch(r,task,data):
    s=task['state'];p=await tasks.peer(r.sql)
    if p['revision']!=s['peer_revision']:raise Error('连接配置已变化',409)
    result=await call(r,p,{'schema':core.schema(),'protocol':core.PROTOCOL,**data})
    if result.get('site_id')!=s['remote_id']:raise Error('对端身份已变化',409)
    return result

async def download(r,task):
    e=task['state']['execution'];index=e['file_index']
    if index>=len(e['media']):e['phase']='write-record' if task['state'].get('incremental') else 'prepare-rows';await persist(r,task);return
    item=e['media'][index]
    if item['version'] is None:
        result=await fetch(r,task,{'op':'media-head','uid':item['uid']})
        if result.get('size')!=item['size'] or result.get('key')!=item['key'] or result.get('checksum')!=item['source_checksum']:raise Error('来源媒体登记已变化',409)
        token=result.get('record_version')
        if not isinstance(token,str) or len(token)!=64:raise Error('对端缺少媒体记录版本，请配套更新两站',409)
        item['chunk_bytes']=negotiate(r,result)
        item['adaptive_ranges']=result.get('adaptive_ranges')==1
        item['binary_ranges']=result.get('binary_ranges')==1;item['record_version']=token;item['version']=result['version'];await persist(r,task);return
    offset=e['offset'];width=chunk_size(item.get('chunk_bytes',CHUNK))
    if offset<item['size']:
        result=await fetch(r,task,{'op':'media-range-binary' if item.get('binary_ranges') else 'media-range','uid':item['uid'],'version':item['version'],'record_version':item.get('record_version'),'offset':offset,**({'chunk_bytes':width} if item.get('adaptive_ranges') else {})})
        raw=result['raw'] if item.get('binary_ranges') else base64.b64decode(result.get('bytes',''),validate=True)
        if result.get('offset')!=offset or result.get('uid')!=item['uid'] or result.get('version')!=item['version'] or len(raw)!=min(width,item['size']-offset) or (not item.get('binary_ranges') and hashlib.sha256(raw).hexdigest()!=result.get('sha256')):raise Error('媒体分片校验失败')
        await r.cache_store.put(chunk_key(task['uid'],index,offset),raw)
        e['offset']+=len(raw);e['bytes']+=len(raw);await persist(r,task);return
    from .site_sync_media import finalize_step
    await finalize_step(r,task,index,item)
    await persist(r,task)

async def verify_commit(r,task):
    if await tasks.check_step(r,task,'commit_check'):
        task['state']['execution']['phase']='commit' if task['state']['execution']['selected'] else 'done'
        task['state'].pop('commit_check',None)
    await persist(r,task)

async def commit(r,task):
    s=task['state'];e=s['execution']
    from . import site_sync_execute_plan as prepared
    plan=e['prepared'];removed=plan['removed']
    async with lease(r,REFERENCE_LOCK,'edit') as owner:
        await remote_check(r,task)
        store=inventory(r.media_store)
        for item in e['media']:
            head=await store.head(item['key'])
            if not head or head['version']!=item['target_version'] or head['size']!=item['size']:raise Error('已暂存媒体发生变化；未提交内容',409)
        condition,args=prepared.inventory_condition(task);lock,la=live_lease(REFERENCE_LOCK,owner)
        condition+=' AND '+lock;args+=la
        gid,guard=r.auth.guard(r.p,'data_tools','edit',condition,args)
        statements=[guard,('PRAGMA defer_foreign_keys=ON',())];guards=[gid]
        # Guards are rechecked by the transaction, including per-module create/edit/delete grants.
        permissions={}
        for item in s['items']:
            if item['id'] in e['selected']:permissions.setdefault(item['table'],set()).add({'add':'create','update':'edit','delete':'delete'}[item['action']])
        for table,actions in permissions.items():
            cond=' AND '.join('EXISTS(SELECT 1 FROM auth_permissions WHERE role_uid=? AND module=? AND can_'+a+'=1)' for a in sorted(actions))
            aid,ag=r.auth.guard(r.p,table,'edit',cond,tuple(v for _ in actions for v in (r.p['role_uid'],table)));guards.append(aid);statements.append(ag)
        for table,uids in removed.items():statements.append(('DELETE FROM "'+table+'" WHERE uid IN (SELECT value FROM json_each(?))',(json.dumps(uids),)))
        for table in plan['tables']:
            cols=[c for c in TABLES[table]['columns'] if c!='id']
            expressions=','.join("json_extract(payload,'$."+c+"')" for c in cols)
            update=','.join('"'+c+'"=excluded."'+c+'"' for c in cols if c not in ('uid','created_at'))
            statements.append(('INSERT INTO "'+table+'" ('+','.join('"'+c+'"' for c in cols)+') SELECT '+expressions+' FROM sync_task_items WHERE task_uid=? AND side=\'local\' AND module=? ON CONFLICT(uid) DO UPDATE SET '+update,(task['uid'],prepared.WRITE+table)))
        e['committed']=True;e['phase']='cleanup'
        statements.extend([("UPDATE sync_tasks SET state=json_set(?,'$._sync_revision',lower(hex(randomblob(16)))) WHERE uid=?",(encoded(s).decode(),task['uid'])),r.content.audit(r.p,'data_tools','sync_pull_commit',task['uid'],{'selected':len(e['selected'])}),('DELETE FROM admin_mutation_guards WHERE uid IN (SELECT value FROM json_each(?))',(json.dumps(guards),))])
        try:
            await r.sql.restore_batch(statements)
        except Exception as exc:
            if 'constraint' in str(exc).lower():
                unchanged=await r.sql.query('SELECT ('+condition+') AS unchanged',args)
                if not unchanged[0]['unchanged']:
                    raise Error('本站内容或执行锁已变化；未提交同步内容，请重新预览',409,'sync_conflict') from exc
            raise

async def cleanup(r,task):
    e=task['state']['execution'];i=e['cleanup_index']
    if i>=len(e['media']):
        e['phase']='cancelled' if e['cancelled'] else 'done';e.pop('error',None)
        await tasks.persist(r.sql,task,[r.content.audit(r.p,'data_tools','sync_pull_'+e['phase'],task['uid'],{'committed':e['committed']})],status=task['status']);return
    item=e['media'][i]
    from .site_sync_media import cleanup_step
    if await cleanup_step(r,task,i,item,for_resource(r)['cleanup_batch']):
        if item.get('publication'):
            from .site_sync_stream import discard_temp
            async with lease(r,REFERENCE_LOCK,'edit'):
                discard_temp(r.media_store,item['key'])
                if not item.get('created_version') and not await r.sql.query('SELECT 1 FROM media_assets WHERE object_key=?',(item['key'],)):
                    head=await inventory(r.media_store).head(item['key'])
                    if head and item['key'] not in e.setdefault('retained_files',[]):e['retained_files'].append(item['key'])
        # Cancel removes only our version of unregistered staged media, never referenced/live files.
        if (task['state'].get('incremental') or not e['committed']) and item.get('created_version'):
            async with lease(r,REFERENCE_LOCK,'edit'):
                if not await r.sql.query('SELECT 1 FROM media_assets WHERE object_key=?',(item['key'],)):
                    store=inventory(r.media_store);head=await store.head(item['key'])
                    if head and head['version']!=item['created_version']:
                        e.setdefault('retained_files',[]).append(item['key'])
                    else:await store.delete(item['key'],item['created_version'])
        e['cleanup_index']+=1;e['cleanup_offset']=0;e.pop('cleanup_width',None)
    await persist(r,task)

async def execution_task(sql,uid):
    from .site_sync_patch import load
    task=await load(sql,uid)
    return task if task is not None else await tasks.get(sql,uid)

@tasks.step('execute')
async def tick(r,uid,cancel=False):
    authorize(r,'edit',core.SCOPES)
    async with lease(r,'site-sync:run','edit'):
        task=await execution_task(r.sql,uid);e=task['state'].get('execution')
        if not e:raise Error('尚未确认实际同步')
        if e['phase'] in TERMINAL:return progress(task)
        if cancel:
            e['cancelled']=True;e['phase']='cleanup';e.pop('error',None);await persist(r,task)
            task=await execution_task(r.sql,uid);e=task['state']['execution']
        try:
            e.pop('error',None)
            with operation('execution:'+e['phase']):
                from .site_sync_execute_plan import prepare_rows,validate_rows
                from .site_sync_incremental import write_one
                await {'write-record':write_one,'prepare-rows':prepare_rows,'validate-rows':validate_rows,'download':download,'verify-commit':verify_commit,'commit':commit,'cleanup':cleanup}[e['phase']](r,task)
        except Exception as exc:
            # Reload: a transaction/file operation may have committed before its response was lost.
            task=await execution_task(r.sql,uid)
            saved=task['state']['execution']
            detail=exc.message if isinstance(exc,Error) else '操作未完成；进度已保留，可重试。请检查服务日志。'
            saved['error']=detail+'；阶段：'+saved['phase']+'；'+(('已逐条提交 '+str(saved.get('applied',0))+' 条，已完成内容保留') if task['state'].get('incremental') else ('数据库已提交，后续步骤未完成' if saved['committed'] else '数据库尚未提交'))
            saved['error_code']=exc.code if isinstance(exc,Error) else 'sync_runtime'
            await persist(r,task)
            if isinstance(exc,Error):raise
            import logging
            logging.getLogger(__name__).exception('Sync pull step failed: %s',uid)
            raise Error('同步步骤失败；已保留进度，请重试或查看服务日志',502) from exc
        return progress(task)
