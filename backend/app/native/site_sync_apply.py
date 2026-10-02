"""Persistent pull: bounded download, one atomic content commit, referenced-media purge last.

The execution state lives inside the v120 internal tables, never in a login session.
Every tick requires current administrator authorization. No remote write API exists.
"""
import base64,hashlib,json
from .site_sync_diagnostics import operation
from .catalog import Error,TABLES,now,defaults
from .data_tools import encoded,authorize,FORMAT,OMIT
from . import site_sync as core,site_sync_tasks as tasks,data_restore as restore
from .site_sync_transport import call
from .site_sync_media import CHUNK,FILE_LIMIT,TOTAL_LIMIT,chunk_key,assemble
from .media_inventory_store import inventory
from .media_locks import lease,live_lease
from .media_references import REFERENCE_LOCK
from .media_audit import MediaAudit

TERMINAL=('done','cancelled')

def progress(task):
    e=task['state'].get('execution',{})
    return {'uid':task['uid'],'execution':{k:e.get(k) for k in ('phase','file_index','offset','bytes','committed','delete_index','cleanup_index','cancelled','error','error_code','retained_files')},
            'media_count':len(e.get('media',[])),'delete_count':len(e.get('deletes',[]))}

async def persist(r,task):
    await tasks.persist(r.sql,task,status=task['status'])

async def active(sql):
    return await sql.query("SELECT uid FROM sync_tasks WHERE json_extract(state,'$.execution.phase') IS NOT NULL AND json_extract(state,'$.execution.phase') NOT IN ('done','cancelled') LIMIT 1")

async def snapshots(r,task):
    result={'local':{t:{} for t in core.SCOPES},'remote':{t:{} for t in core.SCOPES}}
    for row in await r.sql.query('SELECT * FROM sync_task_items WHERE task_uid=?',(task['uid'],)):
        result[row['side']][row['module']][row['record_uid']]=json.loads(row['payload'])
    return result

async def remote_check(r,task):
    s=task['state'];p=await tasks.peer(r.sql)
    if p['revision']!=s['peer_revision']:raise Error('连接配置变化，请取消旧任务后重新预览',409)
    result=await tasks.hello(r,p,with_revision=True)
    if result['site_id']!=s['remote_id'] or result['revision']!=s['remote_revision']:raise Error('对端内容已变化，请取消旧任务并重新预览',409)
    return p,result

