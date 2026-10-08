"""Small SQL task repository, shared by SQLite and D1.

All methods are internal capabilities: the host resolves the authenticated actor
before issuing commands and updates grant revisions when account/role rules change.
"""
from site_sync.core.selection import is_restore,normalize,selected_tables
import hashlib
import json
import uuid
from site_sync.core.authority import LIVE,SCHEMA,guard,AuthorizationError,ConflictError
from site_sync.core.policy import recover


def token():return uuid.uuid4().hex


def scopes(value):
    if not isinstance(value,list) or not value or len(value)>64 or any(not isinstance(v,str) or not 0<len(v)<=64 for v in value):
        raise ValueError('Invalid module scope')
    return json.dumps(sorted(set(value)),separators=(',',':'))


class Tasks:
    def __init__(self,db,*,lease_seconds=300,platform='worker'):
        if lease_seconds<1 or platform not in ('worker','local'):raise ValueError('Invalid runtime policy')
        self.db,self.lease_seconds,self.platform=db,lease_seconds,platform
        self.admission='1'

    async def put_grant(self,*,grant_id,principal_id,scope,can_write,can_delete,expires_at=0,enabled=True):
        """Trusted host authorization service only; never accept browser role claims."""
        if not grant_id or not principal_id or expires_at<0:raise ValueError('Invalid grant')
        previous=await self.db.query('SELECT principal_id FROM sync_grants WHERE grant_id=?',(grant_id,))
        if previous and previous[0]['principal_id']!=principal_id:raise AuthorizationError('Grant ownership is immutable')
        revision=token()
        result=await self.db.batch([('''INSERT INTO sync_grants VALUES(?,?,?,?,?,?,?,?)
          ON CONFLICT(grant_id) DO UPDATE SET revision=excluded.revision,enabled=excluded.enabled,
          scopes_json=excluded.scopes_json,can_write=excluded.can_write,can_delete=excluded.can_delete,
          expires_at=excluded.expires_at WHERE principal_id=excluded.principal_id''',
          (grant_id,principal_id,revision,int(bool(enabled)),scopes(scope),int(bool(can_write)),int(bool(can_delete)),expires_at))])
        if result[0]['meta']['changes']!=1:raise AuthorizationError('Grant ownership changed concurrently')
        return revision

    async def read(self,task_id):
        rows=await self.db.query('SELECT * FROM sync_tasks WHERE task_id=?',(task_id,))
        if not rows:raise KeyError(task_id)
        return rows[0]

    async def grant(self,grant_id,now):
        rows=await self.db.query('SELECT * FROM sync_grants WHERE grant_id=? AND enabled=1 AND (expires_at=0 OR expires_at>?)',(grant_id,now))
        if not rows:raise AuthorizationError('Grant is not active')
        return rows[0]

    async def command_task(self,task_id,grant_id,now):
        task=await self.read(task_id)
        if task['grant_id']!=grant_id:raise AuthorizationError('Task belongs to another grant')
        current=await self.grant(grant_id,now)
        if not set(json.loads(task['scope_json'])).issubset(json.loads(current['scopes_json'])):
            raise AuthorizationError('Scope no longer allowed')
        return task,current

    async def create(self,*,peer_id,grant_id,scope,operation_id,now,mode='manual',auto_confirm=False,auto_delete=True,expected_grant_revision=None,settings=None):
        if mode not in ('manual','scheduled','proposal') or not operation_id or len(operation_id)>128:raise ValueError('Invalid task request')
        if type(auto_confirm)!=bool or type(auto_delete)!=bool:raise ValueError('Invalid confirmation policy')
        auto_confirm=auto_confirm or mode=='scheduled'
        if isinstance(scope,list) and 'site_clone' in scope and (scope!=['site_clone'] or (auto_confirm and not auto_delete)):raise ValueError('Full clone must be selected alone with deletion enabled')
        scope=normalize(scope)
        if is_restore(scope) and auto_confirm and not auto_delete:raise ValueError('Restore requires replacement approval')
        encoded=scopes(scope); g=await self.grant(grant_id,now)
        if expected_grant_revision is not None and g['revision']!=expected_grant_revision:raise AuthorizationError('Approval policy changed; retry proposal')
        if not set(json.loads(encoded)).issubset(json.loads(g['scopes_json'])):raise AuthorizationError('Scope denied')
        if is_restore(scope) and not g['can_delete']:raise AuthorizationError('Full clone requires delete permission')
        if auto_confirm and not g['can_write']:raise AuthorizationError('Scheduled writing not authorized')
        from site_sync.core.settings import resolve
        config=await resolve(self.db,self.platform,settings)
        uid=token()
        from site_sync.core.journal import statements as journal
        await self.db.batch([('''INSERT INTO sync_tasks(task_id,peer_id,peer_revision,direction,
          grant_revision,grant_enabled,scope_json,created_at,operation_id,grant_id,mode,write_authorized,
          fast_retries,slow_retry_seconds,slice_bytes,auto_confirm,auto_delete,min_slice_bytes,initial_slice_bytes,auto_shrink)
          SELECT ?,p.peer_id,p.revision,?,g.revision,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?
          FROM sync_peers p JOIN sync_grants g ON g.grant_id=?
          WHERE p.peer_id=? AND p.enabled=1 AND g.enabled=1 AND g.revision=?
          AND (g.expires_at=0 OR g.expires_at>?) AND '''+SCHEMA+'''
          AND (? NOT IN ('scheduled','proposal') OR NOT EXISTS(SELECT 1 FROM sync_tasks busy WHERE busy.peer_id=p.peer_id AND busy.status NOT IN ('done','cancelled') AND busy.operation_id!=?))
          ON CONFLICT(operation_id) DO NOTHING''',
          (uid,'proposal' if mode=='proposal' else 'pull',encoded,now,operation_id,grant_id,mode,int(auto_confirm),
           config['fast_retries'],config['slow_retry_seconds'],config['slice_bytes'],int(auto_confirm),int(auto_delete),config['min_slice_bytes'],config['slice_bytes'],int(config['auto_shrink']),grant_id,peer_id,g['revision'],now,mode,operation_id))]+journal(uid,now,'created',{'mode':mode,'auto_confirm':auto_confirm},condition='changes()=1'))
        rows=await self.db.query('SELECT * FROM sync_tasks WHERE operation_id=?',(operation_id,))
        if not rows:
            busy=await self.db.query("SELECT task_id FROM sync_tasks WHERE peer_id=? AND status NOT IN ('done','cancelled') LIMIT 1",(peer_id,))
            if mode in ('scheduled','proposal') and busy:raise ConflictError('Receiver already has an active task')
            raise AuthorizationError('Creation lost its authorization')
        row=rows[0]
        if (row['grant_id'],row['peer_id'],row['scope_json'],row['mode'],row['auto_confirm'],row['auto_delete'])!=(grant_id,peer_id,encoded,mode,int(auto_confirm),int(auto_delete)):raise ConflictError('Operation ID reused with a different request')
        from site_sync.core.settings import validate
        for k,v in validate(settings or {},partial=True).items():
            if row['initial_slice_bytes' if k=='slice_bytes' else k]!=v:raise ConflictError('Operation ID reused with different settings')
        return row

    async def confirm(self,task_id,grant_id,selected,now):
        if selected==['*']:
            from site_sync.integration.clone import approve_all
            return await approve_all(self,task_id,grant_id,now)
        if not isinstance(selected,list) or not selected or len(selected)>500 or any(not isinstance(x,str) for x in selected):raise ValueError('Select 1 to 500 items')
        selected=sorted(set(selected)); task,g=await self.command_task(task_id,grant_id,now)
        if not g['can_write']:raise AuthorizationError('Write denied')
        digest=hashlib.sha256(json.dumps([selected,g['revision']],separators=(',',':')).encode()).hexdigest()
        if task['confirmation_id']==digest and task['write_authorized'] and task['grant_revision']==g['revision']:
            return task
        if task['phase']!='await_confirmation' or task['status']!='waiting':raise ConflictError('Task not waiting for confirmation')
        found=[]
        for start in range(0,len(selected),50):
            chunk=selected[start:start+50]
            found += await self.db.query('SELECT item_id,action FROM sync_items WHERE task_id=? AND item_id IN ('+','.join('?' for _ in chunk)+')',(task_id,*chunk))
        if len(found)!=len(selected):raise ConflictError('Unknown selected item')
        if not g['can_delete'] and any(r['action']=='delete' for r in found):raise AuthorizationError('Deletion not authorized')
        peer=await self.db.query('SELECT revision FROM sync_peers WHERE peer_id=? AND enabled=1',(task['peer_id'],))
        if not peer or peer[0]['revision']!=task['peer_revision']:raise AuthorizationError('Peer changed')
        statements=[('''UPDATE sync_tasks AS t SET confirmation_id=?,write_authorized=1,
          grant_revision=?,phase='transfer',status='ready',revision=revision+1,next_run_at=?
          WHERE task_id=? AND phase='await_confirmation' AND status='waiting' AND revision=?
          AND EXISTS(SELECT 1 FROM sync_grants g WHERE g.grant_id=t.grant_id AND g.revision=? AND g.enabled=1 AND g.can_write=1 AND (g.expires_at=0 OR g.expires_at>?))
          AND EXISTS(SELECT 1 FROM sync_peers p WHERE p.peer_id=t.peer_id AND p.enabled=1 AND p.revision=t.peer_revision)
          AND '''+SCHEMA,(digest,g['revision'],now,task_id,task['revision'],g['revision'],now))]
        statements.append(('UPDATE sync_items SET selected=0 WHERE task_id=? AND EXISTS(SELECT 1 FROM sync_tasks WHERE task_id=? AND confirmation_id=?)',(task_id,task_id,digest)))
        for start in range(0,len(selected),50):
            chunk=selected[start:start+50]
            statements.append(('UPDATE sync_items SET selected=1 WHERE task_id=? AND item_id IN ('+','.join('?' for _ in chunk)+') AND EXISTS(SELECT 1 FROM sync_tasks WHERE task_id=? AND confirmation_id=?)',(task_id,*chunk,task_id,digest)))
        await self.db.batch(statements)
        result=await self.read(task_id)
        if result['confirmation_id']!=digest:raise ConflictError('Confirmation changed concurrently')
        return result

    def command_guard(self,task_id,grant_id,revision,now):
        # Recheck authority INSIDE the same transaction as the admin mutation.
        return ("""UPDATE sync_schema SET version=CASE WHEN EXISTS(
          SELECT 1 FROM sync_tasks t JOIN sync_grants g ON g.grant_id=t.grant_id
          WHERE t.task_id=? AND g.grant_id=? AND g.revision=? AND g.enabled=1
          AND (g.expires_at=0 OR g.expires_at>?)
          AND NOT EXISTS(SELECT 1 FROM json_each(t.scope_json) s
            WHERE s.value NOT IN (SELECT value FROM json_each(g.scopes_json))))
          THEN version ELSE -1 END WHERE singleton=1""",(task_id,grant_id,revision,now))

    async def pause(self,task_id,grant_id,now):
        task,g=await self.command_task(task_id,grant_id,now)
        await self.db.batch([self.command_guard(task_id,grant_id,g['revision'],now),("UPDATE sync_tasks SET status='paused',revision=revision+1 WHERE task_id=? AND status NOT IN ('done','cancelled','cancel_requested')",(task_id,))])

    async def cancel(self,task_id,grant_id,now):
        task,g=await self.command_task(task_id,grant_id,now)
        await self.db.batch([self.command_guard(task_id,grant_id,g['revision'],now),("UPDATE sync_tasks SET cancel_intent=1,status='cancel_requested',next_run_at=?,revision=revision+1 WHERE task_id=? AND status NOT IN ('done','cancelled')",(now,task_id))])

    async def resume(self,task_id,grant_id,now):
        task,g=await self.command_task(task_id,grant_id,now)
        if task['delete_requested'] or task['status']!='paused' or task['lease_until']>now:raise ConflictError('Task paused or active lease has not ended')
        peer=await self.db.query('SELECT revision FROM sync_peers WHERE peer_id=? AND enabled=1',(task['peer_id'],))
        if not peer or peer[0]['revision']!=task['peer_revision']:raise AuthorizationError('Peer changed; create a new preview')
        # A changed authority requires a fresh confirmation of the old selection.
        changed=task['grant_revision']!=g['revision']
        phase='await_confirmation' if changed and task['write_authorized'] else task['phase']
        status='waiting' if phase=='await_confirmation' else 'ready'
        await self.db.batch([self.command_guard(task_id,grant_id,g['revision'],now),('''UPDATE sync_tasks SET status=?,phase=?,grant_revision=?,grant_enabled=1,
          write_authorized=?,confirmation_id=?,no_progress_count=0,next_run_at=?,revision=revision+1
          WHERE task_id=? AND status='paused' AND revision=? AND lease_until<=?''',
          (status,phase,g['revision'],0 if changed else task['write_authorized'],None if changed else task['confirmation_id'],now,task_id,task['revision'],now))])

    async def bind_upgraded_task(self,task_id,grant_id,now):
        """Trusted migration/admin service: bind an unowned paused v1 task.

        Existing selections never grant write permission; confirmation is required.
        """
        task=await self.read(task_id);g=await self.grant(grant_id,now)
        if task['grant_id'] is not None or task['status']!='paused' or task['lease_until']>now:
            raise ConflictError('Not an unbound, quiescent upgraded task')
        if not set(json.loads(task['scope_json'])).issubset(json.loads(g['scopes_json'])):
            raise AuthorizationError('Scope denied')
        phase='discover' if task['phase']=='discover' else 'await_confirmation'
        await self.db.batch([('''UPDATE sync_tasks SET grant_id=?,grant_revision=?,grant_enabled=1,
          write_authorized=0,confirmation_id=NULL,phase=?,status=?,revision=revision+1,next_run_at=?
          WHERE task_id=? AND grant_id IS NULL AND status='paused' AND revision=? AND lease_until<=?
          AND EXISTS(SELECT 1 FROM sync_grants WHERE grant_id=? AND revision=? AND enabled=1 AND (expires_at=0 OR expires_at>?))''',
          (grant_id,g['revision'],phase,'ready' if phase=='discover' else 'waiting',now,task_id,task['revision'],now,grant_id,g['revision'],now))])

    async def claim(self,now):
        # Invalid grants are made visible as paused without initializing a handler.
        invalid=await self.db.query(f'''SELECT t.task_id FROM sync_tasks t
          WHERE status IN ('ready','waiting','cancel_requested') AND next_run_at<=? AND lease_until<=?
          AND NOT ({LIVE}) ORDER BY last_dispatched_at,created_at,task_id LIMIT 1''',(now,now,now))
        if invalid:
            from site_sync.core.journal import statements as journal
            await self.db.batch([("UPDATE sync_tasks SET status='paused',last_error='Authorization changed',revision=revision+1 WHERE task_id=? AND lease_until<=?",(invalid[0]['task_id'],now))]+journal(invalid[0]['task_id'],now,'authorization',{'reason':'Authorization changed'},'error',condition='changes()=1'))
            return None
        candidate=await self.db.query(f'''SELECT t.task_id FROM sync_tasks t
          WHERE status IN ('ready','waiting','cancel_requested') AND next_run_at<=? AND lease_until<=?
          AND (phase!='await_confirmation' OR cancel_intent=1) AND grant_enabled=1 AND {LIVE}
          ORDER BY last_dispatched_at,created_at,task_id LIMIT 1''',(now,now,now))
        if not candidate:return None
        uid=candidate[0]['task_id']; lease=token(); attempt=token()
        from site_sync.core.journal import statements as journal
        rows=await self.db.batch([(f'''UPDATE sync_tasks AS t SET status='running',
          phase=CASE WHEN cancel_intent=1 THEN 'cleanup' ELSE phase END,
          lease_token=?,lease_until=?,attempt_id=?,attempt_start_seq=progress_seq,
          last_dispatched_at=?,revision=revision+1
          WHERE task_id=? AND status IN ('ready','waiting','cancel_requested')
          AND next_run_at<=? AND lease_until<=? AND grant_enabled=1 AND {LIVE} AND {SCHEMA}
          AND ({self.admission}) AND NOT EXISTS(SELECT 1 FROM sync_tasks WHERE lease_token IS NOT NULL AND lease_until>?)
          RETURNING *''',(lease,now+self.lease_seconds,attempt,now,uid,now,now,now,now))]+journal(uid,now,'start',condition='lease_token=? AND attempt_id=?',args=(lease,attempt)))
        return rows[0]['results'][0] if rows[0]['results'] else None

    def assertion(self,task,now,*,write=False,extra='1',args=()):
        condition,values=guard(task,now,write=write)
        return (f'''UPDATE sync_schema SET version=CASE WHEN EXISTS(
          SELECT 1 FROM sync_tasks t WHERE {condition} AND ({extra})) THEN version ELSE -1 END
          WHERE singleton=1''',(*values,*args))

    async def add_item(self,task,*,item_id,module,record_id,source_version,now,action='upsert',target_version=None,discovery_cursor=None):
        if any(not isinstance(x,str) or not 0<len(x)<=256 for x in (item_id,record_id,source_version)):
            raise ValueError('Invalid bounded item identity')
        if action not in ('upsert','delete') or module not in json.loads(task['scope_json']):raise AuthorizationError('Item outside scope')
        if discovery_cursor is not None and (not isinstance(discovery_cursor,str) or len(discovery_cursor.encode())>2048):raise ValueError('Invalid discovery cursor')
        old=await self.db.query('SELECT module,record_id,action,source_version,target_version FROM sync_items WHERE task_id=? AND item_id=?',(task['task_id'],item_id))
        if old and old[0]!={'module':module,'record_id':record_id,'action':action,'source_version':source_version,'target_version':target_version}:raise ConflictError('Candidate version changed')
        g=await self.grant(task['grant_id'],now)
        selected=task['auto_confirm'] and (action!='delete' or (g['can_delete'] and task['auto_delete']))
        cursor_guard=" AND (t.discovery_cursor IS ? OR t.discovery_cursor=?)" if discovery_cursor is not None else ""
        cursor_args=(task.get('discovery_cursor'),discovery_cursor) if discovery_cursor is not None else ()
        statements=[
          self.assertion(task,now,extra="t.phase='discover' AND (EXISTS(SELECT 1 FROM sync_items WHERE task_id=t.task_id AND item_id=?) OR json_extract(t.scope_json,'$[0]')='site_clone' OR substr(json_extract(t.scope_json,'$[0]'),1,8)='restore_' OR NOT EXISTS(SELECT 1 FROM sync_items WHERE task_id=t.task_id LIMIT 1 OFFSET 1999))"+cursor_guard,args=(item_id,*cursor_args)),
          ('''INSERT INTO sync_items(task_id,item_id,module,record_id,action,source_version,target_version,apply_key,selected)
           VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id,item_id) DO NOTHING''',
           (task['task_id'],item_id,module,record_id,action,source_version,target_version,task['task_id']+':'+item_id,int(selected))),
          ('UPDATE sync_tasks SET progress_seq=progress_seq+1,revision=revision+1,last_progress_at=? WHERE task_id=? AND changes()=1',(now,task['task_id']))]
        if discovery_cursor is not None:
            statements.append(('UPDATE sync_tasks SET discovery_cursor=? WHERE task_id=?',(discovery_cursor,task['task_id'])))
        await self.db.batch(statements)
        return await self.read(task['task_id'])

    async def advance(self,task,phase,now):
        current=await self.read(task['task_id'])
        transitions={'discover':'await_confirmation','transfer':'apply','apply':'cleanup','cleanup':'done'}
        if transitions.get(current['phase'])!=phase:raise ConflictError('Invalid phase transition')
        if current['phase']=='discover' and current['auto_confirm']:phase='transfer'
        extra='1'
        if phase=='done':
            extra="NOT EXISTS(SELECT 1 FROM sync_parts WHERE task_id=t.task_id) AND NOT EXISTS(SELECT 1 FROM sync_files WHERE task_id=t.task_id AND status!='done')"
        if phase in ('apply','cleanup') and current['phase']!='cleanup':
            if phase=='apply':extra="NOT EXISTS(SELECT 1 FROM sync_items WHERE task_id=t.task_id AND selected=1 AND status NOT IN ('staged','applied'))"
            else:extra="NOT EXISTS(SELECT 1 FROM sync_items WHERE task_id=t.task_id AND selected=1 AND status!='applied')"
        await self.db.batch([self.assertion(task,now,write=current['phase'] in ('transfer','apply') or phase=='transfer',extra=extra),
          ('UPDATE sync_tasks SET phase=?,progress_seq=progress_seq+1,revision=revision+1,last_progress_at=? WHERE task_id=?',(phase,now,task['task_id']))])

    async def mark_staged(self,task,item_id,expected_bytes,now):
        if not isinstance(expected_bytes,int) or not 0<=expected_bytes<=1048576:raise ValueError('Invalid record size')
        await self.db.batch([self.assertion(task,now,write=True,extra="t.phase='transfer'"),
          ("UPDATE sync_items SET status='staged' WHERE task_id=? AND item_id=? AND selected=1 AND status='pending' AND staged_bytes=?",(task['task_id'],item_id,expected_bytes)),
          ('UPDATE sync_tasks SET progress_seq=progress_seq+1,revision=revision+1,last_progress_at=? WHERE task_id=? AND changes()=1',(now,task['task_id']))])
        rows=await self.db.query("SELECT item_id FROM sync_items WHERE task_id=? AND item_id=? AND selected=1 AND status='staged' AND staged_bytes=?",(task['task_id'],item_id,expected_bytes))
        if not rows:raise ConflictError('Incomplete or unselected record')

    async def cleanup_one(self,task,now):
        result=await self.db.batch([self.assertion(task,now,extra="t.phase='cleanup'"),
          ('DELETE FROM sync_parts WHERE rowid=(SELECT rowid FROM sync_parts WHERE task_id=? LIMIT 1)',(task['task_id'],)),
          ('UPDATE sync_tasks SET progress_seq=progress_seq+1,revision=revision+1,last_progress_at=? WHERE task_id=? AND changes()=1',(now,task['task_id']))])
        return bool(result[1]['meta']['changes'])

    async def commit_item(self,task,item_id,statement,now):
        rows=await self.db.query('SELECT status,action FROM sync_items WHERE task_id=? AND item_id=? AND selected=1',(task['task_id'],item_id))
        if not rows:raise ConflictError('No selected item')
        if rows[0]['status']=='applied':
            await self.db.batch([self.assertion(task,now,write=True)])
            return False
        extra="t.phase='apply' AND EXISTS(SELECT 1 FROM sync_items WHERE task_id=t.task_id AND item_id=? AND status='staged' AND selected=1)"
        extra+=" AND NOT EXISTS(SELECT 1 FROM sync_files WHERE task_id=t.task_id AND item_id=? AND status NOT IN ('uploaded','published'))"
        if rows[0]['action']=='delete':extra+=" AND EXISTS(SELECT 1 FROM sync_grants WHERE grant_id=t.grant_id AND can_delete=1)"
        try:
            await self.db.batch([self.assertion(task,now,write=True,extra=extra,args=(item_id,item_id)),statement,
              ('UPDATE sync_schema SET version=CASE WHEN changes()=1 THEN version ELSE -1 END WHERE singleton=1',()),
              ("UPDATE sync_items SET status='applied' WHERE task_id=? AND item_id=?",(task['task_id'],item_id)),
              ("UPDATE sync_files SET status='published' WHERE task_id=? AND item_id=? AND status='uploaded'",(task['task_id'],item_id)),
              ('UPDATE sync_tasks SET progress_seq=progress_seq+1,revision=revision+1,last_progress_at=? WHERE task_id=?',(now,task['task_id']))])
        except Exception as exc:
            if (getattr(exc,'sqlite_errorcode',0)&255)==19 or 'constraint failed' in str(exc).lower():
                raise ConflictError('Business precondition or authorization guard rejected the commit') from exc
            raise
        return True

    async def defer(self,task,now,*,diagnostic=None):
        from site_sync.core.journal import statements as journal
        current=await self.read(task['task_id'])
        if current['status'] in ('paused','cancel_requested'):return await self.finish(task,now)
        await self.db.batch([("UPDATE sync_tasks SET status='waiting',next_run_at=?,lease_token=NULL,lease_until=0,reconciled_attempt_id=attempt_id,revision=revision+1 WHERE task_id=? AND status='running' AND attempt_id=? AND lease_token=? AND lease_until>?",(now+60,task['task_id'],task['attempt_id'],task['lease_token'],now))]+journal(task['task_id'],now,'deferred',{'reason':'SYNC_PAUSED','diagnostic':diagnostic or {}},condition='changes()=1'))

    async def finish(self,task,now,*,error=None,permanent=False,resource=False,uncertain=False,diagnostic=None):
        current=await self.read(task['task_id'])
        if current['attempt_id']!=task['attempt_id'] or current['lease_token']!=task['lease_token']:return False
        if current['status'] in ('paused','cancel_requested'):
            # Only the returning owner may release an interrupted command's lease.
            # Never change the user's pause/cancel choice or accept stale writes.
            await self.db.batch([('UPDATE sync_tasks SET lease_token=NULL,lease_until=0,next_run_at=?,revision=revision+1 WHERE task_id=? AND attempt_id=? AND lease_token=? AND status IN (\'paused\',\'cancel_requested\')',(now,task['task_id'],task['attempt_id'],task['lease_token']))])
            return True
        if current['status']!='running':return False
        if not uncertain and current['lease_until']<=now:return False
        valid=await self.db.query(f'SELECT task_id FROM sync_tasks t WHERE task_id=? AND {LIVE}',(task['task_id'],now))
        permanent=permanent or not valid
        from site_sync.core.retry_settings import read as retry_settings
        cadence=await retry_settings(self.db)
        decision=recover(current['attempt_start_seq'],current['progress_seq'],current['no_progress_count'],
          failed=bool(error) or uncertain,permanent=permanent,fast_retries=current['fast_retries'],slow_seconds=current['slow_retry_seconds'],fast_seconds=cadence['fast_retry_seconds'])
        delay=decision.delay
        status='paused' if permanent else ('cancelled' if current['cancel_intent'] else 'done') if current['phase']=='done' else 'waiting'
        wait=delay if delay else (1 if current['progress_seq']>current['attempt_start_seq'] else 60)
        from site_sync.core import adaptive
        classification=adaptive.classify(diagnostic,resource=resource,uncertain=uncertain)
        if classification=='credential':
            wait=max(wait,adaptive.credential_wait(decision.consecutive,cadence['fast_retry_seconds'],current['slow_retry_seconds']))
        if resource or uncertain or classification in ('cpu','memory','resource_unknown','rpc_unknown','timeout'):
            wait=max(wait,cadence['fast_retry_seconds'])
        previous=await adaptive.read(self.db,task['task_id'])
        size,load=adaptive.adjust(current,previous,now,classification,progress=current['progress_seq']>current['attempt_start_seq'],failed=bool(error) or uncertain or permanent,body_success=task.get('_body_progress',False))
        from site_sync.core.journal import statements as journal
        await self.db.batch([('''UPDATE sync_tasks SET status=?,no_progress_count=?,next_run_at=?,slice_bytes=?,
          total_errors=total_errors+?,last_error=?,lease_token=NULL,lease_until=0,reconciled_attempt_id=?,revision=revision+1
          WHERE task_id=? AND status='running' AND attempt_id=? AND lease_token=? AND revision=?''',
          (status,decision.consecutive,now+wait,size,int(bool(error) or uncertain),
           ('Authorization changed' if not valid else error),current['attempt_id'],task['task_id'],current['attempt_id'],current['lease_token'],current['revision'])),adaptive.save(task['task_id'],load)]+journal(task['task_id'],now,'recovered' if uncertain else 'error' if error else 'step',{'before_phase':task['phase'],'before_progress':current['attempt_start_seq'],'progress_delta':current['progress_seq']-current['attempt_start_seq'],'error':error,'diagnostic':diagnostic or {},'outcome':decision.outcome,'adaptation':dict(load,before_bytes=current['slice_bytes'],after_bytes=size,retry_delay=wait,checkpoint_retained=True)},'error' if error or uncertain else 'info',condition='changes()=1'))
        return True

    async def reconcile_one(self,now):
        rows=await self.db.query("SELECT * FROM sync_tasks WHERE status='running' AND lease_until<=? AND attempt_id IS NOT NULL AND (reconciled_attempt_id IS NULL OR reconciled_attempt_id!=attempt_id) ORDER BY lease_until,task_id LIMIT 1",(now,))
        if not rows:return False
        await self.finish(rows[0],now,error='UncertainInterruptedAttempt',uncertain=True)
        return True
