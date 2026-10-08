from site_sync.core.selection import is_restore,normalize,selected_tables,visible_scopes,descriptions
from site_sync.core.receiver import create_receiver,selection,validate as receiver_validate
from site_sync.core.input_errors import InputError
import hashlib
import json
import secrets
from dataclasses import dataclass
from site_sync.core.authority import AuthorizationError,ConflictError
from site_sync.runtime.schedules import Schedules

from site_sync.core.settings import validate as execution_settings,site,KEY

TASK_FIELDS='delete_requested,last_dispatched_at,scope_json,initial_slice_bytes,auto_shrink,auto_confirm,auto_delete,task_id,peer_id,mode,phase,status,progress_seq,revision,next_run_at,no_progress_count,total_errors,fast_retries,slice_bytes,min_slice_bytes,slow_retry_seconds,last_error,created_at,last_progress_at,lease_until,cancel_intent'

@dataclass(frozen=True)
class Actor:
    # Construct from the website session on the server, never from request JSON.
    principal_id:str
    grant_id:str
    can_manage:bool=True


def integer(value,minimum,maximum):
    if type(value)!=int or not minimum<=value<=maximum:raise ValueError('数值超出允许范围')
    return value

def policy(values):
    v=execution_settings(values)
    return (v['fast_retries'],v['slice_bytes'],v['min_slice_bytes'],v['slow_retry_seconds'],int(v['auto_shrink']),v['slice_bytes'])


