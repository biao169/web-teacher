"""Reusable temporary transfer service; local mode shares the teacher database and session."""
import hashlib,json,secrets,time,copy,asyncio
from pathlib import Path
from urllib.parse import quote
from fastapi import FastAPI,Request
from fastapi.responses import HTMLResponse,JSONResponse,RedirectResponse,Response,StreamingResponse
from backend.app.native.catalog import Error,now
from backend.app.native.bridge import sign,verify
from backend.app.native.web import payload
from backend.app.native.auth import sha
from .accounting import Accounting,assertion,limit,period_starts
from .management import Management,STATES
from .settings import edit,select_rule
CHUNK=1024*1024

def ms():"""返回当前毫秒时间戳，供任务期限和速率检查。""";return int(time.time()*1000)
class Transfers:
    def __init__(self,sql,store,indexed=False,disk=None):"""保存构造参数和适配器，供此对象后续操作复用。""";self.sql=sql;self.store=store;self.indexed=indexed;self.disk=disk
    async def initialize(self,admin_uid=None):
        """Seed original settings only if absent; explicit CMS UID grants manager access."""
        try:
            from generated_resources import TRANSFER_DEFAULTS
            defaults=TRANSFER_DEFAULTS
        except ImportError:defaults=json.loads((Path(__file__).resolve().parents[2]/'database/native/transfer-defaults.json').read_text())
        statements=[("INSERT OR IGNORE INTO service_meta(key,value) VALUES ('owner','academic-file-transfer')",()),('INSERT OR IGNORE INTO tool_settings(id,revision,document,updated_at,updated_by) VALUES (1,0,?,?,?)',(json.dumps(defaults),now(),'initial-defaults')),("INSERT OR IGNORE INTO vpn_state(id,document) VALUES (1,'{}')",())]
        if admin_uid:statements.append(('INSERT OR IGNORE INTO admin_grants(user_uid,granted_at,granted_by) VALUES (?,?,?)',(admin_uid,now(),'local-operator')))
        await self.sql.batch(statements)
    async def manager(self,p):
        if p and p.get('_integrated'):
            from .identity import permission
            clause,args=permission(p,'manage')
            return bool((await self.sql.query('SELECT '+clause+' ok',args))[0]['ok'])
        return bool(p and await self.sql.query('SELECT 1 FROM admin_grants WHERE user_uid=?',(p['uid'],)))
    async def settings(self):
        """读取或按版本保存原工具设置文档。"""
        rows=await self.sql.query('SELECT * FROM tool_settings WHERE id=1')
        if not rows:raise Error('快传尚未初始化',503)
        return rows[0],json.loads(rows[0]['document'])
    async def task(self,id,p):
        """按任务ID读取临时分享记录及其恢复检查点。"""
        rows=await self.sql.query('SELECT * FROM temporary_shares WHERE id=?',(id,))
        if not rows:raise Error('任务不存在',404)
        row=rows[0]
        if row['owner']!=sha('user:'+p['uid']) and not await self.manager(p):raise Error('没有此任务权限',403)
        return row
    async def policy(self,p,action):
        """Apply original identity rules; unsupported metering protection fails closed."""
        state,settings=await self.settings();settings['_revision']=state['revision']
        if not settings.get('enabled'):raise Error('快传尚未启用',403)
        if settings.get('vpnGuard'):raise Error('VPN计量尚未接入，受保护传输未放行',503)
        if not settings.get('allowUploads' if action=='send' else 'allowDownloads',True):raise Error('此方向的传输已关闭',403)
        rule=select_rule(settings,p)
        if not rule or not rule.get(action) or 'temporary-share' not in rule.get('links',[]):raise Error('当前身份未获准使用临时分享',403)
        rate=rule.get('wanRateKbps') or settings.get('wanRateKbps')
        return settings,rule,float(rate)*1000/8 if rate else None
    async def create(self,p,name,size,folder=None):
        if self.disk:
            return await self.disk.run(lambda:self._create(p,name,size,folder))
        return await self._create(p,name,size,folder)
    async def _create(self,p,name,size,folder=None):
        """Reserve quota and create recovery state atomically; file bytes stay in object storage."""
        if not p.get('send'):raise Error('没有上传权限',403)
        settings,rule,rate=await self.policy(p,'send')
        if not isinstance(size,int) or isinstance(size,bool) or not (0 if folder else 1)<=size<=(9007199254740991 if self.indexed else 200*1024*1024):raise Error('文件大小无效或超过此部署支持的上限')
        if not isinstance(name,str) or not 1<=len(name)<=200 or any(x in name for x in ('/','\\','\x00','\r','\n')):raise Error('文件名无效')
        if not folder and limit(settings.get('maxFileBytes')) is not None and size>limit(settings['maxFileBytes']):raise Error('文件超过全站大小限制',403)
        for key in (('maxTaskBytes',) if folder else ('maxFileBytes','maxTaskBytes')):
            if rule.get(key) is not None and size>int(rule[key]):raise Error('文件超过当前身份的大小限制',403)
        if int(rule.get('maxFiles',1))<(folder['fileCount'] if folder else 1):raise Error('当前身份禁止发送文件',403)
        if self.disk:await self.disk.check(self.sql,settings,size)
        id=secrets.token_hex(16);token=secrets.token_urlsafe(32);owner=sha('user:'+p['uid']);at=ms();expiry=at+int(settings['temporaryHours'])*3600000
        storage_limit=int(settings['temporaryStorageBytes']);summary=json.dumps({'name':name,'fileCount':1,'totalBytes':str(size),**(folder or {})})
        point=json.dumps({'bytes':0,'parts':[],'not_before':0,**({'indexed':1} if self.indexed else {})});guard=('INSERT INTO bridge_nonces(jti,expires_at) SELECT ?,NULL WHERE (SELECT coalesce(sum(CAST(reserved_bytes AS INTEGER)),0) FROM temporary_shares WHERE state!=\'deleted\')+?>?',('guard:'+id,size,storage_limit))
        concurrency=int(rule.get('concurrency') or 1)
        concurrent=('INSERT INTO bridge_nonces(jti,expires_at) SELECT ?,NULL WHERE (SELECT count(*) FROM temporary_shares WHERE owner=? AND state IN (\'uploading\',\'paused\') AND expires_at>?)>=?',('concurrency:'+id,owner,at,concurrency))
        await self.sql.batch([*Accounting(self.sql).reserve(p,id,'upload',size,'send',settings,rule,expiry),guard,concurrent,('INSERT INTO temporary_shares(id,owner,secret_hash,summary,reserved_bytes,state,created_at,expires_at,max_downloads,note) VALUES (?,?,?,?,?,?,?,?,?,?)',(id,owner,sha(token),summary,str(size),'uploading',at,expiry,int(settings['temporaryMaxDownloads']),'')),('INSERT INTO recovery_tasks(id,transport,summary,note,point,extra,state,expires_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',(id,'temporary-share',summary,'',point,'{}','active',expiry,at))])
        return {'id':id,'token':token,'chunk_size':CHUNK}
    async def chunk(self,p,id,offset,data):
        """Immutable chunks plus native JSON checkpoints provide resumable upload without extra tables."""
        if self.indexed:
            from .indexed import chunk
            return await chunk(self,p,id,offset,data)
        settings,rule,rate=await self.policy(p,'send')
        row=await self.task(id,p)
        if row['state']!='uploading' or row['expires_at']<=ms():raise Error('任务不处于可上传状态',409)
        task=(await self.sql.query('SELECT * FROM recovery_tasks WHERE id=?',(id,)))[0];point=json.loads(task['point'])
        if point.get('not_before',0)>ms():raise Error('上传过快，请稍后重试',429)
        if point['bytes']!=offset or not 0<len(data)<=CHUNK or offset+len(data)>int(row['reserved_bytes']):raise Error('分块位置或大小不正确',409)
        ledger=Accounting(self.sql);legacy=[]
        if not await self.sql.query("SELECT 1 FROM transfer_allowances WHERE task=? AND member='upload'",(id,)):
            legacy=ledger.reserve(p,id,'upload',int(row['reserved_bytes'])-offset,'send',settings,rule,row['expires_at'])
        key=id+'/'+secrets.token_hex(16)+'.part';await self.store.put(key,data);old=task['point'];point['parts'].append({'key':key,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()});point['bytes']+=len(data);point['not_before']=ms()+int(len(data)/rate*1000) if rate else 0;encoded=json.dumps(point)
        done=point['bytes']==int(row['reserved_bytes'])
        try:
            await self.sql.batch([*legacy,*ledger.charge(id,'upload',len(data),done),('INSERT INTO bridge_nonces(jti,expires_at) SELECT ?,NULL WHERE NOT EXISTS(SELECT 1 FROM recovery_tasks r JOIN temporary_shares s ON s.id=r.id WHERE r.id=? AND r.point=? AND s.state=\'uploading\' AND s.expires_at>?)',('guard:'+secrets.token_hex(16),id,old,ms())),('UPDATE recovery_tasks SET point=?,updated_at=? WHERE id=?',(encoded,max(ms(),task['updated_at']+1),id)),('UPDATE temporary_shares SET manifest=?,state=? WHERE id=?',(encoded,'ready' if done else 'uploading',id))])
        except Exception:await self.store.delete(key);raise
        if rate:await asyncio.sleep(len(data)/rate)
        return {'offset':point['bytes'],'complete':done}
    async def control(self,p,id,action,expected,stamp=None):
        """复用全量管理服务的权限、状态和检查点版本保护。"""
        return await Management(self,p).control(id,action,expected,stamp)
    async def cleanup(self,p):
        """兼容维护入口：每次推进最多一个到期/撤销任务，保留历史和失败检查点。"""
        manager=Management(self,p);await manager.require()
        rows=await self.sql.query("SELECT id FROM temporary_shares WHERE state!='deleted' AND (expires_at<=? OR state='revoked') ORDER BY created_at LIMIT 1",(ms(),))
        return int(bool(rows) and (await manager.purge(rows[0]['id']))['done'])

