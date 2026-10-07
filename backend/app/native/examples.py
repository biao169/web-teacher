"""Explicit, bounded example insertion using existing authorization, editors, media and translation paths."""
import hashlib,json,secrets
from .catalog import Error,now,MODULES
from .example_catalog import VERSION,GROUPS,identity,values,permission_preset,translation_source,initial_translation,translation_original
from .service_jobs import network_lease

DEPENDENCIES={**{t:['media_assets'] for t in ('profiles','students','publications','patents','courses')},'news':['media_assets','publications','projects','students'],'site_settings':['media_assets','profiles'],'auth_users':['auth_roles'],'translation_cache':['profiles','research_interests','projects','students']}
SCENARIOS=[('global_settings','服务设置','五种翻译服务与论文检索配置已由原生默认项展示；保持当前生效值。','/admin/global_settings'),('auth_users','登录会话','真实登录后，从账号编辑页查看及撤销会话；不生成虚构的登录历史。','/admin/auth_users'),('operation_logs','操作日志','添加示例、编辑、上传与回收均生成真实操作记录，可按模块筛选。','/admin/operation_logs'),('data_tools','备份与恢复','添加后选择示例业务表导出；恢复仍需原有预检和明确提交。','/admin/data_tools'),('transfer','文件快传','进入快传管理，在“示例任务”中分别生成可下载、暂停、撤销及缓存场景；遵守已有设置和额度。','/transfer/login')]

