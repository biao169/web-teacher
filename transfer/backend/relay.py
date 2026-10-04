"""Same-site online HTTPS relay: one retained block per bounded room, no disk payload."""
from .origins import check_origin
import asyncio,hashlib,re,secrets,time,os
from fastapi import Request
from fastapi.responses import Response
from backend.app.native.catalog import Error
from backend.app.native.web import payload
from .lan import identity,valid_key
from .identity import permission
from .settings import select_rule
from .live_folders import Manifest,Budget,app_budget,specification,check_limits
from .accounting import Accounting,assertion,limit,milliseconds
from .resources import CHUNK,read_chunk
TTL=180

async def policy(r,p,side,size,folder=None):
    if p:
        clause,args=permission(p,'create' if side=='send' else 'view')
        if not (await r.sql.query('SELECT '+clause+' ok',args))[0]['ok']:raise Error('登录或快传权限已失效',403)
        rows=await r.sql.query('SELECT role_uid FROM auth_users WHERE uid=?',(p['uid'],))
        p={**p,'role_id':rows[0]['role_uid']}
    state,settings=await r.service.settings();settings['_revision']=state['revision'];rule=select_rule(settings,p)
    if not settings.get('enabled') or not settings.get('wanEnabled',True) or not settings.get('relayEnabled'):raise Error('广域网在线中转未启用',403)
    if settings.get('vpnGuard'):raise Error('VPN计量保护尚未核验，暂不放行中转',503)
    if not settings.get('allowUploads' if side=='send' else 'allowDownloads',True) or not rule.get(side) or 'wan-relay' not in rule.get('links',[]):raise Error('当前身份未获准使用此方向的在线中转',403)
    check_limits(settings,rule,size,folder)
    rate=rule.get('wanRateKbps') or settings.get('wanRateKbps')
    return settings,rule,float(rate)*1000/8 if rate else None