class Admin:
    def __init__(self,repo,clock,*,retention_days=90,catalog=None,principal_scopes=None,preflight=None):
        self.repo,self.db,self.clock=repo,repo.db,clock
        self.retention_days=integer(retention_days,7,3650)
        self.catalog,self.principal_scopes=catalog,principal_scopes
        self.preflight=preflight
    async def grant(self,actor,write=False):
        if not isinstance(actor,Actor) or not actor.can_manage:raise AuthorizationError('无同步管理权限')
        rows=await self.db.query('SELECT * FROM sync_grants WHERE grant_id=? AND principal_id=?',(actor.grant_id,actor.principal_id))
        if not rows:raise AuthorizationError('授权不属于当前账号')
        g=rows[0]
        if write and (not g['enabled'] or (g['expires_at'] and g['expires_at']<=self.clock())):raise AuthorizationError('授权已撤销或过期')
        return g
    async def own_task(self,actor,task_id,write=False):
        await self.grant(actor,write)
        rows=await self.db.query('SELECT * FROM sync_tasks WHERE task_id=? AND grant_id=?',(task_id,actor.grant_id))
        if not rows:raise AuthorizationError('任务不存在或不可访问')
        return rows[0]
    async def retry_policy(self,actor,body=None):
        g=await self.grant(actor,body is not None)
        from site_sync.core.retry_settings import read,validate,KEY as RETRY_KEY
        if body is not None:
            if not g['can_write']:raise AuthorizationError('Settings denied')
            value=validate(body)
            result=await self.db.batch([('INSERT INTO service_meta(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM sync_grants WHERE grant_id=? AND revision=? AND enabled=1 AND can_write=1 AND (expires_at=0 OR expires_at>?)) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(RETRY_KEY,json.dumps(value),actor.grant_id,g['revision'],self.clock()))])
            if result[0]['meta']['changes']!=1:raise AuthorizationError('Settings changed')
        return await read(self.db)
    async def options(self,actor):
        g=await self.grant(actor)
        peers=await self.db.query('SELECT peer_id FROM sync_peers WHERE enabled=1 ORDER BY peer_id LIMIT 100')
        saved=set(json.loads(g['scopes_json']));current=set(self.principal_scopes) if self.principal_scopes is not None else saved
        modules=list(self.catalog) if self.catalog is not None else visible_scopes(list(json.loads(g['scopes_json'])))
        details=descriptions(modules);active=bool(g['can_write'] and g['enabled'] and (not g['expires_at'] or g['expires_at']>self.clock()))
        for name,d in details.items():
            needed=set(normalize([name]))
            reason=('当前管理员权限不包含该项或其依赖' if not needed<=current else '本站尚未保存该项授权，请更新同步授权' if not needed<=saved else '当前同步授权已停用或过期' if not active else '恢复内容需要删除/替换权限，请检查授权' if is_restore([name]) and not g['can_delete'] else '')
            d.update(enabled=not bool(reason),disabled_reason=reason)
        return {'peers':peers,'modules':modules,'scope_details':details,'authorization':{'saved_scopes':sorted(saved),'current_scopes':sorted(current),'needs_refresh':bool((set(modules)&current)-saved),'message':'目录统一为20项；禁用项显示缺少的权限或授权。更新本站授权不会修改对端授权。'},'can_write':active,
                'timezone':'Asia/Shanghai','retention_days':self.retention_days,'platform':self.repo.platform,'defaults':await site(self.db,self.repo.platform)}
    async def tasks(self,actor,*,view='active',cursor=None,limit=50):
        await self.grant(actor)
        limit=integer(limit,1,50)
        if view not in ('active','history','all','running','waiting','paused'):raise ValueError('无效列表类型')
        where='grant_id=?';args=[actor.grant_id]
        if view in ('active','history'):where+=" AND status "+('IN' if view=='history' else 'NOT IN')+" ('done','cancelled')"
        elif view=='running':where+=" AND status='running'"
        elif view=='waiting':where+=" AND status IN ('ready','waiting','cancel_requested')"
        elif view=='paused':where+=" AND status='paused'"
        if cursor is not None:
            if not isinstance(cursor,list) or len(cursor)!=2 or type(cursor[0])!=int or not isinstance(cursor[1],str) or len(cursor[1])>128:raise ValueError('无效分页游标')
            where+=' AND (created_at<? OR (created_at=? AND task_id<?))';args.extend((cursor[0],cursor[0],cursor[1]))
        rows=await self.db.query("SELECT page.*,CASE WHEN json_valid(m.value) THEN coalesce(json_extract(m.value,'$.quarantined'),0) ELSE 0 END quarantined FROM (SELECT "+TASK_FIELDS+" FROM sync_tasks WHERE "+where+" ORDER BY created_at DESC,task_id DESC LIMIT ?) page LEFT JOIN service_meta m ON m.key='sync:adaptive:'||page.task_id ORDER BY page.created_at DESC,page.task_id DESC",(*args,limit+1))
        more=len(rows)>limit;rows=rows[:limit]
        return {'items':rows,'cursor':[rows[-1]['created_at'],rows[-1]['task_id']] if more else None,'server_time':self.clock()}
    async def detail(self,actor,task_id):
        t=await self.own_task(actor,task_id)
        fields='event_id,occurred_at,kind,phase,attempt_id,detail'
        base='SELECT '+fields+' FROM sync_events WHERE task_id=?'
        recent=await self.db.query('SELECT * FROM ('+base+" AND kind IN ('start','step','error','recovered','deferred') ORDER BY event_id DESC LIMIT 1) UNION ALL SELECT * FROM ("+base+" AND kind='step' AND json_extract(detail,'$.progress_delta')>0 ORDER BY event_id DESC LIMIT 1) UNION ALL SELECT * FROM ("+base+" AND kind IN ('error','recovered') ORDER BY event_id DESC LIMIT 1)",(task_id,task_id,task_id))
        recent=[dict(x,detail=json.loads(x['detail'])) for x in sorted({x['event_id']:x for x in recent}.values(),key=lambda x:x['event_id'],reverse=True)]
        counts=await self.db.query('SELECT status,count(*) n FROM sync_items WHERE task_id=? GROUP BY status',(task_id,))
        files=await self.db.query('SELECT count(*) n,coalesce(sum(total_bytes),0) total,coalesce(sum(committed_bytes),0) committed FROM sync_files WHERE task_id=?',(task_id,))
        body=await self.db.query("SELECT coalesce(sum(staged_bytes),0) committed,coalesce(sum(CASE WHEN manifest_json IS NOT NULL THEN json_extract(manifest_json,'$.fields.payload') ELSE 0 END),0) total,count(*) records,sum(selected) selected FROM sync_items WHERE task_id=?",(task_id,))
        current=await self.db.query("SELECT item_id,module,record_id,status,staged_bytes,manifest_json FROM sync_items WHERE task_id=? AND selected=1 AND status NOT IN ('applied','skipped') ORDER BY item_id LIMIT 1",(task_id,))
        offsets=[];media_current=[]
        if current:
            i=current[0];i.pop('manifest_json',None)
            offsets=await self.db.query('SELECT field,max(offset+length(data)) next_offset FROM sync_parts WHERE task_id=? AND item_id=? GROUP BY field LIMIT 32',(task_id,i['item_id']))
            media_current=await self.db.query('SELECT file_id,source_file_id,status,committed_bytes,total_bytes,storage_kind,staging_key FROM sync_files WHERE task_id=? AND item_id=? ORDER BY file_id LIMIT 16',(task_id,i['item_id']))
        clone=None
        if is_restore(json.loads(t['scope_json'])):
            from site_sync.core.selection import AUTH
            tables=[name for name in selected_tables(json.loads(t['scope_json'])) if name not in AUTH]
            saved=await self.db.query('SELECT value FROM service_meta WHERE key=?',('sync:clone-state:'+task_id,))
            state=json.loads(saved[0]['value']) if saved else {}
            phase=state.get('phase') or ('stage' if t['phase']=='apply' else t['phase'])
            labels={'discover':'发现完整清单','await_confirmation':'等待整任务批准','transfer':'下载正文与媒体','stage':'整理持久暂存记录','verify':'检查清单范围','verify_tables':'逐表检查暂存数量','verify_source':'核对对端清单版本','verify_admin':'检查管理员并取得应用锁','restore':'恢复业务数据','prune':'清理目标多余记录','cleanup':'清理暂存分片；选入账号时统一切换账号','done':'已完成'}
            if phase=='verify_tables':tables=selected_tables(json.loads(t['scope_json']))
            index=max(0,min(int(state.get('table',0)),len(tables)))
            ordered=list(reversed(tables)) if phase=='prune' else tables
            if t['status']=='cancelled':phase='cancelled';index=0;labels['cancelled']='已取消；已应用内容不回滚'
            clone={'phase':phase,'label':labels.get(phase,phase),'table':ordered[index] if phase in ('restore','prune','verify_tables') and index<len(ordered) else None,'completed_tables':len(tables) if phase in ('cleanup','done') else index,'total_tables':len(tables),'storage':'service_meta / sync:clone-state:'+task_id+'；分片见 sync_parts / sync_file_parts'}
        from site_sync.core.adaptive import read as adaptive_state
        load=await adaptive_state(self.db,task_id)
        return {'adaptation':load,'task':dict({k:t[k] for k in TASK_FIELDS.split(',')},quarantined=load['quarantined']),'counts':counts,'clone':clone,'media':files[0],'body':body[0],'current':current,'offsets':offsets,'files':media_current,'server_time':self.clock(),'retry_policy':await self.retry_policy(actor),'log_storage':'当前站点数据库 / sync_events（每任务最近256条）','diagnostic_events':recent,'checkpoint_storage':'sync_tasks / sync_items / sync_parts / sync_file_parts'}

    async def logs(self,actor,task_id,*,before=None):
        await self.own_task(actor,task_id)
        where='task_id=?';args=[task_id]
        if before is not None:where+=' AND event_id<?';args.append(integer(before,1,2**53-1))
        rows=await self.db.query('SELECT event_id,occurred_at,kind,level,phase,status,progress_seq,next_run_at,slice_bytes,attempt_id,detail FROM sync_events WHERE '+where+' ORDER BY event_id DESC LIMIT 31',args)
        more=len(rows)>30;rows=rows[:30]
        for row in rows:row['detail']=json.loads(row['detail'])
        return {'items':rows,'cursor':rows[-1]['event_id'] if more else None,'limit':256}

    async def items(self,actor,task_id,*,cursor=''):
        await self.own_task(actor,task_id)
        if not isinstance(cursor,str) or len(cursor)>256:raise ValueError('无效分页游标')
        rows=await self.db.query('SELECT item_id,module,record_id,action,source_version,target_version,status,staged_bytes,selected FROM sync_items WHERE task_id=? AND item_id>? ORDER BY item_id LIMIT 51',(task_id,cursor))
        more=len(rows)>50;rows=rows[:50]
        return {'items':rows,'cursor':rows[-1]['item_id'] if more else None}
    async def create(self,actor,body):
        g=await self.grant(actor,True)
        if set(body)-{'peer_id','scope','request_id','auto_confirm','auto_delete','settings'} or not {'peer_id','scope','request_id'}<=set(body) or not isinstance(body['request_id'],str) or not 8<=len(body['request_id'])<=128:raise InputError('body','创建参数不完整或请求 ID 不合法','peer_id、scope、8—128字符 request_id；可选确认策略和 settings')
        op='manual:'+hashlib.sha256((actor.grant_id+'\0'+body['request_id']).encode()).hexdigest()
        if not isinstance(body['peer_id'],str) or not 1<=len(body['peer_id'])<=64:raise InputError('peer_id','对端标识不合法','已保存的对端标识')
        if self.principal_scopes is not None and not set(selection(body['scope']))<=set(self.principal_scopes):raise AuthorizationError('当前账号无权创建此范围任务')
        receiver_validate(dict(scope=body['scope'],settings=body.get('settings'),auto_confirm=body.get('auto_confirm',True),auto_delete=body.get('auto_delete',True),mode='manual'))
        selected=selection(body['scope'])
        if not g['can_write'] or not set(selected)<=set(json.loads(g['scopes_json'])):raise AuthorizationError('本站授权范围不足')
        if is_restore(selected) and not g['can_delete']:raise AuthorizationError('本站缺少替换权限')
        if self.preflight:
            execution_settings({**await site(self.db,self.repo.platform),**(body.get('settings') or {})})
            previous=await self.db.query('SELECT task_id FROM sync_tasks WHERE operation_id=? AND grant_id=?',(op,actor.grant_id))
            if not previous:await self.preflight(body['peer_id'],selection(body['scope']))
        t=await create_receiver(self.repo,peer_id=body['peer_id'],grant_id=actor.grant_id,scope=body['scope'],operation_id=op,now=self.clock(),mode='manual',auto_confirm=body.get('auto_confirm',True),auto_delete=body.get('auto_delete',True),settings=body.get('settings'))
        return {'task_id':t['task_id']}
    async def command(self,actor,task_id,command,body):
        t=await self.own_task(actor,task_id,True)
        if command=='confirm':
            if set(body)!={'selected'}:raise ValueError('无效确认参数')
            await self.repo.confirm(task_id,actor.grant_id,body['selected'],self.clock())
        elif command=='delete':
            if body:raise ValueError('无效命令参数')
            g=await self.grant(actor,True)
            await self.db.batch([self.repo.command_guard(task_id,actor.grant_id,g['revision'],self.clock()),
                ("UPDATE sync_tasks SET delete_requested=1,cancel_intent=CASE WHEN status IN ('done','cancelled') THEN cancel_intent ELSE 1 END,status=CASE WHEN status IN ('done','cancelled') THEN status ELSE 'cancel_requested' END,next_run_at=?,revision=revision+1 WHERE task_id=?",(self.clock(),task_id))])
        elif command in ('pause','resume','cancel'):
            if body:raise ValueError('无效命令参数')
            await getattr(self.repo,command)(task_id,actor.grant_id,self.clock())
        elif command=='settings':
            if set(body)!={'revision','fast_retries','slice_bytes','min_slice_bytes','slow_retry_seconds','auto_shrink'}:raise ValueError('无效设置参数')
            revision=integer(body['revision'],0,2**53-1)
            values=policy({k:v for k,v in body.items() if k!='revision'})
            g=await self.grant(actor,True)
            if not g['can_write']:raise AuthorizationError('无写入设置权限')
            result=await self.db.batch([('''UPDATE sync_tasks SET fast_retries=?,slice_bytes=?,min_slice_bytes=?,slow_retry_seconds=?,auto_shrink=?,initial_slice_bytes=?,revision=revision+1
              WHERE task_id=? AND grant_id=? AND revision=? AND lease_until<=? AND status IN ('ready','waiting','paused')
              AND EXISTS(SELECT 1 FROM sync_grants WHERE grant_id=? AND revision=? AND enabled=1 AND (expires_at=0 OR expires_at>?))''',
              (*values,task_id,actor.grant_id,revision,self.clock(),actor.grant_id,g['revision'],self.clock())),('DELETE FROM service_meta WHERE key=? AND changes()=1',('sync:adaptive:'+task_id,))])
            if result[0]['meta']['changes']!=1:raise ConflictError('请先暂停并等待当前执行结束，或刷新后重试')
        else:raise ValueError('未知任务操作')
        from site_sync.core.journal import statements as journal
        await self.db.batch(journal(task_id,self.clock(),'admin:'+command))
        return {'task_id':task_id}
    async def save_defaults(self,actor,body):
        g=await self.grant(actor,True)
        if not g['can_write']:raise AuthorizationError('Settings denied')
        values=execution_settings(body)
        incompatible=await self.db.query("SELECT schedule_id FROM sync_schedules WHERE coalesce(json_extract(settings_json,'$.min_slice_bytes'),?)>coalesce(json_extract(settings_json,'$.slice_bytes'),?) LIMIT 1",(values['min_slice_bytes'],values['slice_bytes']))
        if incompatible:raise ValueError('Defaults conflict with an existing schedule slice range')
        result=await self.db.batch([('INSERT INTO service_meta(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM sync_grants WHERE grant_id=? AND revision=? AND enabled=1 AND can_write=1 AND (expires_at=0 OR expires_at>?)) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(KEY,json.dumps(values),actor.grant_id,g['revision'],self.clock()))])
        if result[0]['meta']['changes']!=1:raise AuthorizationError('Settings authorization changed')
        return {'defaults':values}

    async def schedules(self,actor,*,cursor=''):
        await self.grant(actor)
        if not isinstance(cursor,str) or len(cursor)>64:raise ValueError('无效游标')
        rows=await self.db.query('SELECT schedule_id,peer_id,scope_json,interval_seconds,next_run_at,enabled,revision,last_task_id,settings_json FROM sync_schedules WHERE grant_id=? AND schedule_id>? ORDER BY schedule_id LIMIT 51',(actor.grant_id,cursor))
        more=len(rows)>50;rows=rows[:50]
        for r in rows:
            r['scope']=json.loads(r.pop('scope_json'));r['settings']=json.loads(r.pop('settings_json'))
        return {'items':rows,'cursor':rows[-1]['schedule_id'] if more else None}
    async def delete_schedule(self,actor,uid,body):
        g=await self.grant(actor,True)
        if not g['can_write']:raise AuthorizationError('无定时写入权限')
        if set(body)!={'revision'} or not isinstance(body['revision'],str) or not 1<=len(body['revision'])<=64:raise ValueError('无效计划修订号')
        if not isinstance(uid,str) or not 1<=len(uid)<=32:raise ValueError('无效计划 ID')
        result=await self.db.batch([('DELETE FROM sync_schedules WHERE schedule_id=? AND grant_id=? AND revision=? AND EXISTS(SELECT 1 FROM sync_grants WHERE grant_id=? AND revision=? AND enabled=1 AND can_write=1 AND (expires_at=0 OR expires_at>?))',
            (uid,actor.grant_id,body['revision'],actor.grant_id,g['revision'],self.clock()))])
        if result[0]['meta']['changes']!=1:raise ConflictError('计划已变更、已删除或无权限，请刷新')
        return {'deleted':True,'schedule_id':uid,'existing_tasks_preserved':True}

    async def save_schedule(self,actor,body):
        g=await self.grant(actor,True)
        required={'schedule_id','revision','peer_id','scope','interval_seconds','enabled'}
        if not required<=set(body) or set(body)-required-{'request_id','settings'}:raise ValueError('无效计划设置')
        if not g['can_write']:raise AuthorizationError('无定时写入权限')
        scope=selection(body['scope'])
        if self.principal_scopes is not None and not set(scope)<=set(self.principal_scopes):raise AuthorizationError('当前账号无权创建此范围计划')
        if not isinstance(scope,list) or not 0<len(scope)<=64 or any(not isinstance(x,str) for x in scope) or not set(scope).issubset(json.loads(g['scopes_json'])):raise AuthorizationError('计划超出授权范围')
        if is_restore(scope) and not g['can_delete']:raise AuthorizationError('整站克隆需单独选择并具备删除权限')
        interval=integer(body['interval_seconds'],60,2592000)
        if type(body['enabled'])!=bool:raise ValueError('无效启用状态')
        request=body.get('request_id')
        if request is not None and (not isinstance(request,str) or not 8<=len(request)<=128):raise ValueError('无效请求 ID')
        uid=body['schedule_id'] or (hashlib.sha256((actor.grant_id+'\0'+request).encode()).hexdigest()[:32] if request else secrets.token_hex(16))
        if not isinstance(uid,str) or len(uid)>32:raise ValueError('无效计划 ID')
        overrides=execution_settings(body.get('settings',{}),partial=True)
        execution_settings({**await site(self.db,self.repo.platform),**overrides})
        if self.preflight and body['enabled']:await self.preflight(body['peer_id'],scope)
        settings_json=json.dumps(overrides,sort_keys=True,separators=(',',':'))
        revision=secrets.token_hex(8);now=self.clock();scope=json.dumps(sorted(set(scope)))
        gate='EXISTS(SELECT 1 FROM sync_grants WHERE grant_id=? AND revision=? AND enabled=1 AND can_write=1 AND (expires_at=0 OR expires_at>?)) AND EXISTS(SELECT 1 FROM sync_peers WHERE peer_id=? AND enabled=1)'
        if body['schedule_id']:
            result=await self.db.batch([('UPDATE sync_schedules SET peer_id=?,scope_json=?,interval_seconds=?,next_run_at=?,enabled=?,revision=?,settings_json=? WHERE schedule_id=? AND grant_id=? AND revision=? AND '+gate,
                (body['peer_id'],scope,interval,now,int(body['enabled']),revision,settings_json,uid,actor.grant_id,body['revision'],actor.grant_id,g['revision'],now,body['peer_id']))])
        else:
            if body['revision'] is not None:raise ValueError('新计划不应包含修订号')
            result=await self.db.batch([('INSERT INTO sync_schedules SELECT ?,?,?,?,?,?,?,?,NULL,? WHERE '+gate+' ON CONFLICT(schedule_id) DO NOTHING',
                (uid,body['peer_id'],actor.grant_id,scope,interval,now,int(body['enabled']),revision,settings_json,actor.grant_id,g['revision'],now,body['peer_id']))])
        if result[0]['meta']['changes']!=1:
            old=await self.db.query('SELECT grant_id,peer_id,scope_json,interval_seconds,enabled,settings_json FROM sync_schedules WHERE schedule_id=?',(uid,))
            expected={'grant_id':actor.grant_id,'peer_id':body['peer_id'],'scope_json':scope,'interval_seconds':interval,'enabled':int(body['enabled']),'settings_json':settings_json}
            if body['schedule_id'] or not request or old!=[expected]:raise ConflictError('计划已变更、无权限或对端不可用，请刷新')
        return {'schedule_id':uid}
