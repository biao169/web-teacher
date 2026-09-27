"""Shared media URL resolution and atomic external registration; never fetch remote bytes."""
import ipaddress,re,secrets
from urllib.parse import urlsplit,urlunsplit,quote
from .catalog import Error,now
from .media_policy import ALL_TYPES,FIELD_TYPES,EXTENSIONS

MAX_URL=4096
LOCAL_MEDIA=re.compile(r'(?:/media/|/api/admin/media/)([a-f0-9]{32})(?:/content)?\Z')
MIME_LABELS={'image/png':'PNG图片','image/jpeg':'JPEG图片','image/gif':'GIF图片','image/webp':'WebP图片','application/pdf':'PDF文档','video/mp4':'MP4视频','video/webm':'WebM视频','application/zip':'ZIP压缩包'}

def external_url(value):
    """Normalize public HTTP(S) spelling, preserving signed paths, queries and fragments exactly."""
    if not isinstance(value,str) or not value or len(value)>MAX_URL:raise Error('媒体链接须为1–4096字符')
    if re.search(r'[\s\\\x00-\x1f\x7f]',value) or re.search(r'%(?:0[0-9a-f]|1[0-9a-f]|7f)',value,re.I) or re.search(r'%(?![0-9a-f]{2})',value,re.I):raise Error('媒体链接含空白、控制字符或无效转义')
    try:
        parts=urlsplit(value);host=(parts.hostname or '').rstrip('.').encode('idna').decode('ascii').lower();port=parts.port
    except (ValueError,UnicodeError):raise Error('媒体链接地址无效') from None
    if parts.scheme not in ('http','https') or not host or parts.username is not None or parts.password is not None:raise Error('仅接受不含账号密码的HTTP/HTTPS媒体链接')
    if port not in (None,80 if parts.scheme=='http' else 443):raise Error('外部媒体仅支持标准HTTP/HTTPS端口')
    try:
        address=ipaddress.ip_address(host)
        if not address.is_global or (getattr(address,'ipv4_mapped',None) and not address.ipv4_mapped.is_global):raise Error('媒体链接不能指向本机、内网或保留地址')
    except ValueError:
        if '.' not in host or host.endswith(('.localhost','.local','.internal','.invalid','.test','.onion')) or not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?',label) for label in host.split('.')) or re.fullmatch(r'(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+))*',host):raise Error('请填写公开网站域名，不能使用本机或内网地址')
    authority='['+host+']' if ':' in host else host
    if port is not None:authority+=':'+str(port)
    # Escaped bytes and query order are significant for signed URLs; never sort or decode them.
    result=urlunsplit((parts.scheme,authority,quote(parts.path,safe="/%:@!$&'()*+,;=-._~"),quote(parts.query,safe="%/?@!$&'()*+,;=:-._~[]"),quote(parts.fragment,safe="%/?@!$&'()*+,;=:-._~[]")))
    if len(result)>MAX_URL:raise Error('编码后的媒体链接超过4096字符')
    return result

def media_link(row):
    """Show external source URLs and stable local media routes, without exposing disk paths."""
    return row['object_key'] if row.get('storage_kind')=='external' else '/media/'+row['uid']