async def begin(r,uid,confirmation,*,approval=False):
    authorize(r,'edit',core.SCOPES)
    if confirmation!='从对端同步到本站':raise Error('请输入“从对端同步到本站”确认方向及删除范围')
    async with lease(r,'site-sync:run','edit'):
        task=await tasks.get(r.sql,uid);s=task['state']
        if task['status']!='ready' or s['direction']!='pull':raise Error('只有完整的“对端 → 本站”预览可以执行')
        if bool(s.get('approval'))!=bool(approval):raise Error('此任务需要通过对应的本地审批入口确认',409)
        if 'execution' in s:return progress(task)
        if await active(r.sql):raise Error('已有同步任务，请先继续或取消该任务',409)
        selected=core.select(s['items'],s.get('selection',{}).get('selected',[]))
        if selected['blocked'] or (not selected['selected'] and not (approval and not s['items'])):raise Error('请选择条目并处理依赖阻止原因')
        if len(selected['selected'])>500:raise Error('本阶段每次实际同步最多500个变更项，请分批选择')
        if s.get('begin_selection')!=selected['selected']:
            s.pop('begin_check',None);s['begin_selection']=selected['selected']
        if not await tasks.check_step(r,task,'begin_check'):
            await persist(r,task)
            return {'uid':uid,'checking':True,'phase':'verify-begin'}
        p=await tasks.peer(r.sql);hello=await tasks.hello(r,p)
        if p['revision']!=s['peer_revision'] or hello['site_id']!=s['remote_id']:raise Error('对端配置已变化，请重新预览',409)
        if hello.get('media_ranges')!=1:raise Error('对端需更新到v0.15.121或兼容版本')
        snap=await snapshots(r,task);media=[];deletes=[]
        chosen={v['id']:v for v in s['items'] if v['id'] in selected['selected']}
        media_rows={}
        for item in chosen.values():
            if item['action']!='delete':
                refs,_=core.references(item['table'],snap['remote'][item['table']][item['uid']],snap['remote'])
                for t,key in refs:
                    if t=='media_assets':media_rows[key]=snap['remote'][t][key]
        for item in chosen.values():
            t,key=item['table'],item['uid'];r.auth.require(r.p,t,'create' if item['action']=='add' else 'delete' if item['action']=='delete' else 'edit')
            if t!='media_assets':continue
            if item['action']=='delete':
                row=snap['local'][t][key]
                current=await r.sql.query('SELECT * FROM media_assets WHERE uid=?',(row['uid'],))
                if not current:raise Error('目标媒体已变化',409)
                deletes.append({'uid':row['uid'],'stamp':current[0]['updated_at'],'trash_stamp':None,'plan':None});continue
            media_rows[key]=snap['remote'][t][key]
        for key,row in media_rows.items():
            old=snap['local']['media_assets'].get(key)
            # No in-place overwrite or silent removal of an old object with different key.
            if old and (old['object_key']!=row['object_key'] or (old['storage_kind']=='external')!=(row['storage_kind']=='external')):
                raise Error('已有媒体的存储路径或类型发生变化；请以新媒体条目替换引用后同步，避免覆盖旧文件')
            if row['storage_kind']=='external':continue
            size=row['size']
            if type(size) is not int or not 0<size<=FILE_LIMIT:raise Error('同步单个媒体文件须为1字节至20MiB')
            media.append({'uid':row['uid'],'key':row['object_key'],'size':size,'mime_type':row['mime_type'],
                          'source_checksum':row.get('checksum'),'version':None,'sha256':None,'created_version':None})
        if len(media)>100 or sum(x['size'] for x in media)>TOTAL_LIMIT:raise Error('单次同步媒体最多100个、总计24MiB，请分批选择')
        s.pop('begin_check',None);s.pop('begin_selection',None)
        approval_sql=[]
        if approval:
            from .site_sync_proposals import approval_statements
            approval_sql=await approval_statements(r,task)
        s['execution']={'phase':'download' if selected['selected'] else 'done','selected':selected['selected'],'media':media,'deletes':deletes,
                        'file_index':0,'offset':0,'bytes':0,'committed':False,'delete_index':0,'cleanup_index':0,'cleanup_offset':0,'cancelled':False}
        await tasks.persist(r.sql,task,[*approval_sql,
                           r.content.audit(r.p,'data_tools','sync_pull_begin',uid,{'selected':len(chosen),'media':len(media)})],status=task['status'])
        return progress(task)

async def fetch(r,task,data):
    s=task['state'];p=await tasks.peer(r.sql)
    if p['revision']!=s['peer_revision']:raise Error('连接配置已变化',409)
    result=await call(r,p,{'schema':core.schema(),'protocol':core.PROTOCOL,**data})
    if result.get('site_id')!=s['remote_id']:raise Error('对端身份已变化',409)
    return result

async def download(r,task):
    e=task['state']['execution'];index=e['file_index']
    if index>=len(e['media']):e['phase']='verify-commit';await persist(r,task);return
    item=e['media'][index]
    if item['version'] is None:
        result=await fetch(r,task,{'op':'media-head','uid':item['uid']})
        if result.get('size')!=item['size'] or result.get('key')!=item['key'] or result.get('checksum')!=item['source_checksum']:raise Error('来源媒体登记已变化',409)
        token=result.get('record_version')
        if not isinstance(token,str) or len(token)!=64:raise Error('对端缺少媒体记录版本，请配套更新两站',409)
        item['record_version']=token;item['version']=result['version'];await persist(r,task);return
    offset=e['offset']
    if offset<item['size']:
        result=await fetch(r,task,{'op':'media-range','uid':item['uid'],'version':item['version'],'record_version':item.get('record_version'),'offset':offset})
        raw=base64.b64decode(result.get('bytes',''),validate=True)
        if result.get('offset')!=offset or result.get('uid')!=item['uid'] or result.get('version')!=item['version'] or len(raw)!=min(CHUNK,item['size']-offset) or hashlib.sha256(raw).hexdigest()!=result.get('sha256'):raise Error('媒体分片校验失败')
        await r.cache_store.put(chunk_key(task['uid'],index,offset),raw)
        e['offset']+=len(raw);e['bytes']+=len(raw);await persist(r,task);return
    raw,checksum=await assemble(r,task['uid'],index,item)
    store=inventory(r.media_store)
    async with lease(r,REFERENCE_LOCK,'edit'):
        head=await store.head(item['key'])
        if head:
            if head['size']!=len(raw) or hashlib.sha256(await store.read(item['key'],FILE_LIMIT)).hexdigest()!=checksum:raise Error('目标存在同名不同内容文件；未覆盖。请处理冲突后重试或取消',409)
            if await store.head(item['key'])!=head:raise Error('目标媒体发生变化',409)
        else:
            await store.create(item['key'],bytes(raw));head=await store.head(item['key']);item['created_version']=head['version']
        item['sha256']=checksum;item['target_version']=head['version'];e['file_index']+=1;e['offset']=0
        await persist(r,task)

