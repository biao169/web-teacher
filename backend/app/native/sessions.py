"""原生账号会话的有界展示和原子撤销；复用账号权限，不另建身份或设备模型。"""
from .catalog import Error,now
from .accounts import can_manage
from .navigation import in_scope,navigation_guard,page_numbers

STATES={'active':'✓ 活动','expired':'◷ 已过期','revoked':'⊘ 已撤销'}
REASONS={'logout':'主动退出','expired':'已过期','rotated':'令牌已轮换','user_disabled':'账号已停用',
         'role_disabled':'角色已停用','password_changed':'密码已更改','admin_revoked':'管理员撤销','security_policy':'账号或权限已更改'}
# Never select token_hash or user_agent_hash for the presentation/API model.
COLUMNS='uid,created_at,updated_at,last_seen_at,idle_expires_at,expires_at,revoked_at,revoke_reason'
ACTIVE='revoked_at IS NULL AND idle_expires_at>? AND expires_at>?'

class Sessions:
    """只管理主站 auth_sessions；独立快传的令牌和任务保留自身生命周期。"""
    def __init__(self,r):
        """接收同一请求内的认证、内容服务与 SQLite/D1 适配器。"""
        self.r=r

    async def account(self,uid,base=None):
        """按既有系统管理员、账号查看/编辑权限及可见范围核对目标账号。"""
        r=self.r;r.auth.require(r.p,'auth_users')
        if not can_manage(r.p,'auth_users'):raise Error('只有有账号编辑权限的系统管理员可以管理会话',403)
        row=await r.content.get('auth_users',uid,r.p)
        if not in_scope('auth_users',row,base):raise Error('账号不在固定筛选范围内',403)
        return row

    async def listing(self,uid,query=None,base=None):
        """分页展示非敏感会话字段，过期状态由两个期限计算，不以读操作修改历史。"""
        account=await self.account(uid,base);query=query or {};at=now()
        state=query.get('state','active');q=str(query.get('q','')).strip()
        sort=query.get('sort','created_at');direction=query.get('direction','desc')
        if state not in ('all',*STATES) or sort not in ('created_at','last_seen_at','expires_at') or direction not in ('asc','desc') or len(q)>128:raise Error('会话筛选条件无效')
        try:page=max(1,int(query.get('page',1)));size=int(query.get('size',10))
        except (ValueError,TypeError):raise Error('会话页码无效') from None
        if size not in (10,20,50,100):raise Error('每页支持10、20、50、100条')
        states="CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN idle_expires_at<=? OR expires_at<=? THEN 'expired' ELSE 'active' END"
        counts={key:0 for key in STATES}
        for row in await self.r.sql.query('SELECT '+states+' state,count(*) n FROM auth_sessions WHERE user_uid=? GROUP BY state',(at,at,uid)):counts[row['state']]=row['n']
        where='user_uid=?';args=[uid]
        if state!='all':where+=' AND ('+states+')=?';args.extend((at,at,state))
        if q:
            where+=" AND uid LIKE ? ESCAPE '\\'";args.append('%'+q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%')
        total=(await self.r.sql.query('SELECT count(*) n FROM auth_sessions WHERE '+where,args))[0]['n']
        pages=max(1,(total+size-1)//size);page=min(page,pages)
        rows=await self.r.sql.query('SELECT '+COLUMNS+' FROM auth_sessions WHERE '+where+' ORDER BY '+sort+' '+direction.upper()+',id DESC LIMIT ? OFFSET ?',(*args,size,(page-1)*size))
        for row in rows:
            row['state']='revoked' if row['revoked_at'] else ('expired' if min(row['idle_expires_at'],row['expires_at'])<=at else 'active')
            row['current']=row['uid']==self.r.p['session_uid']
            row['reason']=REASONS.get(row['revoke_reason'],'')
            row['effective_expires_at']=min(row['idle_expires_at'],row['expires_at'])
        return {'rows':rows,'page':page,'pages':pages,'size':size,'total':total,'counts':counts,'states':STATES,
                'query':{'state':state,'q':q,'sort':sort,'direction':direction},'account_stamp':account['updated_at'],
                'uid':uid,'self':uid==self.r.p['uid'],'page_numbers':page_numbers(page,pages)}

    async def revoke(self,uid,stamp,mode,selected=None,base=None,navigation=None):
        """以账号版本及事务授权撤销会话；所选最多100条，全部模式在SQL内执行且不载入历史。"""
        r=self.r;account=await self.account(uid,base)
        if not isinstance(stamp,str) or stamp!=account['updated_at']:raise Error('账号信息已变化，请刷新会话区后重新确认',409)
        if mode not in ('selected','others'):raise Error('会话操作无效')
        ids=selected if selected is not None else []
        if not isinstance(ids,list) or any(not isinstance(v,str) or not 1<=len(v)<=128 for v in ids) or len(set(ids))!=len(ids) or len(ids)>100:raise Error('所选会话无效；单次最多100条')
        if mode=='selected' and not ids:raise Error('请先选择活动会话')
        if mode=='others' and ids:raise Error('全部其他会话操作不接受所选标识')
        if r.p['session_uid'] in ids:raise Error('当前浏览器会话受保护；如需退出请使用退出登录',422)
        at=now();scope,scope_args=r.content.scope('auth_users',r.p)
        nav,nav_args=navigation_guard(navigation)
        condition="EXISTS(SELECT 1 FROM auth_users WHERE uid=? AND updated_at=? AND "+scope+") AND EXISTS(SELECT 1 FROM auth_roles ar JOIN auth_permissions ap ON ap.role_uid=ar.uid WHERE ar.uid=? AND ar.is_system=1 AND ap.module='auth_users' AND ap.can_view=1) AND "+nav
        params=(uid,stamp,*scope_args,r.p['role_uid'],*nav_args)
        gid,guard=r.auth.guard(r.p,'auth_users','edit',condition,params);statements=[guard];guards=[gid]
        if mode=='selected':
            # Browser activity updates updated_at. Read fresh stamps on this explicit action,
            # then CAS each snapshot inside the transaction instead of trusting stale UI heartbeats.
            for start in range(0,len(ids),30):
                batch=ids[start:start+30];marks=','.join('?' for _ in batch)
                rows=await r.sql.query('SELECT uid,updated_at FROM auth_sessions WHERE user_uid=? AND '+ACTIVE+' AND uid IN ('+marks+')',(uid,at,at,*batch))
                if len(rows)!=len(batch):raise Error('所选会话已失效或不属于该账号，请刷新会话区',409)
                predicates=[];values=[]
                for row in rows:predicates.append('(uid=? AND updated_at=?)');values.extend((row['uid'],row['updated_at']))
                check='(SELECT count(*) FROM auth_sessions WHERE user_uid=? AND '+ACTIVE+' AND ('+' OR '.join(predicates)+'))=?'
                key,statement=r.auth.guard(r.p,'auth_users','edit',check,(uid,at,at,*values,len(batch)))
                guards.append(key);statements.append(statement)
        # All mode means active sessions at execution time, irrespective of list filters/pages.
        # Protect this browser in both modes; bulk work and its count stay in the database.
        where='user_uid=? AND uid<>? AND '+ACTIVE;args=(uid,r.p['session_uid'],at,at)
        if mode=='selected':
            # Split updates to stay below D1's 100 bound parameters per statement.
            batches=[ids[i:i+30] for i in range(0,len(ids),30)]
        else:batches=[None]
        count_indexes=[]
        for batch in batches:
            suffix=' AND uid IN ('+','.join('?' for _ in batch)+')' if batch else ''
            # Count the exact target set inside the same transaction. This also avoids
            # depending on connection-local changes() state across a D1 batch boundary.
            count_indexes.append(len(statements));statements.append(('SELECT count(*) affected FROM auth_sessions WHERE '+where+suffix,(*args,*(batch or []))))
            statements.append(("UPDATE auth_sessions SET revoked_at=max(?,created_at),revoke_reason='admin_revoked',updated_at=max(?,updated_at) WHERE "+where+suffix,(at,at,*args,*(batch or []))))
        audit_sql,audit_args=r.content.audit(r.p,'auth_users','sessions_revoke_'+mode,uid)
        audit_args=(*audit_args[:6],('撤销所选会话：'+str(len(ids))+' 条' if mode=='selected' else '撤销执行时的全部其他活动会话；保留当前浏览器'),audit_args[7])
        statements.append((audit_sql,audit_args))
        statements.append(('DELETE FROM admin_mutation_guards WHERE uid IN ('+','.join('?' for _ in guards)+')',tuple(guards)))
        result=await r.sql.batch(statements)
        return {'affected':sum(result[i][0]['affected'] for i in count_indexes)}
