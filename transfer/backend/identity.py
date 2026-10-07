"""Live main-site authorization, also checked inside transfer write transactions."""
from backend.app.native.catalog import now
from .accounting import assertion


def permission(p, action='view'):
    """Use the current role, never historical admin_grants or an ft_session ticket."""
    actions={'view':('can_view',),'create':('can_view','can_create'),
             'manage':('can_view','can_edit','can_delete')}
    columns=actions[action]
    clause="EXISTS(SELECT 1 FROM auth_sessions s JOIN auth_users u ON u.uid=s.user_uid JOIN auth_roles r ON r.uid=u.role_uid JOIN auth_permissions a ON a.role_uid=r.uid WHERE s.uid=? AND u.uid=? AND s.revoked_at IS NULL AND s.idle_expires_at>? AND s.expires_at>? AND u.status='active' AND u.must_change_password=0 AND r.is_active=1 AND a.module='transfer' AND "+' AND '.join('a.'+c+'=1' for c in columns)+')'
    at=now()
    return clause,(p['session_uid'],p['uid'],at,at)


class SessionSQL:
    """Fence all signed-in mutations, including each download chunk settlement."""
    def __init__(self,sql,p,action='view'):
        self.sql,self.p,self.action=sql,p,action
    async def query(self,sql,args=()):return await self.sql.query(sql,args)
    async def batch(self,statements):
        if not self.p:return await self.sql.batch(statements)
        return (await self.sql.batch([assertion(*permission(self.p,self.action)),*statements]))[1:]
