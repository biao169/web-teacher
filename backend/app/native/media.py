"""Media uses native media_assets records, bounded uploads, private reads and reference checks."""
import hashlib,secrets,re
from pathlib import PurePosixPath
from .catalog import TABLES,CONTENT,Error,now
from .media_references import MediaReferences,REFERENCE_LOCK
from .navigation import in_scope,navigation_guard
class Media:
    def __init__(self,sql,auth,content,store,kind='local'):
        """保存构造参数和适配器，供此对象后续操作复用。"""
        self.sql=sql;self.auth=auth;self.content=content;self.store=store;self.kind=kind
        self.references=MediaReferences(content)
    async def upload(self,p,filename,request,allowed_mimes=None,metadata=None,validate_bytes=None,new_uid=None,creation_guard=None):
        """One globally reserved upload, maximum 20 MiB; release reservation on every exit."""
        self.auth.require(p,'media_assets','create');at=now();lock='media:upload'
        if new_uid is not None and (not isinstance(new_uid,str) or not re.fullmatch('[a-f0-9]{32}',new_uid)):raise Error('新增媒体标识无效')
        from .catalog import normalize
        from .media_policy import EXTENSIONS
        metadata=metadata or {}
        if set(metadata)-{'title','category'}:raise Error('媒体上传信息字段无效')
        if any(not isinstance(value,str) or len(value)>200 for value in metadata.values()):raise Error('媒体标题或分类最多200字符')
        metadata=normalize('media_assets',metadata)
        settings=await self.sql.query('SELECT upload_max_size_mb,upload_allowed_extensions FROM global_settings ORDER BY id LIMIT 1')
        import json
        allowed=json.loads(settings[0]['upload_allowed_extensions']) if settings else ['jpg','jpeg','png','webp','pdf']
        limit=min(20,settings[0]['upload_max_size_mb'] if settings else 20)*1024*1024
        from .media_names import original_name
        filename=original_name(filename)
        extension=PurePosixPath(filename).suffix.lower().lstrip('.')
        if extension not in allowed:raise Error('不支持此文件扩展名')
        if allowed_mimes and extension not in {ext for mime in allowed_mimes for ext in EXTENSIONS[mime]}:raise Error('此文件类型不适用于当前字段')
        gid,guard=self.auth.guard(p,'media_assets','create');owner=gid
        await self.sql.batch([guard,('DELETE FROM admin_mutation_guards WHERE uid=? AND created_at<?',(lock,now(seconds=-300))),('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES (?,?,?,?,?)',(lock,'media_assets',gid,at,at)),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
        key=None;committed=False
        try:
            data=bytearray()
            async for chunk in request.stream():
                if len(data)+len(chunk)>limit:raise Error('文件超过上传大小限制',413)
                data.extend(chunk)
            from backend.app.native.media import signature
            mime=signature(data,extension)
            if not mime:raise Error('文件内容与扩展名不符')
            if allowed_mimes and mime not in allowed_mimes:raise Error('此文件类型不适用于当前字段')
            # Optional purpose-specific checks run before object storage and registry mutation.
            if validate_bytes:validate_bytes(data,mime)
            usage=(await self.sql.query("SELECT coalesce(sum(size),0) n FROM media_assets"))[0]['n']
            if usage+len(data)>500*1024*1024:raise Error('媒体空间配额500MiB已用尽',413)
            uid=new_uid or secrets.token_hex(16);key=(secrets.token_hex(16) if new_uid else uid)+'.'+extension
            await self.store.put(key,bytes(data))
            condition="EXISTS(SELECT 1 FROM admin_mutation_guards WHERE uid=? AND target_uid=?)";args=(lock,owner)
            if creation_guard:condition+=' AND ('+creation_guard[0]+')';args+=creation_guard[1]
            gid,guard=self.auth.guard(p,'media_assets','create',condition,args)
            await self.sql.batch([guard,('INSERT INTO media_assets(uid,object_key,title,category,mime_type,size,storage_kind,status,checksum,original_filename) VALUES (?,?,?,?,?,?,?,?,?,?)',(uid,key,metadata.get('title') or filename[:200],metadata.get('category'),mime,len(data),self.kind,'active',hashlib.sha256(data).hexdigest(),filename)),self.content.audit(p,'media_assets','upload',uid),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))]);committed=True
            return uid
        finally:
            if key and not committed:await self.store.delete(key)
            await self.sql.batch([('DELETE FROM admin_mutation_guards WHERE uid=? AND target_uid=?',(lock,owner))])
    async def readable(self,uid,p=None):
        """A public file needs an actual visible reference and public attachment policy."""
        rows=await self.sql.query("SELECT * FROM media_assets WHERE uid=? AND status='active'",(uid,))
        if not rows:raise Error('文件不存在',404)
        row=rows[0]
        if p and p['permissions'].get('media_assets',{}).get('can_view'):return row
        for table in (*CONTENT,'site_settings'):
            cols=TABLES[table]['columns'];refs=[f for f,s in cols.items() if s.get('references',{}).get('table')=='media_assets']
            for field in refs:
                where,args=self.content.scope(table,public=True)
                policy='pdf_visibility' if field=='pdf_key' else 'material_visibility' if field=='material_key' else None
                if policy:where+=' AND '+policy+"='public'"
                if await self.sql.query(f'SELECT 1 FROM "{table}" WHERE "{field}"=? AND '+where+' LIMIT 1',(row['object_key'],*args)):return row
        # Rich-text references are normalized by the sanitizer to /media/<uid>.
        if await self.references.public_body_reference(uid):return row
        raise Error('文件不可访问',404)
    async def inspect(self,p,uid):
        """后台授权用户可检查活跃或回收站媒体，公开读取仍仅接受活跃资源。"""
        self.auth.require(p,'media_assets')
        rows=await self.sql.query('SELECT * FROM media_assets WHERE uid=?',(uid,))
        if not rows:raise Error('文件不存在',404)
        return rows[0]
    async def status(self,p,uid,stamp,status,base=None,navigation=None):
        """引用检查期间预留短时写锁，状态、授权及审计在同一事务提交。"""
        if status not in ('active','trash'):raise Error('状态无效')
        self.auth.require(p,'media_assets','edit')
        row=await self.inspect(p,uid)
        from .media_locks import pending_guard,purge_key
        if await self.sql.query('SELECT 1 FROM admin_mutation_guards WHERE uid=?',(purge_key(uid),)):raise Error('文件清理尚未完成，请在回收站或目录核对页重试清理',409)
        if not in_scope('media_assets',row,base):raise Error('文件不在固定筛选范围内',403)
        if row['updated_at']!=stamp:raise Error('文件已变化，请刷新后重试',409)
        if row['status']==status:return
        owner=None
        try:
            if status=='trash':
                owner,guard=self.auth.guard(p,'media_assets','edit')
                at=now()
                await self.sql.batch([guard,
                    ('DELETE FROM admin_mutation_guards WHERE uid=? AND created_at<?',(REFERENCE_LOCK,now(seconds=-300))),
                    ('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES (?,?,?,?,?)',(REFERENCE_LOCK,'media_assets',owner,at,at)),
                    ('DELETE FROM admin_mutation_guards WHERE uid=?',(owner,))])
                if await self.references.used(row):raise Error('文件仍被使用或正文待核对，请先查看使用位置并解除引用',409)
            condition='EXISTS(SELECT 1 FROM media_assets WHERE uid=? AND updated_at=?)';args=(uid,stamp)
            pending_condition,pending_args=pending_guard(uid);condition+=' AND '+pending_condition;args+=pending_args
            if owner:
                condition+=" AND EXISTS(SELECT 1 FROM admin_mutation_guards WHERE uid=? AND target_uid=? AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-300 seconds'))";args+=(REFERENCE_LOCK,owner)
            nav_condition,nav_args=navigation_guard(navigation);condition+=' AND '+nav_condition;args+=nav_args
            gid,guard=self.auth.guard(p,'media_assets','edit',condition,args)
            await self.sql.batch([guard,('UPDATE media_assets SET status=?,updated_at=? WHERE uid=?',(status,now(after=row['updated_at']),uid)),self.content.audit(p,'media_assets',status,uid),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
        finally:
            if owner:await self.sql.batch([('DELETE FROM admin_mutation_guards WHERE uid=? AND target_uid=?',(REFERENCE_LOCK,owner))])
def signature(data,ext):
    """Accept only signatures of supported passive media types; executable HTML/SVG is excluded."""
    if ext=='pdf' and data.startswith(b'%PDF-'):return 'application/pdf'
    if ext=='png' and data.startswith(b'\x89PNG\r\n\x1a\n'):return 'image/png'
    if ext in ('jpg','jpeg') and data.startswith(b'\xff\xd8\xff'):return 'image/jpeg'
    if ext=='webp' and data[:4]==b'RIFF' and data[8:12]==b'WEBP':return 'image/webp'
    if ext=='gif' and data[:6] in (b'GIF87a',b'GIF89a'):return 'image/gif'
    if ext=='zip' and data[:4]==b'PK\x03\x04':return 'application/zip'
    if ext=='mp4' and data[4:8]==b'ftyp':return 'video/mp4'
    if ext=='webm' and data[:4]==b'\x1aE\xdf\xa3':return 'video/webm'
    return None
