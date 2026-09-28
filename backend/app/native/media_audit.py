"""有界媒体扫描、报告、显式收录和回收站清理；共用预检和持久化删除意图。"""
import json,secrets,hashlib,re
from pathlib import PurePosixPath
from .catalog import Error,now
from .media import signature
from .media_inventory_store import inventory,relative_key,digest
from .storage import key_path
from .media_locks import lease,live_lease,purge_key
from .media_references import REFERENCE_LOCK

CATEGORIES={'matched':'已匹配','missing':'登记但缺失','unregistered':'存在但未收录','changed':'大小有变化','unsupported':'无法处理','pending':'清理待重试','external':'外部链接（未验证）'}

class MediaAudit:
    def __init__(self,r):
        """组合现有身份、SQL、媒体和缓存；不配置额外数据库或常驻扫描进程。"""
        self.r=r;self.store=inventory(r.media_store);self.cache=inventory(r.cache_store)
        self.owner=digest(r.p['uid']) if r.p else ''
        s=r.settings
        self.scope=digest((r.kind,str(getattr(r.media_store,'root','')),getattr(r.media_store,'prefix',''),str(s.database_path),s.database_binding,s.media_binding))
    async def read_json(self,key):
        """报告缓存有体积上限，丢失或损坏时要求重新扫描。"""
        try:
            data=await self.r.cache_store.get(key,max_bytes=1024*1024)
            return json.loads(data) if data else None
        except (ValueError,UnicodeError):raise Error('报告缓存已损坏，请清除报告后重新扫描',409) from None
    async def write_json(self,key,value):
        """缓存写入复用既有原子存储方法。"""
        await self.r.cache_store.put(key,json.dumps(value,ensure_ascii=False).encode())
    def root(self,report):
        """只允许服务端产生的报告标识进入缓存路径。"""
        if not isinstance(report,str) or not re.fullmatch('[a-f0-9]{32}',report):raise Error('报告标识无效')
        return 'media-audit/'+report
    async def latest(self):
        """返回当前账号唯一报告入口；清理报告前不会建立多份目录缓存。"""
        self.r.auth.require(self.r.p,'media_assets')
        return await self.read_json('media-audit/latest-'+self.owner+'.json')
    async def state(self,report,expired=False):
        """校验报告所有者、配置范围和有效期，阻止跨用户/跨目录复用报告。"""
        self.r.auth.require(self.r.p,'media_assets');s=await self.read_json(self.root(report)+'/state.json')
        if not s:raise Error('报告已不存在，请清除入口后重新扫描',404)
        if s['owner']!=self.owner or s['scope']!=self.scope:raise Error('报告不属于当前账号或存储配置',403)
        if not expired and s['expires']<now():raise Error('报告已过期，请清除后重新扫描',409)
        # Additional report categories do not invalidate an existing resumable scan.
        for category in CATEGORIES:s['counts'].setdefault(category,0)
        return s
    async def start(self):
        """建立只读核对任务；已有报告必须先明确清除，限制缓存积累。"""
        r=self.r
        async with lease(r,'media:scan-start:'+self.owner):
            if await self.latest():raise Error('已有报告，请继续查看或先清除报告',409)
            report=secrets.token_hex(16)
            s={'id':report,'owner':self.owner,'scope':self.scope,'version':0,'phase':'registry','last':0,'cursor':None,'pages':[],
               'list_index':1,'counts':{k:0 for k in CATEGORIES},'registry_checked':0,'objects_checked':0,'created_at':now(),'expires':now(seconds=86400)}
            await self.write_json(self.root(report)+'/state.json',s)
            await self.write_json('media-audit/latest-'+self.owner+'.json',{'id':report})
            return s
    async def classify(self,key,asset=None,info=None):
        """元信息核对不读取文件内容；不存在、大小变化、链接和保留存储类型分开显示。"""
        entry={'key':key,'uid':asset['uid'] if asset else '', 'stamp':asset['updated_at'] if asset else '', 'size':asset['size'] if asset else 0,'storage_kind':asset['storage_kind'] if asset else self.r.kind,'category':'unsupported','note':''}
        entry.update(mime_type=asset.get('mime_type') if asset else None,original_filename=asset.get('original_filename') if asset else None,title=asset.get('title') if asset else None)
        try:
            if asset and asset['storage_kind']=='external':
                entry['category']='external';entry['note']='外部链接不扫描本地/R2目录，也不核验远程大小或可用性';return entry
            relative_key(key)
            if asset and asset['storage_kind']!=self.r.kind:
                entry['note']='登记的存储类型与当前配置不同';return entry
            if asset and await self.r.sql.query('SELECT 1 FROM admin_mutation_guards WHERE uid=?',(purge_key(asset['uid']),)):
                entry['category']='pending';entry['note']='清理尚未完成，请到回收站清理页重试';return entry
            if info and info.get('error'):raise Error(info['error'])
            info=info or await self.store.head(key)
            if info is None:
                entry['category']='missing' if asset else 'unsupported';entry['note']='文件在本次检查时不存在';return entry
            entry.update(size=info['size'],object_version=info['version'])
            if asset:entry['category']='matched' if asset['size']==info['size'] else 'changed'
            elif PurePosixPath(key).suffix.lower().lstrip('.') in ('png','jpg','jpeg','gif','webp','pdf','mp4','webm','zip'):entry['category']='unregistered'
            else:entry['note']='扩展名不属于支持的媒体类型，不自动收录'
        except (Error,OSError):entry['note']='路径不可读取、为链接或不是受支持的普通文件'
        return entry
    async def step(self,report,version):
        """每次至多核对20条；游标和已完成报告保存在缓存，可暂停并继续。"""
        r=self.r
        async with lease(r,'media:scan:'+report) as owner:
            s=await self.state(report)
            if version!=s['version']:raise Error('扫描进度已变化，请刷新报告',409)
            if s['phase']=='done':return s
            if len(s['pages'])>=1000:raise Error('报告达到20000条记录上限，请先处理并清除报告',413)
            entries=[]
            if s['phase']=='registry':
                rows=await r.sql.query('SELECT id,uid,updated_at,object_key,size,storage_kind,mime_type,original_filename,title FROM media_assets WHERE id>? ORDER BY id LIMIT 20',(s['last'],))
                # Use the actual integer primary key as the seek cursor, independent of editable fields.
                for row in rows:entries.append(await self.classify(row['object_key'],row))
                s['registry_checked']+=len(rows)
                if rows:s['last']=rows[-1]['id']
                if len(rows)<20:s['phase']='objects'
            else:
                page=await self.store.list_page(s['cursor'],20);s['cursor']=page['cursor'];s['objects_checked']+=page['visited']
                for info in page['objects']:
                    if not await r.sql.query('SELECT 1 FROM media_assets WHERE object_key=?',(info['key'],)):
                        entries.append(await self.classify(info['key'],info=info))
                if not page['truncated']:s['phase']='done'
            if entries:
                counts={k:sum(e['category']==k for e in entries) for k in CATEGORIES}
                index=len(s['pages']);await self.write_json(self.root(report)+f'/page-{index}.json',entries);s['pages'].append(counts)
                from .media_audit_list import append_index
                await append_index(self,s,index,entries)
                for k,n in counts.items():s['counts'][k]+=n
            s['version']+=1
            condition,args=live_lease('media:scan:'+report,owner);gid,guard=r.auth.guard(r.p,'media_assets','view',condition,args)
            await r.sql.batch([guard,('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
            await self.write_json(self.root(report)+'/state.json',s);return s
    async def page(self,report,category='',page=1,query=None):
        """媒体列表协议：对整个已扫描报告筛选和排序，再读取当前页条目。"""
        from .media_audit_list import listing
        return await listing(self,report,query if query is not None else {'category':category,'page':page},CATEGORIES)
    async def entry(self,report,page,index):
        """操作目标来自已保存报告，不能由浏览器传任意文件系统地址。"""
        s=await self.state(report)
        if type(page)!=int or type(index)!=int or not 0<=page<len(s['pages']) or not 0<=index<20:raise Error('报告条目无效')
        rows=await self.read_json(self.root(report)+f'/page-{page}.json')
        if not rows or index>=len(rows):raise Error('报告条目已不存在',409)
        return rows[index]
    async def recheck(self,report,page,index):
        """单项复核使用最新登记和实际对象状态，不自动修改媒体元数据。"""
        old=await self.entry(report,page,index);rows=await self.r.sql.query('SELECT * FROM media_assets WHERE object_key=?',(old['key'],))
        return await self.classify(old['key'],rows[0] if rows else None)
    async def clear(self,report):
        """分批删除当前账号的报告缓存；不触及媒体文件或清理意图。"""
        latest=await self.latest()
        if not latest or latest['id']!=report:raise Error('报告入口不属于当前账号',403)
        async with lease(self.r,'media:scan:'+report):
            page=await self.cache.list_page(None,20,self.root(report))
            for obj in page['objects']:await self.r.cache_store.delete(obj['key'])
            done=not page['truncated']
            if done:await self.r.cache_store.delete('media-audit/latest-'+self.owner+'.json')
            return {'done':done}
    async def plan(self,report,values):
        """预检凭据绑定账号、存储配置和对象版本；同一内容重复预检复用缓存槽。"""
        s=await self.state(report);values.update(owner=self.owner,scope=self.scope,report=report,expires=min(s['expires'],now(seconds=1800)))
        token=digest(json.dumps({k:v for k,v in values.items() if k!='expires'},sort_keys=True))
        await self.write_json(self.root(report)+'/plan-'+token+'.json',values)
        return dict(values,token=token)
    async def get_plan(self,report,token,kind):
        """执行前重读服务器预检内容，拒绝过期或跨用途凭据。"""
        await self.state(report)
        if not isinstance(token,str) or not re.fullmatch('[a-f0-9]{64}',token):raise Error('预检标识无效')
        plan=await self.read_json(self.root(report)+'/plan-'+token+'.json')
        if not plan or plan['owner']!=self.owner or plan['scope']!=self.scope or plan['kind']!=kind or plan['expires']<now():raise Error('预检已失效，请重新核对',409)
        return plan
    async def checked_file(self,key):
        """收录共用上传格式、20MiB上限及签名检查，并核对读取前后版本。"""
        settings=(await self.r.sql.query('SELECT upload_max_size_mb,upload_allowed_extensions FROM global_settings ORDER BY id LIMIT 1'))[0]
        limit=min(20,settings['upload_max_size_mb'])*1024*1024;ext=PurePosixPath(key).suffix.lower().lstrip('.')
        if ext not in json.loads(settings['upload_allowed_extensions']):raise Error('此格式未在全局允许列表中')
        before=await self.store.head(key)
        if not before:raise Error('文件已不存在',409)
        if before['size']>limit:raise Error('文件超过收录大小限制',413)
        data=await self.store.read(key,limit);after=await self.store.head(key)
        if before!=after or len(data)!=before['size']:raise Error('文件读取期间发生变化，请重试',409)
        mime=signature(data,ext)
        if not mime:raise Error('文件内容与扩展名不符')
        return before,data,mime,hashlib.sha256(data).hexdigest(),ext
    async def prepare_import(self,report,page,index):
        """明确呈现原地登记或规范文件名副本方案，预检不改媒体文件和数据库。"""
        r=self.r;r.auth.require(r.p,'media_assets','create');entry=await self.entry(report,page,index)
        if await r.sql.query('SELECT 1 FROM media_assets WHERE object_key=?',(entry['key'],)):raise Error('此文件已经收录，请重新核对报告',409)
        info,data,mime,checksum,ext=await self.checked_file(entry['key']);uid=digest(report+entry['key']+info['version'])[:32]
        try:key_path(entry['key']);target=entry['key'];mode='register'
        except Error:
            target=uid+'.'+ext;mode='copy'
            existing=await r.sql.query('SELECT uid FROM media_assets WHERE checksum=? LIMIT 1',(checksum,))
            if existing:raise Error('此内容已有登记副本，请在媒体库中使用已有文件；原始目录文件仍保留',409)
        return await self.plan(report,{'kind':'import','source':entry['key'],'target':target,'mode':mode,'uid':uid,'title':PurePosixPath(entry['key']).name[:200],'size':len(data),'mime':mime,'checksum':checksum,'object_version':info['version']})
    async def commit_import(self,report,token):
        """重新核对字节/权限/配额后登记；副本失败时保留可核对文件，不删除原文件。"""
        r=self.r;r.auth.require(r.p,'media_assets','create');p=await self.get_plan(report,token,'import')
        async with lease(r,'media:upload','create') as owner:
            existing=await r.sql.query('SELECT uid,object_key,checksum FROM media_assets WHERE uid=?',(p['uid'],))
            if existing:
                if existing[0]['object_key']==p['target'] and existing[0]['checksum']==p['checksum']:return {'uid':p['uid'],'already_done':True}
                raise Error('登记标识已变化，请重新预检',409)
            info,data,mime,checksum,ext=await self.checked_file(p['source'])
            if info['version']!=p['object_version'] or checksum!=p['checksum']:raise Error('文件已变化，请重新预检',409)
            if await r.sql.query('SELECT 1 FROM media_assets WHERE object_key=?',(p['target'],)):raise Error('目标已收录，请重新核对',409)
            usage=(await r.sql.query('SELECT coalesce(sum(size),0) n FROM media_assets'))[0]['n']
            if usage+len(data)>524288000:raise Error('媒体登记总容量超过500MiB限制',413)
            if p['mode']=='copy':
                # A failed DB commit may leave our exact planned copy; resume without overwriting it.
                copy_info=await self.store.head(p['target'])
                if copy_info:
                    _,_,_,copy_hash,_=await self.checked_file(p['target'])
                    if copy_hash!=checksum:raise Error('目标已有不同内容，请重新核对目录',409)
                else:await self.store.create(p['target'],data)
            condition,args=live_lease('media:upload',owner)
            condition+=" AND NOT EXISTS(SELECT 1 FROM media_assets WHERE object_key=?) AND (SELECT coalesce(sum(size),0) FROM media_assets)+?<=524288000";args+=p['target'],len(data)
            gid,guard=r.auth.guard(r.p,'media_assets','create',condition,args)
            await r.sql.batch([guard,('INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status,checksum,original_filename) VALUES (?,?,?,?,?,?,?,?,?)',(p['uid'],p['target'],p['title'],mime,len(data),r.kind,'active',checksum,PurePosixPath(p['source']).name if len(PurePosixPath(p['source']).name)<=255 else None)),r.content.audit(r.p,'media_assets','inventory_import',p['uid']),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
            return {'uid':p['uid']}
    async def purge_candidates(self):
        """回收站按更新时间展示20条到期/待重试候选，引用保护仍在预检及提交时执行。"""
        return await self.r.sql.query("SELECT * FROM media_assets WHERE status='trash' AND (julianday(updated_at)<=julianday('now')-(SELECT media_trash_retention_days FROM global_settings ORDER BY id LIMIT 1) OR uid IN (SELECT json_extract(target_uid,'$.uid') FROM admin_mutation_guards WHERE module='media-purge')) ORDER BY updated_at,id LIMIT 20")
    async def eligible(self,uid,stamp,immediate=False,base=None,manual=False):
        """自动清理检查保留期；手动删除仅跳过时间限制，仍检查权限、版本和引用。"""
        r=self.r;r.auth.require(r.p,'media_assets','delete');row=await r.media.inspect(r.p,uid)
        if row['updated_at']!=stamp or row['status']!='trash':raise Error('条目状态或版本已变化',409)
        if row['storage_kind'] not in (r.kind,'external'):raise Error('不能清理其他存储类型')
        due=await r.sql.query("SELECT 1 FROM media_assets WHERE uid=? AND julianday(updated_at)<=julianday('now')-(SELECT media_trash_retention_days FROM global_settings ORDER BY id LIMIT 1)",(uid,))
        from .navigation import in_scope
        if not in_scope('media_assets',row,base):raise Error('文件不在当前导航范围内',403)
        if immediate and not manual and not r.p['is_system']:raise Error('仅系统管理员可跳过保留期',403)
        if not due and not immediate and not manual:raise Error('尚未达到当前设置的回收站保留期',409)
        if await r.media.references.used(row):raise Error('文件仍被引用，不能永久清理',409)
        return row
    async def prepare_purge(self,report,uid,stamp):
        """预检显示将永久删除的登记和对象；缺失对象也只清理已到期且无引用的登记。"""
        return await self.plan(report,await self.purge_plan(uid,stamp))
    async def purge_plan(self,uid,stamp,immediate=False,base=None,navigation=None,manual=False):
        row=await self.eligible(uid,stamp,immediate,base,manual);info=None if row['storage_kind']=='external' else await self.store.head(row['object_key'])
        return {'kind':'purge','manual':manual,'immediate':immediate,'base':base or {},'navigation':navigation,'name':row.get('original_filename') or row['title'] or row['object_key'],'uid':uid,'stamp':stamp,'source':row['object_key'],'size':info['size'] if info else 0,'object_version':info['version'] if info else 'missing','mode':'仅删除外链登记，不删除远程文件' if row['storage_kind']=='external' else '永久删除文件及登记' if info else '清理缺失文件的登记'}
    async def commit_purge(self,report,token):
        """先持久化清理意图再删对象；失败保留回收站及重试状态，绝不自动恢复。"""
        return await self.execute_purge(await self.get_plan(report,token,'purge'))
    async def execute_purge(self,p):
        r=self.r;r.auth.require(r.p,'media_assets','delete');key=purge_key(p['uid'])
        immediate=p.get('immediate',False);manual=p.get('manual',False)
        if immediate and not manual and not r.p['is_system']:raise Error('仅系统管理员可跳过保留期',403)
        from .navigation import navigation_guard
        nav_sql,nav_args=navigation_guard(p.get('navigation'))
        policy="1=1" if manual else "EXISTS(SELECT 1 FROM auth_roles WHERE uid=? AND is_system=1)" if immediate else "julianday(updated_at)<=julianday('now')-(SELECT media_trash_retention_days FROM global_settings ORDER BY id LIMIT 1)"
        policy_args=(r.p['role_uid'],) if immediate and not manual else ()
        async with lease(r,'media:purge-run:'+digest(p['uid']),'delete') as owner:
            rows=await r.sql.query('SELECT 1 FROM media_assets WHERE uid=?',(p['uid'],))
            if not rows:return {'uid':p['uid'],'already_done':True}
            async with lease(r,REFERENCE_LOCK,'delete'):
                row=await self.eligible(p['uid'],p['stamp'],immediate,p.get('base'),manual);info=None if row['storage_kind']=='external' else await self.store.head(row['object_key'])
                pending=await r.sql.query('SELECT * FROM admin_mutation_guards WHERE uid=?',(key,))
                # A previous deletion may have succeeded although its acknowledgement was lost.
                if info and info['version']!=p['object_version']:raise Error('文件已变化，请重新预检',409)
                if not info and p['object_version']!='missing' and not pending:raise Error('文件已变化，请重新预检',409)
                condition,args=live_lease('media:purge-run:'+digest(p['uid']),owner)
                condition+=" AND EXISTS(SELECT 1 FROM media_assets WHERE uid=? AND updated_at=? AND status='trash' AND "+policy+") AND ("+nav_sql+")";args+=(p['uid'],p['stamp'],*policy_args,*nav_args)
                gid,guard=r.auth.guard(r.p,'media_assets','delete',condition,args)
                intent=json.dumps({'uid':p['uid'],'version':p['object_version']})
                await r.sql.batch([guard,('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES (?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET target_uid=excluded.target_uid', (key,'media-purge',intent,p['stamp'],now())),r.content.audit(r.p,'media_assets','purge_start',p['uid']),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
            if info:await self.store.delete(row['object_key'],p['object_version'])
            condition,args=live_lease('media:purge-run:'+digest(p['uid']),owner)
            condition+=" AND EXISTS(SELECT 1 FROM media_assets WHERE uid=? AND updated_at=? AND status='trash') AND EXISTS(SELECT 1 FROM admin_mutation_guards WHERE uid=? AND target_uid=?)";args+=p['uid'],p['stamp'],key,intent
            condition+=' AND ('+nav_sql+')';args+=nav_args
            if immediate:condition+=' AND '+policy;args+=policy_args
            gid,guard=r.auth.guard(r.p,'media_assets','delete',condition,args)
            await r.sql.batch([guard,('DELETE FROM media_assets WHERE uid=?',(p['uid'],)),r.content.audit(r.p,'media_assets','purge_complete',p['uid']),('DELETE FROM admin_mutation_guards WHERE uid IN (?,?)',(key,gid))])
            return {'uid':p['uid']}

    async def prepare_trash(self,uid,stamp,immediate=False,base=None,navigation=None):
        """One bounded cached preflight slot per account/record, without creating a scan report."""
        if type(immediate) is not bool:raise Error('立即删除选项无效')
        p=await self.purge_plan(uid,stamp,False,base,navigation,manual=True)
        p.update(owner=self.owner,scope=self.scope,expires=now(seconds=1800))
        token=secrets.token_hex(32);p['token']=token
        await self.write_json('media-trash/'+self.owner+'/'+digest(uid)+'.json',p)
        return {k:p[k] for k in ('token','uid','stamp','name','source','size','mode','immediate')}
    async def commit_trash(self,uid,token,base=None,navigation=None):
        self.r.auth.require(self.r.p,'media_assets','delete')
        if not isinstance(token,str) or not re.fullmatch('[a-f0-9]{64}',token):raise Error('预检标识无效')
        p=await self.read_json('media-trash/'+self.owner+'/'+digest(uid)+'.json')
        if not p or p.get('token')!=token or p.get('owner')!=self.owner or p.get('scope')!=self.scope or p.get('uid')!=uid or p.get('expires','')<now() or p.get('base')!=(base or {}) or p.get('navigation')!=navigation:raise Error('预检已失效或范围变化，请重新预检',409)
        return await self.execute_purge(p)
