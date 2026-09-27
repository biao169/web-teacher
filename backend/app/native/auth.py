"""Native role/session authentication, password hashing, CSRF and transactional write guards."""
import hashlib,hmac,json,secrets,re
from .catalog import Error,now,MODULES
from backend.app.security.passwords import Passwords
sha=lambda v:hashlib.sha256(v.encode()).hexdigest()
class Auth:
    def __init__(self,sql,passwords):"""保存构造参数和适配器，供此对象后续操作复用。""";self.sql=sql;self.passwords=passwords
    async def bootstrap(self,username,password):
        """Create the sole initial administrator explicitly, never on ordinary startup."""
        if not re.fullmatch(r'[A-Za-z0-9_.-]{3,64}',username):raise Error('账号需3—64位字母、数字、点、下划线或短横线')
        if await self.sql.query('SELECT 1 FROM auth_users LIMIT 1'):raise Error('已有账号，不重复初始化',409)
        uid=secrets.token_hex(16);role=secrets.token_hex(16);at=now();encoded=await self.passwords.hash(password)
        statements=[('INSERT INTO auth_bootstrap_state(id,completed_at,user_uid) VALUES (1,?,?)',(at,uid)),('INSERT INTO auth_roles(uid,name,level,visibility_scopes,is_system,is_active) VALUES (?,?,1000,?,1,1)',(role,'管理员',json.dumps(['public','authenticated','staff','owner','hidden']))),('INSERT INTO auth_users(uid,username,password_hash,display_name,role_uid,status) VALUES (?,?,?,?,?,?)',(uid,username,encoded,username,role,'active'))]
        permission_values=[]
        for module in MODULES:permission_values.extend((secrets.token_hex(16),role,module))
        statements.append(('INSERT INTO auth_permissions(uid,role_uid,module,can_view,can_create,can_edit,can_delete,can_export) VALUES '+','.join('(?,?,?,1,1,1,1,1)' for _ in MODULES),tuple(permission_values)))
        statements += [('INSERT INTO auth_roles(uid,name,level,visibility_scopes,is_active) VALUES (?,?,0,?,1)',('role-registered','网站用户',json.dumps(['public','authenticated']))),('INSERT INTO auth_permissions(uid,role_uid,module,can_view,can_create) VALUES (?,?,?,1,1)',(secrets.token_hex(16),'role-registered','transfer'))]
        statements += [('INSERT INTO site_settings(uid,site_name,is_active) VALUES (?,?,1)',(secrets.token_hex(16),'教师个人网站')),('INSERT INTO global_settings(uid) VALUES (?)',(secrets.token_hex(16),))]
        await self.sql.batch(statements);return uid
    async def login(self,username,password,network):
        """Reserve account/network attempts before expensive KDF; inactive roles cannot log in."""
        if not isinstance(username,str) or not isinstance(password,str) or len(username)>150 or len(password)>128:raise Error('账号或密码输入无效')
        at=now();expiry=now(seconds=900)
        keys=[('account',sha(username.casefold())),('network',sha(network))]
        for scope,key in keys:
            rows=await self.sql.batch([('INSERT INTO auth_login_throttles(key_hash,scope,failures,window_started_at,updated_at,expires_at) VALUES (?,?,1,?,?,?) ON CONFLICT(key_hash) DO UPDATE SET failures=CASE WHEN expires_at<=excluded.updated_at THEN 1 ELSE failures+1 END,window_started_at=CASE WHEN expires_at<=excluded.updated_at THEN excluded.window_started_at ELSE window_started_at END,expires_at=CASE WHEN expires_at<=excluded.updated_at THEN excluded.expires_at ELSE expires_at END,updated_at=excluded.updated_at RETURNING failures',(key,scope,at,at,expiry))])
            if rows[0][0]['failures']>(8 if scope=='account' else 40):raise Error('尝试过多，请15分钟后重试',429)
        rows=await self.sql.query('SELECT u.* FROM auth_users u JOIN auth_roles r ON r.uid=u.role_uid WHERE u.username=? COLLATE NOCASE AND u.status=\'active\' AND r.is_active=1',(username,))
        user=rows[0] if rows else None
        valid=await self.passwords.verify(password,user['password_hash'] if user else '')
        if not valid or not user:raise Error('账号或密码不正确',401)
        token=secrets.token_urlsafe(32);uid=secrets.token_hex(16)
        await self.sql.batch([('INSERT INTO auth_sessions(uid,user_uid,token_hash,created_at,updated_at,last_seen_at,idle_expires_at,expires_at) SELECT ?,uid,?,?,?,?,?,? FROM auth_users WHERE uid=? AND updated_at=? AND status=\'active\' AND EXISTS(SELECT 1 FROM auth_roles WHERE uid=auth_users.role_uid AND is_active=1)',(uid,sha(token),at,at,at,now(seconds=1800),now(seconds=43200),user['uid'],user['updated_at'])),('UPDATE auth_users SET last_login_at=? WHERE uid=?',(at,user['uid'])),('DELETE FROM auth_login_throttles WHERE key_hash=?',(keys[0][1],))])
        return token
    async def principal(self,token):
        """Re-read role and session for each request; return no password/hash secrets."""
        if not token:return None
        at=now();rows=await self.sql.query("SELECT u.uid,u.display_name,u.username,u.role_uid,u.must_change_password,u.updated_at user_stamp,r.updated_at role_stamp,r.level,r.name role_name,r.visibility_scopes,r.is_system,s.uid session_uid,s.expires_at FROM auth_sessions s JOIN auth_users u ON u.uid=s.user_uid JOIN auth_roles r ON r.uid=u.role_uid WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.idle_expires_at>? AND s.expires_at>? AND u.status='active' AND r.is_active=1",(sha(token),at,at))
        if not rows:return None
        p=rows[0];p['permissions']={r['module']:r for r in await self.sql.query('SELECT module,can_view,can_create,can_edit,can_delete,can_export FROM auth_permissions WHERE role_uid=?',(p['role_uid'],))};p['scopes']=json.loads(p['visibility_scopes']);p['csrf']=sha('csrf:'+token)
        await self.sql.batch([('UPDATE auth_sessions SET last_seen_at=?,updated_at=?,idle_expires_at=min(?,expires_at) WHERE uid=? AND revoked_at IS NULL',(at,at,now(seconds=1800),p['session_uid']))]);return p
    def require(self,p,module,action='view'):
        """All action gates are server-side, including custom navigation destinations."""
        if not p:raise Error('请先登录',401)
        if p['must_change_password']:raise Error('请先修改密码',403,'password_required')
        if not p['permissions'].get(module,{}).get('can_view') or not p['permissions'].get(module,{}).get('can_'+action):raise Error('当前角色无法'+('进入' if action=='view' else '执行此操作：')+MODULES.get(module,'此功能'),403,'access_denied')
    def guard(self,p,module,action,condition='1',args=()):
        """An invalid guard UID aborts the entire SQLite/D1 batch on stale authorization/CAS."""
        at=now();uid=secrets.token_hex(16)
        clause="EXISTS(SELECT 1 FROM auth_sessions s JOIN auth_users u ON u.uid=s.user_uid JOIN auth_roles r ON r.uid=u.role_uid JOIN auth_permissions a ON a.role_uid=r.uid WHERE s.uid=? AND s.revoked_at IS NULL AND s.idle_expires_at>? AND s.expires_at>? AND u.status='active' AND u.updated_at=? AND r.is_active=1 AND r.updated_at=? AND a.module=? AND a.can_view=1 AND a.can_"+action+'=1) AND ('+condition+')'
        params=(p['session_uid'],at,at,p['user_stamp'],p['role_stamp'],module,*args,uid,module,uid,at,at)
        return uid,('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) SELECT CASE WHEN '+clause+" THEN ? ELSE '' END,?,?,?,?",params)
    async def logout(self,p):
        """Revoke only the current session."""
        if p:await self.sql.batch([("UPDATE auth_sessions SET revoked_at=?,revoke_reason='logout' WHERE uid=? AND revoked_at IS NULL",(now(),p['session_uid']))])
    async def password(self,p,current,new):
        """Verify the current password, replace its hash and revoke all sessions atomically."""
        rows=await self.sql.query('SELECT password_hash FROM auth_users WHERE uid=?',(p['uid'],))
        if not rows or not await self.passwords.verify(current,rows[0]['password_hash']):raise Error('原密码不正确')
        encoded=await self.passwords.hash(new);at=now(after=p['user_stamp'])
        gid=secrets.token_hex(16)
        guard=("INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) SELECT CASE WHEN EXISTS(SELECT 1 FROM auth_users u JOIN auth_sessions s ON s.user_uid=u.uid WHERE u.uid=? AND u.updated_at=? AND s.uid=? AND s.revoked_at IS NULL AND s.expires_at>?) THEN ? ELSE '' END,?,?,?,?",(p['uid'],p['user_stamp'],p['session_uid'],at,gid,'password',p['uid'],p['user_stamp'],at))
        await self.sql.batch([guard,('UPDATE auth_users SET password_hash=?,must_change_password=0,updated_at=? WHERE uid=?',(encoded,at,p['uid'])),("UPDATE auth_sessions SET revoked_at=?,revoke_reason='password_changed' WHERE user_uid=? AND revoked_at IS NULL",(at,p['uid'])),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