async def document(r,task):
    s=task['state'];e=s['execution'];snap=await snapshots(r,task);tables={};removed={}
    for item in s['items']:
        if item['id'] not in e['selected']:continue
        t,key=item['table'],item['uid']
        if item['action']=='delete':
            if t!='media_assets':removed.setdefault(t,[]).append(snap['local'][t][key]['uid'])
            continue
        row=dict(snap['remote'][t][key])
        if t in ('site_settings','global_settings') and key in snap['local'][t]:row['uid']=snap['local'][t][key]['uid']
        if t=='media_assets' and row['storage_kind'] in ('local','r2'):
            row['storage_kind']=r.kind;row['checksum']=next(m['sha256'] for m in e['media'] if m['uid']==row['uid'])
        tables.setdefault(t,[]).append(row)
    return {'format':FORMAT,'tables':tables},removed

async def verify_commit(r,task):
    if await tasks.check_step(r,task,'commit_check'):
        task['state']['execution']['phase']='commit' if task['state']['execution']['selected'] else 'done'
        task['state'].pop('commit_check',None)
    await persist(r,task)

async def commit(r,task):
    s=task['state'];e=s['execution']
    doc,removed=await document(r,task);tables=list(doc['tables'])
    async with lease(r,REFERENCE_LOCK,'edit') as owner:
        await remote_check(r,task)
        store=inventory(r.media_store)
        for item in e['media']:
            head=await store.head(item['key'])
            if not head or head['version']!=item['target_version'] or head['size']!=item['size']:raise Error('已暂存媒体发生变化；未提交内容',409)
        if tables:plan=await restore.prepare(r,doc,tables,'merge',removed=removed)
        else:
            plan={'rows':{},'state':await restore.snapshot(r),'errors':await restore.references(r,{},'merge',removed=removed)}
        if plan['errors']:raise Error('最终引用或字段校验未通过：'+str(plan['errors'][0]['message']))
        if core.revision_state(plan['state'])!=s['local_revision']:raise Error('本站数据已变化，未提交',409)
        condition,args=restore.inventory_condition(plan['state']);lock,la=live_lease(REFERENCE_LOCK,owner)
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
        for table,rows in plan['rows'].items():
            if not rows:continue
            for row in rows:
                row['updated_at']=now(after=row['updated_at'])
                for field in OMIT & set(TABLES[table]['columns']):row[field]=defaults(table).get(field)
            cols=[c for c in TABLES[table]['columns'] if c!='id']
            expressions=','.join("json_extract(value,'$."+c+"')" for c in cols)
            update=','.join('"'+c+'"=excluded."'+c+'"' for c in cols if c not in ('uid','created_at'))
            statements.append(('INSERT INTO "'+table+'" ('+','.join('"'+c+'"' for c in cols)+') SELECT '+expressions+' FROM json_each(?) WHERE true ON CONFLICT(uid) DO UPDATE SET '+update,(encoded(rows).decode(),)))
        e['committed']=True;e['phase']='delete'
        statements.extend([('UPDATE sync_tasks SET state=? WHERE uid=?',(encoded(s).decode(),task['uid'])),r.content.audit(r.p,'data_tools','sync_pull_commit',task['uid'],{'selected':len(e['selected'])}),('DELETE FROM admin_mutation_guards WHERE uid IN (SELECT value FROM json_each(?))',(json.dumps(guards),))])
        await r.sql.restore_batch(statements)

