"""One receiver-side schedule per invocation, idempotent after a lost receipt."""
import json
import re
import secrets
from site_sync.core.authority import AuthorizationError,ConflictError


class Schedules:
    def __init__(self,repo):self.repo,self.db=repo,repo.db
    async def put(self,*,schedule_id,peer_id,grant_id,scope,interval_seconds,now,enabled=True,settings=None):
        # Trusted admin call, after website actor authorization.
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,32}',schedule_id) or type(interval_seconds)!=int or not 60<=interval_seconds<=2592000:raise ValueError('Invalid schedule')
        if not isinstance(scope,list) or not 0<len(scope)<=64 or any(not isinstance(x,str) or not 0<len(x)<=64 for x in scope):raise ValueError('Invalid scope')
        g=await self.repo.grant(grant_id,now)
        if not g['can_write'] or not set(scope).issubset(json.loads(g['scopes_json'])):raise AuthorizationError('Schedule outside grant')
        from site_sync.core.settings import validate,resolve
        overrides=validate(settings or {},partial=True);await resolve(self.db,self.repo.platform,overrides)
        await self.db.batch([('''INSERT INTO sync_schedules VALUES(?,?,?,?,?,?,?,?,NULL,?)
          ON CONFLICT(schedule_id) DO UPDATE SET peer_id=excluded.peer_id,grant_id=excluded.grant_id,
          scope_json=excluded.scope_json,interval_seconds=excluded.interval_seconds,
          next_run_at=excluded.next_run_at,enabled=excluded.enabled,revision=excluded.revision,settings_json=excluded.settings_json''',
          (schedule_id,peer_id,grant_id,json.dumps(sorted(set(scope))),interval_seconds,now,int(enabled),secrets.token_hex(8),json.dumps(overrides)))])
    async def tick(self,now):
        rows=await self.db.query('SELECT * FROM sync_schedules WHERE enabled=1 AND next_run_at<=? ORDER BY next_run_at,schedule_id LIMIT 1',(now,))
        if not rows:return {'action':'idle'}
        s=rows[0]
        # No overlapping receiver copies, including paused tasks. Advance the
        # due time so one blocked schedule cannot starve other receivers.
        active=await self.db.query("SELECT task_id FROM sync_tasks WHERE peer_id=? AND status NOT IN ('done','cancelled') LIMIT 1",(s['peer_id'],))
        if active:
            await self.defer(s,now);return {'action':'schedule-blocked','task_id':active[0]['task_id']}
        op='auto:'+s['schedule_id']+':'+s['revision']+':'+str(s['next_run_at'])
        try:t=await self.repo.create(peer_id=s['peer_id'],grant_id=s['grant_id'],scope=json.loads(s['scope_json']),operation_id=op,now=now,mode='scheduled',settings=json.loads(s['settings_json']))
        except ConflictError:
            await self.defer(s,now);return {'action':'schedule-blocked'}
        except AuthorizationError:
            await self.db.batch([('UPDATE sync_schedules SET enabled=0 WHERE schedule_id=? AND revision=?',(s['schedule_id'],s['revision']))])
            return {'action':'schedule-authorization-paused'}
        await self.db.batch([('UPDATE sync_schedules SET next_run_at=?,last_task_id=? WHERE schedule_id=? AND revision=? AND next_run_at=?',
           (now+s['interval_seconds'],t['task_id'],s['schedule_id'],s['revision'],s['next_run_at']))])
        return {'action':'scheduled','task_id':t['task_id']}
    async def defer(self,s,now):
        await self.db.batch([('UPDATE sync_schedules SET next_run_at=? WHERE schedule_id=? AND revision=? AND next_run_at=?',
            (now+s['interval_seconds'],s['schedule_id'],s['revision'],s['next_run_at']))])
