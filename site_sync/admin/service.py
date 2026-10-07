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
    def __init__(self,repo,clock,*,retention_days=90):
        self.repo,self.db,self.clock=repo,repo.db,clock
        self.retention_days=integer(retention_days,7,3650)
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
    async def options(self,actor):
        g=await self.grant(actor)
        peers=await self.db.query('SELECT peer_id FROM sync_peers WHERE enabled=1 ORDER BY peer_id LIMIT 100')
        return {'peers':peers,'modules':json.loads(g['scopes_json']),'can_write':bool(g['can_write'] and g['enabled'] and (not g['expires_at'] or g['expires_at']>self.clock())),
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
        rows=await self.db.query('SELECT '+TASK_FIELDS+' FROM sync_tasks WHERE '+where+' ORDER BY created_at DESC,task_id DESC LIMIT ?',(*args,limit+1))
        more=len(rows)>limit;rows=rows[:limit]
        return {'items':rows,'cursor':[rows[-1]['created_at'],rows[-1]['task_id']] if more else None,'server_time':self.clock()}
    async def detail(self,actor,task_id):
        t=await self.own_task(actor,task_id)
        counts=await self.db.query('SELECT status,count(*) n FROM sync_items WHERE task_id=? GROUP BY status',(task_id,))
        files=await self.db.query('SELECT count(*) n,coalesce(sum(total_bytes),0) total,coalesce(sum(committed_bytes),0) committed FROM sync_files WHERE task_id=?',(task_id,))
        body=await self.db.query("SELECT coalesce(sum(staged_bytes),0) committed,coalesce(sum(CASE WHEN manifest_json IS NOT NULL THEN json_extract(manifest_json,'$.fields.payload') ELSE 0 END),0) total,count(*) records,sum(selected) selected FROM sync_items WHERE task_id=?",(task_id,))
        current=await self.db.query("SELECT item_id,module,record_id,status,staged_bytes,manifest_json FROM sync_items WHERE task_id=? AND selected=1 AND status NOT IN ('applied','skipped') ORDER BY item_id LIMIT 1",(task_id,))
        offsets=[];media_current=[]
        if current:
            i=current[0];i.pop('manifest_json',None)
            offsets=await self.db.query('SELECT field,max(offset+length(data)) next_offset FROM sync_parts WHERE task_id=? AND item_id=? GROUP BY field LIMIT 32',(task_id,i['item_id']))
            media_current=await self.db.query('SELECT file_id,source_file_id,status,committed_bytes,total_bytes,storage_kind,staging_key FROM sync_files WHERE task_id=? AND item_id=? ORDER BY file_id LIMIT 16',(task_id,i['item_id']))
        return {'task':{k:t[k] for k in TASK_FIELDS.split(',')},'counts':counts,'media':files[0],'body':body[0],'current':current,'offsets':offsets,'files':media_current,'server_time':self.clock(),'log_storage':'当前站点数据库 / sync_events（每任务最近256条）','checkpoint_storage':'sync_tasks / sync_items / sync_parts / sync_file_parts'}

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
        await self.grant(actor,True)
        if set(body)-{'peer_id','scope','request_id','auto_confirm','auto_delete','settings'} or not {'peer_id','scope','request_id'}<=set(body) or not isinstance(body['request_id'],str) or not 8<=len(body['request_id'])<=128:raise ValueError('无效创建参数')
        op='manual:'+hashlib.sha256((actor.grant_id+'\0'+body['request_id']).encode()).hexdigest()
        t=await self.repo.create(peer_id=body['peer_id'],grant_id=actor.grant_id,scope=body['scope'],operation_id=op,now=self.clock(),mode='manual',auto_confirm=body.get('auto_confirm',True),auto_delete=body.get('auto_delete',True),settings=body.get('settings'))
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
              (*values,task_id,actor.grant_id,revision,self.clock(),actor.grant_id,g['revision'],self.clock()))])
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
    async def save_schedule(self,actor,body):
        g=await self.grant(actor,True)
        required={'schedule_id','revision','peer_id','scope','interval_seconds','enabled'}
        if not required<=set(body) or set(body)-required-{'request_id','settings'}:raise ValueError('无效计划设置')
        if not g['can_write']:raise AuthorizationError('无定时写入权限')
        scope=body['scope']
        if not isinstance(scope,list) or not 0<len(scope)<=64 or any(not isinstance(x,str) for x in scope) or not set(scope).issubset(json.loads(g['scopes_json'])):raise AuthorizationError('计划超出授权范围')
        interval=integer(body['interval_seconds'],60,2592000)
        if type(body['enabled'])!=bool:raise ValueError('无效启用状态')
        request=body.get('request_id')
        if request is not None and (not isinstance(request,str) or not 8<=len(request)<=128):raise ValueError('无效请求 ID')
        uid=body['schedule_id'] or (hashlib.sha256((actor.grant_id+'\0'+request).encode()).hexdigest()[:32] if request else secrets.token_hex(16))
        if not isinstance(uid,str) or len(uid)>32:raise ValueError('无效计划 ID')
        overrides=execution_settings(body.get('settings',{}),partial=True)
        execution_settings({**await site(self.db,self.repo.platform),**overrides})
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
