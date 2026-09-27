"""账户页面的有界展示模型和表单辅助值转换；不创建账户表或另建授权机制。"""
import json
from .catalog import MODULES,Error

ACCOUNT_TABLES=('auth_users','auth_roles')
ACTIONS={'view':'允许进入','create':'新增','edit':'编辑','delete':'删除','export':'导出'}
SCOPES={'public':'公开','authenticated':'登录用户','staff':'内部成员','owner':'所有者范围','hidden':'隐藏'}
STATES={'active':('✓ 已启用','success'),'disabled':('○ 已禁用','warning'),'locked':('🔒 已锁定','error')}

def can_manage(p,table,action='edit'):
    """只有系统管理员且具备对应模块动作权限时，才呈现账户写入口。"""
    return bool(p and p.get('is_system') and p['permissions'].get(table,{}).get('can_'+action))

async def deletion_blocks(sql,p,table,rows):
    """Shared row protection hints; member checks include hidden and disabled accounts."""
    blocked={}
    if table=='auth_users':
        bootstrap={item['user_uid'] for item in await sql.query('SELECT user_uid FROM auth_bootstrap_state')}
        active=await sql.query("SELECT count(*) n,min(a.uid) uid FROM auth_users a JOIN auth_roles r ON r.uid=a.role_uid WHERE a.status='active' AND r.is_system=1 AND r.is_active=1")
        last=active[0]['uid'] if active[0]['n']==1 else None
        for row in rows:
            reason='不能删除当前登录账号' if row['uid']==p['uid'] else '初始化管理员账号受保护' if row['uid'] in bootstrap else '最后一个可用系统管理员受保护' if row['uid']==last else ''
            if reason:blocked[row['uid']]=reason
    else:
        ids=[row['uid'] for row in rows];used=set()
        for offset in range(0,len(ids),40):
            batch=ids[offset:offset+40]
            used.update(item['role_uid'] for item in await sql.query('SELECT DISTINCT role_uid FROM auth_users WHERE role_uid IN ('+','.join('?' for _ in batch)+')',tuple(batch)))
        for row in rows:
            reason='系统角色不能删除' if row['is_system'] else '注册默认角色不能删除' if row['uid']=='role-registered' else '仍有账号使用此角色，请先调整账号所属角色' if row['uid'] in used else ''
            if reason:blocked[row['uid']]=reason
    return blocked

async def deletion_plan(sql,p,table,row):
    """Preflight messages plus transactional predicates; never remove roles with members."""
    if not can_manage(p,table,'delete'):raise Error('账号与授权仅系统管理员可以更改',403,'access_denied')
    blocked=await deletion_blocks(sql,p,table,[row])
    if row['uid'] in blocked:raise Error(blocked[row['uid']],409)
    actor='EXISTS(SELECT 1 FROM auth_users a JOIN auth_roles r ON r.uid=a.role_uid WHERE a.uid=? AND r.is_system=1)'
    uid=row['uid'];args=(p['uid'],)
    if table=='auth_users':
        condition=actor+" AND ?<>? AND NOT EXISTS(SELECT 1 FROM auth_bootstrap_state WHERE user_uid=?) AND EXISTS(SELECT 1 FROM auth_users a JOIN auth_roles r ON r.uid=a.role_uid WHERE a.uid<>? AND a.status='active' AND r.is_system=1 AND r.is_active=1) AND EXISTS(SELECT 1 FROM auth_users WHERE uid=? AND role_uid=?)"
        return condition,(*args,uid,p['uid'],uid,uid,uid,row['role_uid']),[]
    condition=actor+" AND EXISTS(SELECT 1 FROM auth_roles WHERE uid=? AND is_system=0 AND uid<>'role-registered') AND NOT EXISTS(SELECT 1 FROM auth_users WHERE role_uid=?)"
    return condition,(*args,uid,uid),[('DELETE FROM auth_permissions WHERE role_uid=?',(uid,))]