def app_factory(factory,integrated=None,base=''):
    """Reuse routes with main-site identity locally; legacy Worker keeps its explicit bridge adapter."""
    app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
    async def get(request,required=True):
        """从本适配器的数据源读取指定对象或记录。"""
        if integrated:
            r=await integrated(request)
            if required and not r.p:raise Error('请从教师网站登录后进入快传',401)
            if required and not r.p['permissions'].get('transfer',{}).get('can_view'):raise Error('没有快传访问权限',403)
            return r
        r=copy.copy(factory(request));r.service=Transfers(r.sql,r.store);r.p=None
        token=request.cookies.get('ft_session')
        if token:
            try:r.p=verify(r.secret,token,'transfer-session')
            except Error:pass
        if required and not r.p:raise Error('请从教师网站登录后进入快传',401)
        return r
    def check(request,r,data):
        """检查快传身份、来源、防伪和管理权限。"""
        if request.headers.get('origin')!=r.origin or not r.p or not secrets.compare_digest(data.get('_csrf') or request.headers.get('x-csrf-token',''),r.p['csrf']):raise Error('请求验证失败',403)
    @app.exception_handler(Error)
    async def errors(request,exc):"""将快传业务错误转换为适当的HTTP错误响应。""";return JSONResponse({'error':exc.message},status_code=exc.status)
    @app.middleware('http')
    async def protect(request,next):
        """为快传请求校验来源并附加响应安全头。"""
        try:response=await next(request)
        except Exception as exc:
            if 'constraint' in str(exc).lower():response=JSONResponse({'error':'任务或权限已变化，或额度／存储不足，请刷新核对后重试'},status_code=409)
            else:raise
        if request.url.path.startswith(('/assets/','/transfer-static/')) and response.status_code in (200,206,304):
            suffix=request.url.path.rsplit('.',1)[-1].lower()
            if suffix in ('js','mjs','css'):response.headers['Content-Type']='text/css; charset=utf-8' if suffix=='css' else 'text/javascript; charset=utf-8'
        response.headers['Cache-Control']='no-store';response.headers['X-Content-Type-Options']='nosniff';response.headers['Referrer-Policy']='no-referrer';response.headers['Content-Security-Policy']="default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";return response
    @app.get('/health')
    async def health(request:Request):
        """返回服务就绪信息，供启动器和反向代理检查。"""
        r=await get(request,False);await r.sql.query('SELECT key FROM service_meta LIMIT 1');return {'status':'ok'}
    @app.get('/login')
    async def login(request:Request):"""显示教师站身份入口，不创建独立密码账户。""";return RedirectResponse('/auth/login?next=%2Ftransfer%2F' if integrated else (await get(request,False)).teacher_origin+'/transfer/login',303)
    @app.post('/bridge')
    async def bridge(request:Request):
        """消耗一次性签名票据并建立快传短时会话。"""
        if integrated:raise Error('独立快传登录已停用，请使用主站登录',410)
        r=await get(request,False);data=await payload(request,16384)
        if request.headers.get('origin')!=r.teacher_origin:raise Error('身份来源无效',403)
        claims=verify(r.secret,data.get('ticket',''),'transfer-bridge')
        await r.sql.batch([('DELETE FROM bridge_nonces WHERE expires_at<=?',(ms(),)),('INSERT INTO bridge_nonces(jti,expires_at) VALUES (?,?)',(claims['nonce'],int(claims['exp']*1000)))])
        claims.update(aud='transfer-session',exp=time.time()+300,csrf=secrets.token_urlsafe(24));response=RedirectResponse('/',303);response.set_cookie('ft_session',sign(r.secret,claims),httponly=True,secure=r.origin.startswith('https:'),samesite='lax',max_age=300);return response
    @app.get('/')
    @app.get('/admin')
    @app.get('/tasks')
    async def page(request:Request):
        """显示发送界面和可见任务的控制列表。"""
        r=await get(request,False)
        if request.url.path==base+'/':
            admin=await r.service.manager(r.p);maximum=0;send_error=''
            if r.p:
                try:
                    if not r.p.get('send'):raise Error('没有上传权限',403)
                    settings,rule,_=await r.service.policy(r.p,'send')
                    caps=[9007199254740991 if r.service.indexed else 200*1024*1024]
                    global_cap=limit(settings.get('maxFileBytes'))
                    if global_cap is not None:caps.append(global_cap)
                    caps.extend(int(rule[key]) for key in ('maxFileBytes','maxTaskBytes') if rule.get(key) is not None)
                    caps.append(int(settings['temporaryStorageBytes']))
                    maximum=max(0,min(caps)) if int(rule.get('maxFiles',1))>=1 else 0
                    if maximum==0:send_error='当前身份禁止发送文件。'
                except Error as error:send_error=str(error)
            return HTMLResponse(r.render('portal.html',csrf=r.p['csrf'] if r.p else '',
                user_key=sha('user:'+r.p['uid']) if r.p else '',
                username=(r.p.get('username') or '已登录') if r.p else '',
                max_file_bytes=maximum,manager=admin,teacher_origin=r.teacher_origin,
                send_error=send_error,tasks_url=base+'/tasks'))
        if not r.p:return RedirectResponse(base+'/login',303)
        if integrated and not r.p['permissions'].get('transfer',{}).get('can_view'):raise Error('没有快传访问权限',403)
        admin=await r.service.manager(r.p)
        if request.url.path==base+'/admin' and not admin:raise Error('没有快传管理权限',403)
        if integrated and request.url.path==base+'/admin':
            return RedirectResponse('/admin/transfer'+('?' + str(request.query_params) if request.query_params else ''),303)
        from .presentation import management_context
        values=await management_context(r,dict(request.query_params))
        return HTMLResponse(r.render('native.html',**values))
    @app.get('/api/tasks')
    async def listing(request:Request):
        """分页读取所有授权任务，提供局部刷新HTML，不设置总条数上限。"""
        r=await get(request);values=await Management(r.service,r.p).listing(dict(request.query_params))
        return {'html':r.render('tasks.html',**values,states=STATES),**{k:values[k] for k in ('page','pages','size','total')}}
    @app.post('/api/examples')
    async def examples(request:Request):
        from .examples import add
        r=await get(request);data=await payload(request,2048);check(request,r,data)
        if set(data)-{'_csrf','kind'}:raise Error('示例操作包含未知字段')
        return await add(r,data.get('kind'))
    @app.get('/api/usage')
    async def usage(request:Request):
        """返回当前上传身份已用及预留流量，不影响设置草稿。"""
        r=await get(request);settings,rule,_=await r.service.policy(r.p,'send')
        return await Accounting(r.sql).usage(r.p,settings,rule)
    @app.get('/api/admin/usage')
    async def admin_usage(request:Request):
        """Read totals even when disabled; user quota inspection requires administrator access."""
        r=await get(request)
        if not await r.service.manager(r.p):raise Error('没有管理权限',403)
        _,settings=await r.service.settings();ledger=Accounting(r.sql)
        uid=request.query_params.get('uid','');role=request.query_params.get('role','')
        if len(uid)>128 or len(role)>128:raise Error('身份参数过长')
        p={'uid':uid,'role_id':role} if uid else None
        return {'total':await ledger.total_usage(settings),'identity':await ledger.usage(p,settings,select_rule(settings,p)),'scope':uid or '匿名共享池','timeZone':settings.get('personalTimeZone','Asia/Shanghai')}
    @app.post('/api/batch')
    async def batch(request:Request):
        """每次有限执行选择集/完整匹配集，并返回下一批签名游标。"""
        r=await get(request);data=await payload(request,32768);check(request,r,data)
        return await Management(r.service,r.p,r.secret,getattr(r,'cache',None)).batch(data)
    @app.get('/api/cache')
    async def cache(request:Request):
        """分批扫描快传文件与缓存目录，仅管理员可读。"""
        r=await get(request)
        return await Management(r.service,r.p,r.secret,getattr(r,'cache',None)).cache_page(request.query_params.get('area','files'),request.query_params.get('cursor'))
    @app.post('/api/cache/delete')
    async def delete_cache(request:Request):
        """按已签名预检删除缓存文件；不接受任意原始路径。"""
        r=await get(request);data=await payload(request,16384);check(request,r,data)
        return await Management(r.service,r.p,r.secret,getattr(r,'cache',None)).delete_cache(data.get('token',''))
    @app.post('/api/tasks')
    async def create(request:Request):
        """校验身份规则和配额并创建临时分享任务。"""
        r=await get(request);data=await payload(request,16384);check(request,r,data);return await r.service.create(r.p,data.get('name'),data.get('size'))
    @app.get('/api/tasks/{id}')
    async def checkpoint(request:Request,id:str):
        """返回上传恢复状态和已确认分块摘要。"""
        r=await get(request)
        if r.service.indexed:
            from .indexed import checkpoint as indexed_checkpoint
            try:after=int(request.query_params.get('after',0))
            except ValueError:raise Error('分块游标无效') from None
            return await indexed_checkpoint(r.service,r.p,id,after)
        row=await r.service.task(id,r.p)
        task=(await r.sql.query('SELECT point FROM recovery_tasks WHERE id=?',(id,)))[0]
        point=json.loads(task['point']);info=json.loads(row['summary'])
        return {'name':info['name'],'size':int(row['reserved_bytes']),'state':row['state'],'expired':row['expires_at']<=ms(),'parts':[{'size':x['size'],'sha256':x['sha256']} for x in point['parts']]}
    @app.post('/api/tasks/{id}/chunk')
    async def chunk(request:Request,id:str):
        """接收并校验下一分块，更新任务检查点。"""
        r=await get(request);check(request,r,{})
        if r.service.indexed:
            from .resources import read_chunk
            data=await read_chunk(request)
        else:
            data=bytearray()
            async for part in request.stream():
                if len(data)+len(part)>CHUNK:raise Error('分块过大',413)
                data.extend(part)
        try:offset=int(request.headers.get('x-offset',''))
        except ValueError:raise Error('分块位置无效') from None
        return await r.service.chunk(r.p,id,offset,bytes(data))
    @app.post('/api/tasks/{id}/control')
    async def control(request:Request,id:str):
        """按权限暂停、恢复或撤销指定任务。"""
        r=await get(request);data=await payload(request,16384);check(request,r,data);await r.service.control(r.p,id,data.get('action'),data.get('state'),data.get('stamp'));return {'ok':True}
    @app.post('/api/cleanup')
    async def cleanup(request:Request):
        """清理到期或撤销任务的对象及相关原生记录。"""
        r=await get(request);data=await payload(request,16384);check(request,r,data);return {'removed':await r.service.cleanup(r.p)}
    @app.post('/api/settings')
    async def settings(request:Request):
        """读取或按版本保存原工具设置文档。"""
        r=await get(request);data=await payload(request,131072);check(request,r,data)
        if not await r.service.manager(r.p):raise Error('没有管理权限',403)
        state,value=await r.service.settings()
        if not isinstance(data.get('revision'),int) or isinstance(data['revision'],bool) or data['revision']!=state['revision']:raise Error('设置已变化',409)
        value=edit(value,data)
        await r.sql.batch([Management(r.service,r.p).guard(),assertion('EXISTS(SELECT 1 FROM tool_settings WHERE id=1 AND revision=?)',(state['revision'],)),('UPDATE tool_settings SET document=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=1',(json.dumps(value),now(),r.p['uid'])),('INSERT INTO settings_audit(revision,changed_at,changed_by,action) SELECT revision,updated_at,updated_by,? FROM tool_settings WHERE id=1',('settings',))]);return {'ok':True,'revision':state['revision']+1}
    @app.get('/s/{token}')
    async def download(request:Request,token:str):
        """核验分享令牌、下载规则与次数并返回文件流。"""
        r=await get(request,False);settings,rule,rate=await r.service.policy(r.p,'receive')
        from .codes import find_share
        rows=await find_share(r.sql,token)
        rows=[row for row in rows if row['downloads']<row['max_downloads']]
        if not rows:raise Error('链接已到期、暂停或达到下载次数',404)
        row=rows[0]
        if json.loads(row['summary']).get('kind')=='folder':return RedirectResponse(base+'/?folder='+quote(token),303)
        parts=[] if r.service.indexed else json.loads(row['manifest'])['parts'];name=json.loads(row['summary'])['name'];ledger=Accounting(r.sql);member=secrets.token_hex(16)
        recovery=(await r.sql.query('SELECT updated_at FROM recovery_tasks WHERE id=?',(row['id'],)))[0];stamp=recovery['updated_at']
        lease_ms=max(180000,int(CHUNK/rate*2000) if rate else 180000)
        active="EXISTS(SELECT 1 FROM temporary_shares s JOIN recovery_tasks r ON r.id=s.id WHERE s.id=? AND s.state='ready' AND s.expires_at>? AND r.updated_at=?)"
        await r.sql.batch([assertion(active,(row['id'],ms(),stamp)),assertion('EXISTS(SELECT 1 FROM temporary_shares WHERE id=? AND downloads<max_downloads)',(row['id'],)),*ledger.reserve(r.p,row['id'],member,int(row['reserved_bytes']),'receive',settings,rule,min(row['expires_at'],ms()+lease_ms)),('UPDATE temporary_shares SET downloads=downloads+1 WHERE id=?',(row['id'],))])
        async def body():
            """逐块校验状态/版本与内容，发送前原子结算，断连释放未用预留。"""
            try:
                async def chunks():
                    if not r.service.indexed:
                        for index,part in enumerate(parts):yield part,index==len(parts)-1
                    else:
                        from .chunks import page
                        offset=0
                        while offset<int(row['reserved_bytes']):
                            batch=await page(r.sql,row['id'],offset)
                            if not batch:raise RuntimeError('Missing transfer chunks')
                            for part in batch:
                                if part['offset']!=offset:raise RuntimeError('Non-contiguous transfer chunks')
                                offset+=part['size'];yield part,offset==int(row['reserved_bytes'])
                async for part,done in chunks():
                    if r.service.indexed:await r.service.policy(r.p,'receive')
                    if not (await r.sql.query('SELECT '+active+' ok',(row['id'],ms(),stamp)))[0]['ok']:return
                    data=await r.store.get(part['key'],max_bytes=CHUNK)
                    if data is None or len(data)!=part['size'] or hashlib.sha256(data).hexdigest()!=part['sha256']:raise RuntimeError('Transfer chunk missing or corrupt')
                    remaining=len(data)/rate if rate else 0
                    while remaining>0:
                        delay=min(1,remaining);await asyncio.sleep(delay);remaining-=delay
                        if not (await r.sql.query('SELECT '+active+' ok',(row['id'],ms(),stamp)))[0]['ok']:return
                    await r.sql.batch([assertion(active,(row['id'],ms(),stamp)),*ledger.charge(row['id'],member,len(data),done),('UPDATE transfer_allowances SET expires_at=? WHERE task=? AND member=?',(min(row['expires_at'],ms()+lease_ms),row['id'],member))])
                    yield data
            finally:
                await ledger.sql.batch([ledger.release(row['id'],member)])
        return StreamingResponse(body(),media_type='application/octet-stream',headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(name),'Content-Length':row['reserved_bytes']})
    if integrated:
        from .folders import install as install_folders
        install_folders(app,get,check)
        from .receivers import install
        install(app,get,check)
        from .lan import install as install_lan
        install_lan(app,get,check)
        from .relay import install as install_relay
        install_relay(app,get,check)
        from .codes import install as install_codes
        install_codes(app,get,check)
    return app