class MediaLinks:
    def __init__(self,r):
        """One request owns draft registrations and existing versions, reused by form and chooser."""
        self.r=r;self.pending={};self.existing={}
    async def resolve(self,value,types,declared='',stamp='',create=True):
        """Resolve a registered key/local URL or stage a declared external resource without writes."""
        r=self.r;r.auth.require(r.p,'media_assets')
        if not isinstance(value,str) or len(value)>MAX_URL:raise Error('媒体链接过长或无效')
        value=value.strip()
        if not value:return None
        row=self.pending.get(value)
        if not row:
            found=await r.sql.query('SELECT * FROM media_assets WHERE object_key=?',(value,));row=found[0] if found else None
        if not row:
            try:parts=urlsplit(value)
            except ValueError:raise Error('媒体链接无效') from None
            own=not parts.scheme and not parts.netloc
            if parts.scheme and parts.netloc:
                try:own=(parts.scheme.lower(),parts.hostname,parts.port or (443 if parts.scheme.lower()=='https' else 80))==(urlsplit(r.config.origin).scheme,urlsplit(r.config.origin).hostname,urlsplit(r.config.origin).port or (443 if r.config.origin.startswith('https:') else 80))
                except ValueError:raise Error('媒体链接端口无效') from None
            if own:
                match=LOCAL_MEDIA.fullmatch(parts.path)
                if not match or parts.query or parts.fragment or parts.username is not None:raise Error('本站媒体链接应为 /media/媒体标识，不附带参数')
                found=await r.sql.query('SELECT * FROM media_assets WHERE uid=?',(match[1],));row=found[0] if found else None
                if not row:raise Error('本站媒体未登记或已删除',404)
            else:
                value=external_url(value)
                found=await r.sql.query('SELECT * FROM media_assets WHERE object_key=?',(value,));row=found[0] if found else self.pending.get(value)
                if not row:
                    if declared not in types:raise Error('请选择适用于当前字段的外链类型；服务端不会下载或核验远程内容')
                    if create:r.auth.require(r.p,'media_assets','create')
                    row={'uid':secrets.token_hex(16),'object_key':value,'title':urlsplit(value).hostname,'category':None,'mime_type':declared,'size':0,'storage_kind':'external','status':'active','updated_at':now()}
                    self.pending[value]=row
        if row['status']!='active' or row['storage_kind'] not in (r.kind,'external'):raise Error('媒体已回收或不属于当前存储',409)
        if row['mime_type'] not in types:raise Error('媒体类型不适用于此字段')
        if stamp and stamp!=row['updated_at']:raise Error('媒体信息已变化，请重新选择',409)
        if row['storage_kind']=='external':external_url(row['object_key'])
        if row['object_key'] not in self.pending:self.existing[row['uid']]=row
        return row
    def statements(self):
        """Generate permission/CAS guarded registry changes for the caller's SQLite or D1 batch."""
        r=self.r;statements=[]
        if self.existing:
            condition=' AND '.join("EXISTS(SELECT 1 FROM media_assets WHERE uid=? AND updated_at=? AND status='active')" for row in self.existing.values());args=tuple(v for row in self.existing.values() for v in (row['uid'],row['updated_at']))
            gid,guard=r.auth.guard(r.p,'media_assets','view',condition,args);statements.extend([guard,('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
        if self.pending:
            r.auth.require(r.p,'media_assets','create');gid,guard=r.auth.guard(r.p,'media_assets','create');statements.append(guard)
            for row in self.pending.values():
                names=('uid','object_key','title','category','mime_type','size','storage_kind','status','updated_at')
                statements.append(('INSERT INTO media_assets('+','.join(names)+') VALUES ('+','.join('?' for _ in names)+')',tuple(row[k] for k in names)))
                statements.append(r.content.audit(r.p,'media_assets','register_external',row['uid']))
            statements.append(('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,)))
        return statements
    async def form(self,table,data,uid='',nav='',nav_stamp=''):
        """Resolve all submitted media inputs as a single draft; failed content saves leave no new rows."""
        from .media_picker import MediaPicker
        eligible={field for (module,field) in FIELD_TYPES if module==table}
        prefixes=('_media_link_','_media_type_','_media_stamp_')
        for key in list(data):
            if key.startswith(prefixes) and key.split('_',3)[-1] not in eligible:raise Error('媒体辅助字段无效')
        for field in eligible:
            link=data.pop('_media_link_'+field,None);mime=data.pop('_media_type_'+field,'');stamp=data.pop('_media_stamp_'+field,'')
            if link is None:continue
            context={'module':table,'field':field,'uid':uid,'nav':nav,'nav_stamp':nav_stamp}
            rule=await MediaPicker(self.r).context(context)
            row=await self.resolve(link,rule['types'],mime,stamp)
            key=row['object_key'] if row else ''
            if rule['fixed_key'] and rule['fixed_key']!=key:raise Error('媒体不符合导航固定范围',403)
            data[field]=key
        return self

async def decorate_media_fields(r,table,specs,row):
    """Attach bounded saved-link/type values to the existing field renderer, including unavailable keys."""
    media={field:spec for field,spec in specs.items() if spec.get('media')}
    keys=[row.get(field) for field in media if row.get(field)]
    assets=await r.sql.query('SELECT * FROM media_assets WHERE object_key IN ('+','.join('?' for _ in keys)+')',keys) if keys else []
    by_key={a['object_key']:a for a in assets}
    for field,spec in media.items():
        spec['label']=re.sub(r'\s*(?:媒体)?\s*Key\b','',spec['label']).strip()
        asset=by_key.get(row.get(field));spec['media_input']=media_link(asset) if asset else row.get(field) or ''
        spec['media_types']=[(mime,MIME_LABELS[mime]) for mime in FIELD_TYPES[(table,field)]]
        spec['media_mime']=asset['mime_type'] if asset else '';spec['media_stamp']=asset['updated_at'] if asset else ''
        spec['media_external']=bool(asset and asset['storage_kind']=='external')