def parse_helpers(table,data,password):
    """将中文界面复选框转回原生范围JSON/权限映射；辅助输入不进入数据库。"""
    confirm=data.pop('_password_confirm',None)
    if table=='auth_users' and (password or confirm):
        if not isinstance(password,str) or password!=confirm:raise Error('两次输入的密码不一致')
    permissions=None
    if table=='auth_roles' and data.pop('_scopes_present',None):
        scopes=[]
        for key in list(data):
            if not key.startswith('_scope_'):continue
            scope=key.removeprefix('_scope_');value=data.pop(key)
            if scope not in SCOPES or value not in ('1',1):raise Error('可见范围选项无效')
            scopes.append(scope)
        data['visibility_scopes']=json.dumps(scopes,ensure_ascii=False)
    if table=='auth_roles' and data.pop('_permissions_present',None):
        permissions={}
        for key in list(data):
            if not key.startswith('_permission_'):continue
            parts=key.removeprefix('_permission_').split(':');value=data.pop(key)
            if len(parts)!=2 or parts[0] not in MODULES or parts[1] not in ACTIONS or value not in ('1',1):raise Error('模块权限选项无效')
            permissions.setdefault(parts[0],[]).append(parts[1])
    return permissions

async def list_context(r,table,rows):
    """仅为当前页补齐角色名、授权概览和可查看的成员数，分批最多40个标识。"""
    if table not in ACCOUNT_TABLES:return {}
    result={'table':table,'roles':{},'members':{},'grants':{},'scopes':{},'states':STATES,'scope_labels':SCOPES,'tabs':[(t,MODULES[t]) for t in ACCOUNT_TABLES if r.p['permissions'].get(t,{}).get('can_view')]}
    if table=='auth_users':
        ids=list(dict.fromkeys(row['role_uid'] for row in rows))
        if r.p['permissions'].get('auth_roles',{}).get('can_view'):
            recent=await r.sql.query('SELECT uid,substr(name,1,200) name,is_active,is_system FROM auth_roles ORDER BY id DESC LIMIT 100')
            result['roles'].update({v['uid']:v for v in recent})
            for offset in range(0,len(ids),40):
                batch=ids[offset:offset+40]
                records=await r.sql.query('SELECT uid,substr(name,1,200) name,is_active,is_system FROM auth_roles WHERE uid IN ('+','.join('?' for _ in batch)+')',batch)
                result['roles'].update({v['uid']:v for v in records})
    else:
        ids=[row['uid'] for row in rows]
        for row in rows:
            result['scopes'][row['uid']]=[SCOPES.get(value,value) for value in json.loads(row['visibility_scopes'])]
        for offset in range(0,len(ids),40):
            batch=ids[offset:offset+40];marks=','.join('?' for _ in batch)
            grants=await r.sql.query('SELECT role_uid,count(CASE WHEN can_view+can_create+can_edit+can_delete+can_export>0 THEN 1 END) modules,coalesce(sum(can_view+can_create+can_edit+can_delete+can_export),0) actions FROM auth_permissions WHERE role_uid IN ('+marks+') GROUP BY role_uid',batch)
            result['grants'].update({v['role_uid']:v for v in grants})
            if r.p['permissions'].get('auth_users',{}).get('can_view'):
                where,args=r.content.scope('auth_users',r.p)
                counts=await r.sql.query('SELECT role_uid,count(*) total FROM auth_users WHERE role_uid IN ('+marks+') AND '+where+' GROUP BY role_uid',(*batch,*args))
                result['members'].update({v['role_uid']:v['total'] for v in counts})
    if can_manage(r.p,table,'delete'):
        result['delete_blocks']=await deletion_blocks(r.sql,r.p,table,rows)
        result['delete_notice']='删除账号（包括所选的其他管理员）会清除其主站登录会话，审计历史保留；此操作不可撤销。确认删除？' if table=='auth_users' else '删除角色会同时清除其权限配置；仍有账号使用的角色不能删除。此操作不可撤销。确认删除？'
    return result

def scope_choices(value):
    """从原生JSON读取已选范围，仅用于控件回显，不改写字段。"""
    return json.loads(value) if isinstance(value,str) else (value or [])
