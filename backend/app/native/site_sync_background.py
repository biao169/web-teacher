"""Shared background authorization; full content/media services are optional.

Read-only contexts retain the exact grant, user, role, peer and permission guards.
No credential hashing, renderer or storage object is created for latest previews.
"""
import copy,json,secrets
from .auth import Auth
from .catalog import Error,now
from .data_tools import authorize,encoded
from .site_sync_gate import KEY
from .site_sync_recovery import MODULES as SCOPES
from .site_sync_initialization import advance as init_stage

class BackgroundAuth(Auth):
    """Narrow service grant: business sync only, no account/session/admin access."""
    def __init__(self,sql,passwords,policy,policy_key=KEY):
        super().__init__(sql,passwords);self.policy=policy;self.policy_key=policy_key
    def require(self,p,module,action='view'):
        if module not in (*SCOPES,'data_tools') or action not in ('view','export','create','edit','delete'):raise Error('后台同步授权范围无效',403)
        super().require(p,module,action)
    def guard(self,p,module,action,condition='1',args=()):
        self.require(p,module,action)
        uid=secrets.token_hex(16);at=now()
        clause="EXISTS(SELECT 1 FROM auth_users u JOIN auth_roles r ON r.uid=u.role_uid JOIN auth_permissions a ON a.role_uid=r.uid WHERE u.uid=? AND u.role_uid=? AND u.updated_at=? AND u.status='active' AND u.must_change_password=0 AND r.updated_at=? AND r.is_active=1 AND r.is_system=1 AND a.module=? AND a.can_view=1 AND a.can_"+action+"=1) AND EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM sync_peers WHERE id=1 AND enabled=1 AND revision=?) AND ("+condition+')'
        if self.policy.get('task_uid'):
            from .site_sync_manual_gate import binding
            clause+=" AND EXISTS(SELECT 1 FROM sync_tasks WHERE uid=? AND status IN ('reading','ready') AND coalesce(json_extract(state,'$.history_deleting'),0)=0 AND "+binding(self.policy['mode'])+'=json(?))' 
            args=(*args,self.policy['task_uid'],encoded(self.policy['binding']).decode())
        params=(p['uid'],p['role_uid'],p['user_stamp'],p['role_stamp'],module,self.policy_key,encoded(self.policy).decode(),self.policy['peer_revision'],*args,uid,module,uid,at,at)
        return uid,('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) SELECT CASE WHEN '+clause+" THEN ? ELSE '' END,?,?,?,?",params)

async def context(base,policy,*,policy_key=KEY,read_only=False):
    await init_stage('authorization')
    owner=policy['owner']
    rows=await base.sql.query("SELECT u.uid,u.display_name,u.username,u.role_uid,u.must_change_password,u.updated_at user_stamp,r.updated_at role_stamp,r.is_system,r.visibility_scopes FROM auth_users u JOIN auth_roles r ON r.uid=u.role_uid WHERE u.uid=? AND u.status='active' AND r.is_active=1 AND r.is_system=1",(owner['uid'],))
    if not rows or any(rows[0][k]!=v for k,v in owner.items()):raise Error('后台授权已失效，请管理员重新保存策略',403)
    p=rows[0];p['scopes']=json.loads(p['visibility_scopes']);p['permissions']={x['module']:x for x in await base.sql.query('SELECT * FROM auth_permissions WHERE role_uid=?',(p['role_uid'],))}
    r=copy.copy(base);r.p=p;r.auth=BackgroundAuth(r.sql,r.passwords,policy,policy_key)
    if not read_only and not getattr(base,'sync_services_only',False):
        from .content import Content
        from .media import Media
        r.content=Content(r.sql,r.auth);r.media=Media(r.sql,r.auth,r.content,r.media_store,r.kind)
    authorize(r,'edit',SCOPES);authorize(r,'export',SCOPES)
    return r

