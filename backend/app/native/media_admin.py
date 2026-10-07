"""媒体核对与字段预览的薄HTTP入口；复用会话、CSRF和管理布局。"""
from urllib.parse import urlencode
from fastapi import Request
from .catalog import Error
from .media_audit import MediaAudit,CATEGORIES
from .media_locks import purge_key
from .media_picker import MediaPicker

def install(app,resources,csrf,render):
    """挂载后台媒体能力，不为访客开放目录或原始文件系统地址。"""
    @app.post('/api/admin/media-picker/links/resolve')
    async def resolve_link(request:Request):
        """Read-only URL validation; registration requires an explicit confirmation or content save."""
        from .web import payload
        from .media_links import MediaLinks
        r=await resources(request);data=await payload(request,8192);csrf(request,r,data)
        picker=MediaPicker(r);rule=await picker.context(data);links=MediaLinks(r)
        row=await links.resolve(data.get('url',''),rule['types'],data.get('mime_type',''),create=False)
        if not row:raise Error('请填写媒体链接')
        if rule['fixed_key'] and rule['fixed_key']!=row['object_key']:raise Error('媒体不符合导航固定范围',403)
        return picker.dto(row)|{'registered':not bool(links.pending)}
    @app.post('/api/admin/media-picker/links/register')
    async def register_link(request:Request):
        """Explicit chooser registration shares context, native guards and existing-media selection."""
        from .web import payload
        from .media_links import MediaLinks
        r=await resources(request);data=await payload(request,8192);csrf(request,r,data)
        picker=MediaPicker(r);rule=await picker.context(data);links=MediaLinks(r)
        row=await links.resolve(data.get('url',''),rule['types'],data.get('mime_type',''))
        if not row:raise Error('请填写媒体链接')
        if rule['fixed_key'] and rule['fixed_key']!=row['object_key']:raise Error('媒体不符合导航固定范围',403)
        await r.sql.batch(links.statements())
        return await picker.select(data|{'media_uid':row['uid'],'stamp':row['updated_at']})
    @app.get('/api/admin/media-picker/items/list')
    async def picker_list(request:Request):
        """当前内容上下文的私有媒体搜索，不预加载全部媒体。"""
        return await MediaPicker(await resources(request)).listing(dict(request.query_params))
    @app.post('/api/admin/media-picker/items/select')
    async def picker_select(request:Request):
        """确认选择只返回合适且存在的媒体，内容引用由统一保存建立。"""
        from .web import payload
        r=await resources(request);data=await payload(request,4096);csrf(request,r,data)
        try:return await MediaPicker(r).select(data)
        except OSError:raise Error('媒体暂不可读取，请检查存储后重试',503) from None
    @app.post('/api/admin/media-picker/upload/file')
    async def picker_upload(request:Request):
        """原始字节流复用统一上传、配额、签名和登记事务。"""
        from urllib.parse import unquote
        r=await resources(request);csrf(request,r,{})
        try:return await MediaPicker(r).upload(dict(request.query_params),unquote(request.headers.get('x-filename','')),request)
        except OSError:raise Error('上传存储未完成，请核对媒体库后重试',503) from None
    @app.post('/api/admin/media-picker/crop/file')
    async def crop_upload(request:Request):
        """上传浏览器生成的裁剪副本，检查来源版本、字段权限、输出尺寸及共享配额。"""
        from urllib.parse import unquote
        r=await resources(request);csrf(request,r,{})
        try:return await MediaPicker(r).crop_upload(dict(request.query_params),unquote(request.headers.get('x-filename','')),request)
        except OSError:raise Error('裁剪上传未完成，请核对媒体库后重试',503) from None
    @app.get('/api/admin/media/lookup/by-key')
    @app.post('/api/admin/media/lookup/by-key')
    async def lookup(request:Request):
        """将原生媒体键转换为受权限保护的预览信息，预览不创建引用。"""
        r=await resources(request);r.auth.require(r.p,'media_assets')
        if request.method=='POST':
            from .web import payload
            data=await payload(request,8192);csrf(request,r,data);key=data.get('key','')
        else:key=request.query_params.get('key','')
        if not isinstance(key,str) or not key or len(key)>4096:raise Error('媒体标识无效')
        rows=await r.sql.query('SELECT uid,object_key,title,mime_type,status,storage_kind,updated_at,size FROM media_assets WHERE object_key=? LIMIT 1',(key,))
        if not rows:raise Error('关联媒体未登记',404)
        if rows[0]['storage_kind']=='external':
            from .media_links import external_url
            external_url(rows[0]['object_key'])
        return rows[0]
    @app.get('/admin/media/audit')
    async def audit_page(request:Request):
        """按需读取一个报告页和20条到期候选，沿用后台分区与分页组件。"""
        r=await resources(request);a=MediaAudit(r);latest=await a.latest();state=None;listing=None;error=''
        from .media_audit_list import COLUMNS,LABELS,KINDS,specifications
        category=request.query_params.get('category','');query=dict(request.query_params)
        if latest:
            try:state,listing=await a.page(latest['id'],query=query);query=listing['query']
            except Error as exc:error=exc.message
        permissions=r.p['permissions']['media_assets'];candidates=await a.purge_candidates() if permissions['can_delete'] else []
        for row in candidates:row['pending']=bool(await r.sql.query('SELECT 1 FROM admin_mutation_guards WHERE uid=?',(purge_key(row['uid']),)))
        retention=(await r.sql.query('SELECT media_trash_retention_days FROM global_settings ORDER BY id LIMIT 1'))[0]['media_trash_retention_days']
        return await render(r,'admin/native-media-audit.html','media_assets','媒体目录核对',report=(latest or {}).get('id',''),state=state,listing=listing,error=error,categories=CATEGORIES,category=category,candidates=candidates,retention=retention,permissions=permissions,query=query,columns=COLUMNS,column_labels=LABELS,column_specs=specifications(CATEGORIES),kinds=KINDS,
            category_url=lambda value:'/admin/media/audit?'+urlencode(query|{'f.category':value,'page':1})+'#audit-report',
            page_url=lambda p:'/admin/media/audit?'+urlencode(query|{'page':p})+'#audit-report')
    @app.api_route('/api/admin/media-audit/{report}/{page}/{index}/content',methods=['GET','HEAD'])
    async def audit_content(request:Request,report:str,page:int,index:int):
        """预览仅引用已授权报告条目；浏览器不能传入任意磁盘路径，不自动收录。"""
        from pathlib import PurePosixPath
        from .media_response import media_response,media_file_response
        r=await resources(request);entry=await MediaAudit(r).entry(report,page,index)
        if entry.get('storage_kind',r.kind)!=r.kind or entry['category']=='external':raise Error('此条目不属于当前媒体目录',404)
        # 文件可能在扫描之后已经收录，继续复用现有媒体权限入口。
        rows=await r.sql.query('SELECT uid FROM media_assets WHERE object_key=? LIMIT 1',(entry['key'],))
        if rows:return await media_response(request,r,rows[0]['uid'],private=True)
        if entry['uid']:raise Error('媒体登记已变化，请重新核对',409)
        name=PurePosixPath(entry['key']).name
        row={'uid':'','object_key':entry['key'],'storage_kind':r.kind,'original_filename':name,'title':name}
        return await media_file_response(request,r,row)
    @app.post('/api/admin/media-audit/actions/run')
    async def audit_action(request:Request):
        """扫描及报告也是私有操作；所有状态变化仅由显式POST调用。"""
        from .web import payload
        r=await resources(request);data=await payload(request,8192);csrf(request,r,data);a=MediaAudit(r)
        action=data.get('action');report=data.get('report','')
        try:
            if action=='start':return await a.start()
            if action=='step':return await a.step(report,data.get('version'))
            if action=='clear':return await a.clear(report)
            if action=='recheck':return await a.recheck(report,data.get('page'),data.get('index'))
            if action=='prepare_import':return await a.prepare_import(report,data.get('page'),data.get('index'))
            if action=='commit_import':return await a.commit_import(report,data.get('token'))
            if action=='prepare_purge':return await a.prepare_purge(report,data.get('uid',''),data.get('stamp'))
            if action=='commit_purge':return await a.commit_purge(report,data.get('token'))
            raise Error('不支持的媒体操作')
        except OSError:raise Error('存储读写未完成；请检查配置目录的空间和访问权限后重试',503) from None
