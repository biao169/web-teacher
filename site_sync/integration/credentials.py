"""Site-local credentials shared by management and runtime consumers.

Database overrides environment. A malformed saved value fails closed; it never
silently falls back to an old key. No process cache or business export registry.
Never serialize ResolvedCredential or log its secret.
"""
import json
import os
import re
import secrets
from dataclasses import dataclass,field
from backend.app.native.catalog import now
from backend.app.native.data_tools import authorize
from site_sync.core.authority import AuthorizationError
from .database import adapter

STORAGE_KEY='site_sync.credentials.v1'


def normalize(value):
    if not isinstance(value,str) or len(value)>128:
        raise ValueError('同步密钥必须是64位十六进制字符')
    value=value.strip()
    if re.fullmatch(r'[0-9a-fA-F]{64}',value) is None:
        raise ValueError('同步密钥必须是64位十六进制字符')
    return value.lower()


def generate():
    """Generate a draft only; callers must authorize before exposing it."""
    return secrets.token_hex(32)


@dataclass(frozen=True)
class ResolvedCredential:
    source:str
    value:str=field(repr=False)
    revision:str=''
    updated_at:str=''
    updated_by:str=''

    def secret_bytes(self):return bytes.fromhex(self.value)
    def status(self):
        return dict(configured=True,source=self.source,revision=self.revision,
                    updated_at=self.updated_at,updated_by=self.updated_by)


async def resolve(r):
    """Internal runtime read: one indexed SELECT per operation, no admin required."""
    rows=await adapter(r).query('SELECT value FROM service_meta WHERE key=?',(STORAGE_KEY,))
    if rows:
        try:
            raw=rows[0]['value']
            if not isinstance(raw,str) or len(raw)>2048:raise ValueError()
            data=json.loads(raw)
            if not isinstance(data,dict) or isinstance(data.get('version'),bool) or data.get('version')!=1:raise ValueError()
            value=normalize(data['key'])
            if any(not isinstance(data.get(k),str) for k in ('revision','updated_at','updated_by')):raise ValueError()
            return ResolvedCredential('database',value,data['revision'],data['updated_at'],data['updated_by'])
        except (ValueError,KeyError,TypeError):
            raise AuthorizationError('Stored sync credential is invalid') from None
    value=getattr(r.sync_env,'TEACHER_SYNC_KEY','') if hasattr(r,'sync_env') else os.environ.get('TEACHER_SYNC_KEY','')
    if value is None or value=='':return None
    try:return ResolvedCredential('environment',normalize(value))
    except ValueError:raise AuthorizationError('Environment sync credential is invalid') from None


async def require_secret(r):
    credential=await resolve(r)
    if credential is None:raise AuthorizationError('Sync credential is not configured')
    return credential.secret_bytes()


def authorize_management(r):
    # Viewing/copying secrets requires edit, not merely viewing the sync page.
    authorize(r,'edit')


async def status(r):
    authorize_management(r)
    credential=await resolve(r)
    return credential.status() if credential else dict(configured=False,source='missing',revision='',updated_at='',updated_by='')


async def save(r,value):
    """Internal mutation; HTTP caller must additionally enforce CSRF/no-store.

    Current DB session/role permissions are rechecked inside the same transaction
    as the key and audit write. Empty values never clear an existing credential.
    """
    authorize_management(r)
    key=normalize(value);at=now();revision=secrets.token_hex(16)
    record=dict(version=1,key=key,revision=revision,updated_at=at,updated_by=r.p['uid'])
    gid,guard=r.auth.guard(r.p,'data_tools','edit',
        "EXISTS(SELECT 1 FROM auth_users u JOIN auth_roles role ON role.uid=u.role_uid WHERE u.uid=? AND role.is_system=1)",(r.p['uid'],))
    await adapter(r).batch([guard,
        ('INSERT INTO service_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
         (STORAGE_KEY,json.dumps(record,separators=(',',':')))),
        ("INSERT INTO operation_logs(uid,actor_uid,action,module,target_uid,summary,status) VALUES(?,?,'sync-key-save','data_tools',?,'同步密钥已更新','success')",
         (secrets.token_hex(16),r.p['uid'],STORAGE_KEY)),
        ('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    return ResolvedCredential('database',key,revision,at,r.p['uid']).status()


async def reveal(r):
    """Explicit administrator reveal; HTTP caller must enforce CSRF/no-store.

    Audit and revalidate the live session before returning any secret. Runtime
    reads use resolve(), which is internal and does not create view audit rows.
    """
    authorize_management(r)
    credential=await resolve(r)
    if credential is None:raise AuthorizationError('Sync credential is not configured')
    gid,guard=r.auth.guard(r.p,'data_tools','edit',
        "EXISTS(SELECT 1 FROM auth_users u JOIN auth_roles role ON role.uid=u.role_uid WHERE u.uid=? AND role.is_system=1)",(r.p['uid'],))
    await adapter(r).batch([guard,
        ("INSERT INTO operation_logs(uid,actor_uid,action,module,target_uid,summary,status) VALUES(?,?,'sync-key-reveal','data_tools',?,'管理员查看同步密钥','success')",
         (secrets.token_hex(16),r.p['uid'],STORAGE_KEY)),
        ('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    return dict(credential.status(),key=credential.value)
