"""统一媒体选择：有限列表、目标权限、固定范围、状态/版本及对象存在性复核。"""
import json
from .catalog import Error,fields
from .navigation import in_scope
from .media_policy import types_for,EXTENSIONS,IMAGE_TYPES,VIDEO_TYPES,ALL_TYPES
from .media_inventory_store import inventory

class MediaPicker:
    def __init__(self,r):
        """复用每个请求的身份、SQL和媒体存储，不维护额外数据库。"""
        self.r=r
    async def context(self,data):
        """媒体查看权限与目标内容编辑/创建权限同时成立，导航范围不能被绕过。"""
        r=self.r;r.auth.require(r.p,'media_assets')
        module=data.get('module','');field=data.get('field','');uid=data.get('uid') or '';nav=data.get('nav') or ''
        if any(not isinstance(v,str) or len(v)>128 for v in (module,field,uid,nav)):raise Error('媒体选择上下文无效')
        kinds=types_for(module,field);r.auth.require(r.p,module,'edit' if uid else 'create')
        row=await r.content.get(module,uid,r.p) if uid else {};base={}
        if nav:
            entry,target,base=await r.content.navigation(nav,r.p)
            if target!=module or entry['updated_at']!=data.get('nav_stamp'):raise Error('导航范围已变化，请保存草稿并刷新',409)
            if uid and not in_scope(module,row,base):raise Error('条目不在此导航范围内',403)
        return {'module':module,'field':field,'types':kinds,'fixed_key':base.get(field),'required':bool(fields(module).get(field,{}).get('required'))}
    def dto(self,row):
        """仅返回选择及显示所需字段；不暴露校验和、存储配置和后台内部数据。"""
        return {k:row.get(k) for k in ('uid','object_key','title','category','mime_type','size','updated_at','storage_kind','original_filename')}
    async def options(self,rule):
        """传递有效类型/上传限额，分类建议最多100项，不把全库名称写入页面。"""
        r=self.r;settings=(await r.sql.query('SELECT upload_max_size_mb,upload_allowed_extensions FROM global_settings ORDER BY id LIMIT 1'))[0]
        from .media_links import MIME_LABELS
        allowed=json.loads(settings['upload_allowed_extensions']);extensions=[ext for mime in rule['types'] for ext in EXTENSIONS[mime] if ext in allowed]
        where="status='active' AND storage_kind IN (?,'external') AND mime_type IN ("+','.join('?' for _ in rule['types'])+')';args=(r.kind,*rule['types'])
        if rule['fixed_key']:where+=' AND object_key=?';args+=(rule['fixed_key'],)
        categories=await r.sql.query('SELECT DISTINCT category FROM media_assets WHERE '+where+" AND category IS NOT NULL AND category<>'' ORDER BY category LIMIT 100",args)
        return {'categories':[v['category'] for v in categories],'type_labels':{mime:MIME_LABELS[mime] for mime in rule['types']},'types':rule['types'],'extensions':extensions,'max_bytes':min(20,settings['upload_max_size_mb'])*1024*1024,'can_upload':bool(r.p['permissions']['media_assets'].get('can_create') and extensions and not rule['fixed_key']),'can_link':bool(r.p['permissions']['media_assets'].get('can_create') and not rule['fixed_key']),'can_clear':not rule['required'] and not rule['fixed_key']}
    async def listing(self,data):
        """参数绑定搜索标题/对象键/分类，分页仅取10或20条活跃且类型适用的记录。"""
        r=self.r;rule=await self.context(data);q=data.get('q','');category=data.get('category','');kind=data.get('kind','')
        if not isinstance(q,str) or len(q)>120 or not isinstance(category,str) or len(category)>200:raise Error('搜索或分类过长')
        filters={'':ALL_TYPES,'image':IMAGE_TYPES,'pdf':('application/pdf',),'video':VIDEO_TYPES,'archive':('application/zip',)}
        if kind not in filters:raise Error('媒体类型筛选无效')
        types=tuple(t for t in rule['types'] if t in filters[kind])
        try:page=int(data.get('page',1));size=int(data.get('size',10))
        except (TypeError,ValueError):raise Error('页码无效') from None
        if not 1<=page<=1000000 or size not in (10,20):raise Error('页码或每页数量无效')
        where="status='active' AND storage_kind IN (?,'external') AND mime_type IN ("+','.join('?' for _ in types)+')';args=(r.kind,*types)
        if q:where+=" AND instr(lower(coalesce(title,'')||' '||coalesce(original_filename,'')||' '||object_key||' '||coalesce(category,'')),lower(?))>0";args+=(q.strip(),)
        if category:where+=' AND category=?';args+=(category,)
        if rule['fixed_key']:where+=' AND object_key=?';args+=(rule['fixed_key'],)
        total=(await r.sql.query('SELECT count(*) n FROM media_assets WHERE '+where,args))[0]['n'];pages=max(1,(total+size-1)//size);page=min(page,pages)
        rows=await r.sql.query('SELECT uid,object_key,title,category,mime_type,size,updated_at,storage_kind,original_filename FROM media_assets WHERE '+where+' ORDER BY id DESC LIMIT ? OFFSET ?',(*args,size,(page-1)*size))
        return {'rows':rows,'total':total,'pages':pages,'page':page,'size':size,'options':await self.options(rule)}
    async def select(self,data):
        """确认前重查记录版本、目标类型和实际文件存在性；不保存内容引用。"""
        rule=await self.context(data);r=self.r
        if not isinstance(data.get('media_uid'),str) or len(data['media_uid'])>128:raise Error('媒体标识无效')
        row=await r.media.inspect(r.p,data['media_uid'])
        if row['status']!='active' or row['storage_kind'] not in (r.kind,'external'):raise Error('媒体已回收或不属于当前存储',409)
        if row['updated_at']!=data.get('stamp'):raise Error('媒体信息已变化，请重新选择',409)
        if row['mime_type'] not in rule['types']:raise Error('媒体类型不适用于此字段')
        if rule['fixed_key'] and rule['fixed_key']!=row['object_key']:raise Error('媒体不符合导航固定范围',403)
        if row['storage_kind']=='external':
            from .media_links import external_url
            external_url(row['object_key']);return self.dto(row)
        info=await inventory(r.media_store).head(row['object_key'])
        if not info:raise Error('媒体文件已缺失，请重新选择',409)
        if info['size']!=row['size']:raise Error('媒体文件大小已变化，请先核对目录',409)
        return self.dto(row)
    async def upload(self,data,filename,request):
        """新上传沿用唯一上传服务；目标用途和元数据在写文件前完成检查。"""
        rule=await self.context(data);r=self.r
        if rule['fixed_key']:raise Error('此导航固定了媒体，不能上传替换',403)
        metadata={k:data[k] for k in ('title','category') if k in data}
        uid=await r.media.upload(r.p,filename,request,allowed_mimes=rule['types'],metadata=metadata)
        return self.dto(await r.media.inspect(r.p,uid))
    async def crop_upload(self,data,filename,request):
        """裁剪副本复用上传；可选来源在提交时重新核对，不修改来源或已有引用。"""
        from .media_image import crop_dimensions
        rule=await self.context(data);r=self.r
        if rule['fixed_key']:raise Error('此导航固定了媒体，不能上传裁剪副本',403)
        if data.get('source_uid'):
            source=await self.select(data|{'media_uid':data['source_uid'],'stamp':data.get('source_stamp')})
            if source['mime_type'] not in IMAGE_TYPES:raise Error('裁剪来源必须为图片')
        elif data.get('source_stamp'):raise Error('裁剪来源标识缺失')
        types=tuple(t for t in rule['types'] if t in ('image/png','image/jpeg'))
        if not types:raise Error('当前字段不支持裁剪图片')
        uid=await r.media.upload(r.p,filename,request,allowed_mimes=types,metadata={k:data[k] for k in ('title','category') if k in data},validate_bytes=crop_dimensions)
        return self.dto(await r.media.inspect(r.p,uid))
