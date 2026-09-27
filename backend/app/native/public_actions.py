"""Public registration/contact writes use native accounts, messages and bounded action throttles."""
import re,secrets
from .auth import sha
from .catalog import Error,now

async def throttle(sql,action,network,identity):
    """Count attempts before work; retain no raw client address or submitted secret."""
    at=now();expiry=now(seconds=3600)
    for scope,text,limit in [('network',network,30),('identity',identity,8)]:
        key=sha(action+':'+scope+':'+text.casefold())
        rows=await sql.batch([('INSERT INTO public_action_throttles(key_hash,action,scope,attempts,window_started_at,updated_at,expires_at) VALUES (?,?,?,1,?,?,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN expires_at<=excluded.updated_at THEN 1 ELSE attempts+1 END,window_started_at=CASE WHEN expires_at<=excluded.updated_at THEN excluded.window_started_at ELSE window_started_at END,expires_at=CASE WHEN expires_at<=excluded.updated_at THEN excluded.expires_at ELSE expires_at END,updated_at=excluded.updated_at RETURNING attempts',(key,action,scope,at,at,expiry))])
        if rows[0][0]['attempts']>limit:raise Error('提交过于频繁，请稍后重试',429)

async def register(r,data,network):
    """Create an ordinary registered role account only while registration is enabled."""
    name=data.get('username','').strip();password=data.get('password','');email=data.get('email','').strip()
    if not re.fullmatch(r'[A-Za-z0-9_.-]{3,64}',name):raise Error('账号需3—64位字母、数字、点、下划线或短横线')
    if email and (len(email)>254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email)):raise Error('邮箱格式无效')
    if not await r.sql.query('SELECT 1 FROM global_settings WHERE allow_public_registration=1 LIMIT 1'):raise Error('网站尚未开放注册',403)
    await throttle(r.sql,'registration',network,name);encoded=await r.passwords.hash(password);uid=secrets.token_hex(16)
    rows=await r.sql.batch([("INSERT INTO auth_users(uid,username,password_hash,display_name,email,role_uid,status) SELECT ?,?,?,?,?,'role-registered','active' WHERE EXISTS(SELECT 1 FROM global_settings WHERE allow_public_registration=1) AND EXISTS(SELECT 1 FROM auth_roles WHERE uid='role-registered' AND is_active=1) RETURNING uid",(uid,name,encoded,name,email or None))])
    if not rows[0]:raise Error('当前无法注册',403)
    return uid

async def contact(r,data,network,new_uid=None,before=(),after=()):
    """Store visitor messages privately; moderation fields cannot be supplied by visitors."""
    content=data.get('content','').strip();email=data.get('email','').strip();name=data.get('name','').strip();subject=data.get('subject','').strip()
    if not 1<=len(content)<=5000 or len(name)>150 or len(subject)>300:raise Error('请填写留言，正文最多5000字')
    if email and (len(email)>254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email)):raise Error('邮箱格式无效')
    if not r.p and not await r.sql.query('SELECT 1 FROM global_settings WHERE allow_anonymous_messages=1 LIMIT 1'):raise Error('请登录后留言',403)
    if new_uid is not None and (not isinstance(new_uid,str) or not re.fullmatch('[a-f0-9]{32}',new_uid)):raise Error('新增标识无效')
    await throttle(r.sql,'contact',network,email or network);uid=new_uid or secrets.token_hex(16)
    rows=await r.sql.batch([*before,("INSERT INTO messages(uid,name,email,message_type,subject,content,status,visibility) SELECT ?,?,?,'contact',?,?,'new','hidden' WHERE ?=1 OR EXISTS(SELECT 1 FROM global_settings WHERE allow_anonymous_messages=1) RETURNING uid",(uid,name or None,email or None,subject or None,content,int(bool(r.p)))),*after])
    if not rows[len(before)]:raise Error('当前无法匿名留言',403)
    return uid