class Relay:
    def __init__(self,slots=None,clock=time.monotonic,budget=None):
        self.budget=budget or Budget()
        self.limit=int(slots or os.environ.get('TRANSFER_RELAY_ROOMS','4'))
        if not 1<=self.limit<=8:raise ValueError('TRANSFER_RELAY_ROOMS must be 1..8')
        self.rooms={};self.lock=asyncio.Lock();self.clock=clock;self.retained=0;self.peak=0
    def drop(self,code):
        row=self.rooms.pop(code,None)
        if row:
            if row.get('folder'):row['folder'].release()
            if row['block']:self.retained-=len(row['block']['data'])
            row['timer'].cancel()
    def sweep(self):
        for code,row in list(self.rooms.items()):
            if min(p['expires'] for p in row['peers'].values())<=self.clock():self.drop(code)
    def expire(self):
        if self.lock.locked():asyncio.get_running_loop().call_later(1,self.expire)
        else:self.sweep()
    def arm(self,code,row):
        if row.get('timer'):row['timer'].cancel()
        row['timer']=asyncio.get_running_loop().call_later(max(.01,min(p['expires'] for p in row['peers'].values())-self.clock()),self.expire)
    def count(self,p):return sum(any(identity(peer['p'])==identity(p) for peer in row['peers'].values()) for row in self.rooms.values())
    def peer(self,p,key):return {'p':p,'key':key,'expires':self.clock()+TTL}
    def view(self,code,row,side):
        block=row['block']
        return {**(row['folder'].view() if row.get('folder') else {'kind':'file'}),'code':code,'role':side,'name':row['name'],'size':row['size'],'paired':'receive' in row['peers'],
                'ready':row['ready'],'offset':row['offset'],'pending':bool(block),'saved':row['saved'],
                'wait_ms':max(0,int((row['next']-self.clock())*1000)),'lease_seconds':TTL,
                'accepted_bytes':row['accepted'],'offered_bytes':row['offered'],'chunk_size':CHUNK}
    async def release(self,r,code):
        # The raw database permits releasing unused reservations even after logout.
        sql=getattr(r.sql,'sql',r.sql)
        await sql.batch([Accounting(sql).release('relay:'+code)])
    async def act(self,r,op,data,body=None):
        # Complete commit + in-memory transition before releasing the lock on disconnect.
        async with self.lock:
            task=asyncio.create_task(self._act(r,op,data,body))
            try:return await asyncio.shield(task)
            except asyncio.CancelledError:
                try:await task
                finally:raise
    async def _act(self,r,op,data,body):
        self.sweep()
        fields={'create':{'key','name','size'},'join':{'key','code'},'status':{'key','code'},'ready':{'key','code'},'cancel':{'key','code'},'saved':{'key','code'},'ack':{'key','code','offset','sha256'},'chunk':{'key','code','offset'}}
        if op=='create' and isinstance(data,dict) and 'folder' in data:fields['create']=fields['create']|{'folder'}
        fields.update(manifest={'key','code','after'}|({'entries'} if isinstance(data,dict) and 'entries' in data else set()),seal={'key','code'})
        if op not in fields or not isinstance(data,dict) or set(data)!=fields[op]:raise Error('中转请求字段无效')
        key=valid_key(data['key'])
        if op=='create':
            name,size=data['name'],data['size']
            if not isinstance(name,str) or not 1<=len(name)<=200 or any(ord(c)<32 or 0xD800<=ord(c)<=0xDFFF or c in '/\\' for c in name):raise Error('文件名无效')
            if type(size)!=int or not (0 if 'folder' in data else 1)<=size<=9007199254740991:raise Error('文件大小无效')
            header=specification(data);folder=Manifest(name,size,header,self.budget) if header else None
            _,rule,_=await policy(r,r.p,'send',size,folder)
            for code,row in self.rooms.items():
                peer=row['peers']['send']
                if identity(peer['p'])==identity(r.p) and secrets.compare_digest(peer['key'],key):
                    if row['name']!=name or row['size']!=size or (row['folder'].header if row.get('folder') else None)!=header:raise Error('创建凭证已经使用',409)
                    return self.view(code,row,'send')
            if len(self.rooms)>=self.limit or self.count(r.p)>=int(rule.get('concurrency') or 1):raise Error('在线中转会话已满，请稍后重试',429)
            code=secrets.token_hex(16)
            row={'name':name,'size':size,'folder':folder,'peers':{'send':self.peer(r.p,key)},'ready':False,'offset':0,'block':None,'last':None,'saved':False,'next':0,'accepted':0,'offered':0,'sequence':0}
            self.rooms[code]=row;self.arm(code,row);return self.view(code,row,'send')
        code=data['code']
        if not isinstance(code,str) or not re.fullmatch('[a-f0-9]{32}',code) or code not in self.rooms:raise Error('中转会话已过期或服务已重启，请重新配对',410)
        row=self.rooms[code]
        if op=='join':
            if row.get('folder') and not row['folder'].sealed:raise Error('发送方目录清单尚未完成',409)
            _,rule,_=await policy(r,r.p,'receive',row['size'],row.get('folder'));await policy(r,row['peers']['send']['p'],'send',row['size'],row.get('folder'))
            peer=row['peers'].get('receive')
            if peer:
                if identity(peer['p'])!=identity(r.p) or not secrets.compare_digest(peer['key'],key):raise Error('已被其他接收方配对',409)
            else:
                if key==row['peers']['send']['key']:raise Error('收发凭证必须不同')
                if self.count(r.p)-int(identity(row['peers']['send']['p'])==identity(r.p))>=int(rule.get('concurrency') or 1):raise Error('当前身份中转会话已满',429)
                row['peers']['receive']=self.peer(r.p,key)
            self.arm(code,row);return self.view(code,row,'receive')
        side=next((s for s,p in row['peers'].items() if identity(p['p'])==identity(r.p) and secrets.compare_digest(p['key'],key)),None)
        if not side:raise Error('没有此中转会话权限',403)
        if op=='cancel':
            self.drop(code);await self.release(r,code);return {'cancelled':True}
        rules={}
        try:
            for s,peer in row['peers'].items():rules[s]=await policy(r,peer['p'],s,row['size'],row.get('folder'))
        except Error:
            self.drop(code);await self.release(r,code);raise
        row['peers'][side]['expires']=self.clock()+TTL;self.arm(code,row)
        expiry=milliseconds()+max(1,int((min(p['expires'] for p in row['peers'].values())-self.clock())*1000))
        ledger=Accounting(r.sql);task='relay:'+code
        guards=[assertion(*permission(peer['p'],'create' if s=='send' else 'view')) for s,peer in row['peers'].items() if peer['p']]
        guards += [assertion('EXISTS(SELECT 1 FROM tool_settings WHERE id=1 AND revision=?)',(revision,)) for revision in {value[0]['_revision'] for value in rules.values()}]
        if row['ready']:
            await r.sql.batch([*guards,('UPDATE transfer_allowances SET expires_at=? WHERE task=? AND finished_at IS NULL',(expiry,task))])
        if op in ('manifest','seal'):
            if not row.get('folder'):raise Error('不是目录配对',409)
            return row['folder'].operate(side,op,data)
        if op=='status':return self.view(code,row,side)
        if op=='ready':
            if side!='receive':raise Error('请等待接收方选择保存位置',403)
            if not row['ready']:
                statements=[*guards]
                for s in ('send','receive'):
                    settings,rule,_=rules[s]
                    if s=='send':
                        from .accounting import identity as account_identity
                        statements.append(assertion("(SELECT count(*) FROM transfer_allowances WHERE identity_key=? AND kind='send' AND finished_at IS NULL AND expires_at>?)<?",(account_identity(row['peers'][s]['p']),milliseconds(),int(rule.get('concurrency') or 1))))
                    statements+=ledger.reserve(row['peers'][s]['p'],task,s,row['size'],s,settings,rule,expiry)
                await r.sql.batch(statements);row['ready']=True
            return self.view(code,row,side)
        if not row['ready']:raise Error('接收方尚未准备保存',409)
        if op=='saved':
            if side!='receive' or row['offset']!=row['size']:raise Error('接收尚未完成',409)
            await r.sql.batch([*guards,ledger.release(task)]);row['saved']=True
            return self.view(code,row,side)
        if op=='ack':
            if side!='receive':raise Error('只有接收方可以确认',403)
            if row['last'] and data['offset']==row['last']['offset'] and data['sha256']==row['last']['sha256']:return self.view(code,row,side)
            block=row['block']
            if not block or not block['reads'] or data['offset']!=row['offset'] or data['sha256']!=block['sha256']:raise Error('确认位置或摘要不匹配',409)
            row['last']={'offset':row['offset'],'sha256':block['sha256'],'size':len(block['data'])}
            row['offset']+=len(block['data']);self.retained-=len(block['data']);row['block']=None
            return self.view(code,row,side)
        offset=data['offset']
        if type(offset)!=int or offset<0:raise Error('分块位置无效')
        if self.clock()<row['next']:raise Error('中转速率限制，请按返回的等待时间重试',429)
        settings,rule,rate=rules[side]
        block=row['block']
        if side=='send':
            if body is None or not 1<=len(body)<=CHUNK or offset+len(body)>row['size']:raise Error('分块大小无效',413)
            digest=hashlib.sha256(body).hexdigest()
            if offset!=row['offset']:
                if row['last'] and offset==row['last']['offset'] and len(body)==row['last']['size'] and digest==row['last']['sha256']:
                    raise Error('此块已确认，请读取会话进度后继续',409)
                raise Error('分块位置不匹配',409)
            if block and (digest!=block['sha256'] or len(body)!=len(block['data'])):raise Error('待确认分块内容不同',409)
            attempts=block['uploads'] if block else 0
            if attempts>=3:raise Error('分块发送重试次数已达上限',409)
            if block:await self.retry_charge(r,row,task,side,len(body),settings,rule,expiry,guards)
            else:
                await r.sql.batch([*guards,*ledger.charge(task,'send',len(body))])
                row['block']=block={'data':body,'sha256':digest,'reads':0,'uploads':0}
                self.retained+=len(body);self.peak=max(self.peak,self.retained)
            block['uploads']+=1;row['accepted']+=len(body)
            row['next']=self.clock()+len(body)/rate if rate else 0
            return self.view(code,row,side)
        if body:raise Error('接收请求不能包含文件正文')
        if offset!=row['offset']:raise Error('接收位置不匹配，请核对确认结果',409)
        if not block:raise Error('等待发送方的下一块',425)
        if block['reads']>=3:raise Error('分块读取重试次数已达上限',409)
        if block['reads']:await self.retry_charge(r,row,task,side,len(block['data']),settings,rule,expiry,guards)
        else:await r.sql.batch([*guards,*ledger.charge(task,'receive',len(block['data']))])
        block['reads']+=1;row['offered']+=len(block['data']);row['next']=self.clock()+len(block['data'])/rate if rate else 0
        return Response(block['data'],media_type='application/octet-stream',headers={'X-Chunk-Offset':str(offset),'X-Chunk-Size':str(len(block['data'])),'X-Chunk-SHA256':block['sha256'],'X-Chunk-Wait-Ms':str(max(0,int((row['next']-self.clock())*1000))),'X-Accel-Buffering':'no'})
    async def retry_charge(self,r,row,task,side,size,settings,rule,expiry,guards):
        ledger=Accounting(r.sql);member='retry:'+str(row['sequence'])
        await r.sql.batch([*guards,*ledger.reserve(row['peers'][side]['p'],task,member,size,'retry',settings,rule,expiry),*ledger.charge(task,member,size,True)])
        row['sequence']+=1

def install(app,get,check):
    relay=Relay(budget=app_budget(app));app.state.online_relay=relay;active=0
    async def context(request):
        r=await get(request,False)
        if r.p:check(request,r,{})
        else:check_origin(request,r)
        return r
    @app.post('/api/relay/chunk')
    async def chunk(request:Request):
        r=await context(request)
        try:offset=int(request.headers.get('x-offset',''))
        except ValueError:raise Error('分块位置无效')
        body=await read_chunk(request)
        return await relay.act(r,'chunk',{'code':request.headers.get('x-relay-code',''),'key':request.headers.get('x-relay-key',''),'offset':offset},body)
    @app.post('/api/relay/{op}')
    async def action(op:str,request:Request):
        nonlocal active
        if active>=16:raise Error('中转控制繁忙，请稍后重试',503)
        active+=1
        try:
            r=await context(request)
            try:data=await asyncio.wait_for(payload(request,524288 if op=='manifest' else 4096),10)
            except TimeoutError:raise Error('中转控制请求超时',408)
            return await relay.act(r,op,data)
        finally:active-=1