class Examples:
    def __init__(self,r):
        """Retain the request-scoped native services and configured object stores."""
        self.r=r

    def authorize(self,group=None):
        """Examples are a system-admin operation and still require every affected module grant."""
        r=self.r;r.auth.require(r.p,'data_tools','create');r.auth.require(r.p,'data_tools','edit')
        if not r.p['is_system'] or not {'public','staff','hidden'}<=set(r.p['scopes']):raise Error('完整示例仅限具备公开、内部和隐藏范围的系统管理员',403)
        required=[group] if group else []
        for table in required:
            for action in ('view','edit') if table=='messages' else ('view','create','edit'):r.auth.require(r.p,table,action)
        for table in DEPENDENCIES.get(group,[]):r.auth.require(r.p,table)

    def guard(self,group,lease):
        """Recheck data-tool/module grants and the shared example lease inside each mutation."""
        clauses=["EXISTS(SELECT 1 FROM admin_mutation_guards WHERE uid=? AND target_uid=? AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-180 seconds'))"];args=tuple(lease)
        for table in ('data_tools',group):
            clauses.append('EXISTS(SELECT 1 FROM auth_permissions WHERE role_uid=? AND module=? AND can_view=1 AND can_edit=1'+(' AND can_create=1' if table!='messages' else '')+')');args+=(self.r.p['role_uid'],table)
        for table in DEPENDENCIES.get(group,[]):
            clauses.append('EXISTS(SELECT 1 FROM auth_permissions WHERE role_uid=? AND module=? AND can_view=1)');args+=(self.r.p['role_uid'],table)
        return ' AND '.join(clauses),args

    async def present(self,group,i):
        """Stable IDs, or any existing source-linked translation, preserve edits and partial work."""
        if group=='translation_cache':
            table,n,field=translation_source(i);ref=f'{table}:{identity(table,n)}:{field}'
            return await self.r.sql.query('SELECT uid FROM translation_cache WHERE source_ref_key=? LIMIT 1',(ref,))
        return await self.r.sql.query(f'SELECT uid FROM "{group}" WHERE uid=?',(identity(group,i),))

    async def status(self):
        """Read coverage only; GET never seeds, repairs or changes configuration."""
        r=self.r;r.auth.require(r.p,'data_tools');groups=[]
        for group,title,count in GROUPS:
            try:self.authorize(group);allowed=True;reason=''
            except Error as error:allowed=False;reason=error.message
            existing=None
            if allowed:
                if group=='translation_cache':
                    refs=[f'{t}:{identity(t,n)}:{f}' for t,n,f in [translation_source(i) for i in range(1,count+1)]]
                    existing=(await r.sql.query('SELECT count(DISTINCT source_ref_key) n FROM translation_cache WHERE source_ref_key IN ('+','.join('?' for _ in refs)+')',refs))[0]['n']
                else:
                    ids=[identity(group,i) for i in range(1,count+1)]
                    existing=(await r.sql.query(f'SELECT count(*) n FROM "{group}" WHERE uid IN ('+','.join('?' for _ in ids)+')',ids))[0]['n']
            groups.append({'id':group,'title':title,'total':count,'existing':existing,'allowed':allowed,'reason':reason,'dependencies':[MODULES[t] for t in DEPENDENCIES.get(group,[])],'href':'/admin/'+group})
        return {'version':VERSION,'groups':groups,'scenarios':[{'title':title,'text':text,'href':href} for table,title,text,href in SCENARIOS if r.p['permissions'].get(table,{}).get('can_view')]}

    async def assets(self,group):
        """Reference actual registry objects; a modified/trash/missing example is never repaired silently."""
        from .media_inventory_store import inventory
        needed=[1,2,3] if group in ('profiles','students') else [3,4] if group=='news' else [1,3] if group=='site_settings' else [4] if group in ('publications','patents','courses') else []
        result={}
        for i in needed:
            uid=identity('media_assets',i);rows=await self.r.sql.query("SELECT uid,object_key,status,storage_kind,size FROM media_assets WHERE uid=?",(uid,))
            if not rows or rows[0]['status']!='active':raise Error('请先添加媒体与附件；已回收或移除的媒体请自行核对，不会自动恢复。',409)
            obj=await inventory(self.r.media_store).head(rows[0]['object_key']) if rows[0]['storage_kind']==self.r.kind else None
            if not obj or obj['size']!=rows[0]['size']:raise Error('示例媒体文件缺失或大小已变化，请先到媒体库核对。',409)
            result[i]=rows[0]
        return result

    async def step(self,group,index):
        """Create one deterministic item; retrying a lost response sees the existing row instead."""
        spec=next((x for x in GROUPS if x[0]==group),None)
        if not spec or type(index) is not int or not 1<=index<=spec[2]:raise Error('示例项无效')
        self.authorize(group);r=self.r
        async with network_lease(r,'examples','data_tools','create') as lease:
            condition=self.guard(group,lease)
            if await self.present(group,index):return {'status':'kept','message':'已有记录已保留。'}
            uid=identity(group,index)
            if group=='media_assets':
                from .example_assets import PDF,portrait
                from .media import Media
                raw=PDF if index==4 else portrait(index)
                class Upload:
                    async def stream(self):yield raw
                name=f'示例附件-{index}.pdf' if index==4 else f'示例头像-{index}.png'
                uid=await Media(r.sql,r.auth,r.content,r.media_store,r.kind).upload(r.p,name,Upload(),metadata={'title':name,'category':'演示资料 native-2'},new_uid=uid,creation_guard=condition)
                if index==6:
                    row=await r.content.get('media_assets',uid,r.p)
                    await Media(r.sql,r.auth,r.content,r.media_store,r.kind).status(r.p,uid,row['updated_at'],'trash')
            elif group=='translation_cache':
                from .assistance import Assistance
                table,n,field=translation_source(index);source=await r.content.get(table,identity(table,n),r.p)
                if source.get(field)!=translation_original(index):raise Error('示例原文已被修改，不会填入预置译文。',409)
                if source.get('visibility')!='public':raise Error('示例来源已撤下，保留原状态。',409)
                uid=await Assistance(r).queue(table,source['uid'],field,condition,initial_translation(index))
            elif group=='messages':
                from .public_actions import contact
                gid,guard=r.auth.guard(r.p,'data_tools','create',*condition)
                uid=await contact(r,{'name':'演示访客（虚构）','email':f'example-{index}@example.invalid','subject':['示例招生咨询','示例课程咨询','示例合作咨询'][index-1],'content':'【演示留言】这是管理员明确添加的虚构内容，用于查看原文、筛选及状态处理；未发送邮件。'},'examples:'+r.p['uid'],uid,[guard],[r.content.audit(r.p,'messages','example-contact',uid),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
                if index>1:
                    row=await r.content.get('messages',uid,r.p);await r.content.save('messages',r.p,{'status':'read' if index==2 else 'archived'},uid,row['updated_at'])
            else:
                media=await self.assets(group);row=values(group,index,media)
                uid=await r.content.save(group,r.p,row,new_uid=uid,creation_guard=condition,permissions=permission_preset(index) if group=='auth_roles' else None,password=secrets.token_urlsafe(32) if group=='auth_users' else None)
            # Dataset identity is not a job or a claim that every group has already been added.
            gid,guard=r.auth.guard(r.p,'data_tools','create',*condition)
            await r.sql.batch([guard,('INSERT INTO demo_seed_state(id,dataset_version,seeded_at,seed_digest) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET dataset_version=excluded.dataset_version,seeded_at=excluded.seeded_at,seed_digest=excluded.seed_digest WHERE demo_seed_state.dataset_version IN (?,?)',(VERSION,now(),hashlib.sha256(json.dumps(GROUPS).encode()).hexdigest(),'native-1',VERSION)),r.content.audit(r.p,'data_tools','example-add',uid),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
            return {'status':'created','uid':uid,'message':'示例已添加。'}