async def purge(r,task):
    e=task['state']['execution'];i=e['delete_index']
    if i>=len(e['deletes']):e['phase']='cleanup';await persist(r,task);return
    item=e['deletes'][i]
    source=await fetch(r,task,{'op':'media-record','uid':item['uid']})
    if source.get('exists') is not False:raise Error('来源重新出现待删除媒体，保留本站文件，请重新预览',409)
    rows=await r.sql.query('SELECT * FROM media_assets WHERE uid=?',(item['uid'],))
    if not rows:e['delete_index']+=1;await persist(r,task);return
    row=rows[0]
    if row['updated_at'] not in (item['stamp'],item.get('trash_stamp')):raise Error('待删除媒体已被修改，保留文件；请取消后重新预览',409)
    if await r.media.references.used(row):raise Error('媒体重新被引用，保留登记与文件；先解除引用再重试',409)
    if row['status']!='trash':
        # Persist the exact new stamp with trashing in the same transaction (lost responses retry safely).
        async with lease(r,REFERENCE_LOCK,'delete') as owner:
            if await r.media.references.used(row):raise Error('媒体仍被引用',409)
            item['trash_stamp']=now(after=row['updated_at']);cond,args=live_lease(REFERENCE_LOCK,owner)
            cond+=' AND EXISTS(SELECT 1 FROM media_assets WHERE uid=? AND updated_at=?)';args+=(row['uid'],row['updated_at'])
            gid,guard=r.auth.guard(r.p,'media_assets','delete',cond,args)
            await r.sql.batch([guard,("UPDATE media_assets SET status='trash',updated_at=? WHERE uid=?",(item['trash_stamp'],row['uid'])),('UPDATE sync_tasks SET state=? WHERE uid=?',(encoded(task['state']).decode(),task['uid'])),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
        return
    audit=MediaAudit(r)
    if item['plan'] is None:
        item['plan']=await audit.purge_plan(row['uid'],row['updated_at'],manual=True);await persist(r,task);return
    await audit.execute_purge(item['plan']);e['delete_index']+=1;await persist(r,task)

async def cleanup(r,task):
    e=task['state']['execution'];i=e['cleanup_index']
    if i>=len(e['media']):
        e['phase']='cancelled' if e['cancelled'] else 'done';e.pop('error',None)
        await r.sql.batch([('UPDATE sync_tasks SET state=? WHERE uid=?',(encoded(task['state']).decode(),task['uid'])),r.content.audit(r.p,'data_tools','sync_pull_'+e['phase'],task['uid'],{'committed':e['committed'],'deleted_media':e['delete_index']})]);return
    item=e['media'][i];offset=e['cleanup_offset']
    for _ in range(16):
        if offset>=item['size']:break
        await r.cache_store.delete(chunk_key(task['uid'],i,offset));offset+=CHUNK
    e['cleanup_offset']=offset
    if offset>=item['size']:
        # Cancel removes only our version of unregistered staged media, never referenced/live files.
        if not e['committed'] and item.get('created_version'):
            async with lease(r,REFERENCE_LOCK,'edit'):
                if not await r.sql.query('SELECT 1 FROM media_assets WHERE object_key=?',(item['key'],)):
                    store=inventory(r.media_store);head=await store.head(item['key'])
                    if head and head['version']!=item['created_version']:
                        e.setdefault('retained_files',[]).append(item['key'])
                    else:await store.delete(item['key'],item['created_version'])
        e['cleanup_index']+=1;e['cleanup_offset']=0
    await persist(r,task)

async def tick(r,uid,cancel=False):
    authorize(r,'edit',core.SCOPES)
    async with lease(r,'site-sync:run','edit'):
        task=await tasks.get(r.sql,uid);e=task['state'].get('execution')
        if not e:raise Error('尚未确认实际同步')
        if e['phase'] in TERMINAL:return progress(task)
        if cancel:e['cancelled']=True;e['phase']='cleanup';e.pop('error',None);await persist(r,task)
        try:
            e.pop('error',None)
            with operation('execution:'+e['phase']):
                await {'download':download,'verify-commit':verify_commit,'commit':commit,'delete':purge,'cleanup':cleanup}[e['phase']](r,task)
        except Exception as exc:
            # Reload: a transaction/file operation may have committed before its response was lost.
            task=await tasks.get(r.sql,uid)
            saved=task['state']['execution']
            detail=exc.message if isinstance(exc,Error) else '操作未完成；进度已保留，可重试。请检查服务日志。'
            saved['error']=detail+'；阶段：'+saved['phase']+'；'+('数据库已提交，后续步骤未完成' if saved['committed'] else '数据库尚未提交')
            saved['error_code']=exc.code if isinstance(exc,Error) else 'sync_runtime'
            await persist(r,task)
            if isinstance(exc,Error):raise
            import logging
            logging.getLogger(__name__).exception('Sync pull step failed: %s',uid)
            raise Error('同步步骤失败；已保留进度，请重试或查看服务日志',502) from exc
        return progress(task)
