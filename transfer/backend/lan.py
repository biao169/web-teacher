"""Bounded, ephemeral same-origin signaling. Never accepts or stores file bodies.

One process owns rooms, intentionally lost on restart. Settings and identity use
main SQL. Each side renews its own lease; a peer cannot keep an absent side alive.
"""
import asyncio,re,secrets,time
from fastapi import Request
from backend.app.native.catalog import Error
from backend.app.native.web_common import payload
from .settings import select_rule
from .live_folders import Manifest,Budget,app_budget,specification,check_limits
from .accounting import limit
from .identity import permission

TTL=180
MAX_ROOMS=64
MAX_SDP=32768
KEY=re.compile(r'^[A-Za-z0-9_-]{43}$')

def identity(p):return p['uid'] if p else 'anonymous'
def valid_key(key):
    if not isinstance(key,str) or not KEY.fullmatch(key):raise Error('配对凭证无效',403)
    return key

def description(value,kind):
    if not isinstance(value,dict) or set(value)!={'type','sdp'} or value['type']!=kind:raise Error('连接描述无效')
    sdp=value['sdp']
    if not isinstance(sdp,str) or len(sdp.encode())>MAX_SDP or not sdp.startswith('v=0\r\n'):raise Error('连接描述过长或无效')
    lines=sdp.splitlines()
    if sum(x.startswith('m=') for x in lines)!=1 or not any(x.startswith('m=application ') and ' webrtc-datachannel' in x for x in lines):raise Error('只允许文件数据通道')
    if not any(x.startswith('a=fingerprint:sha-256 ') for x in lines):raise Error('缺少连接指纹')
    # No STUN/TURN routes; host-only does not prove physical LAN (VPN may exist).
    if any(' typ ' in x and ' typ host' not in x for x in lines if x.startswith('a=candidate:')):raise Error('本模式只允许本机候选地址')
    if any(x.startswith(('a=ice-server:','a=remote-candidates:')) for x in lines):raise Error('连接描述不支持此路由')
    return {'type':kind,'sdp':sdp}

async def policy(r,p,action,size,folder=None):
    if p:
        clause,args=permission(p,'create' if action=='send' else 'view')
        if not (await r.sql.query('SELECT '+clause+' ok',args))[0]['ok']:raise Error('登录或快传权限已失效',403)
    # A role may change while a room is open; reselect its current rule.
    if p:
        rows=await r.sql.query('SELECT role_uid FROM auth_users WHERE uid=?',(p['uid'],))
        p={**p,'role_id':rows[0]['role_uid']}
    _,settings=await r.service.settings();rule=select_rule(settings,p)
    if not settings.get('enabled') or not settings.get('lanEnabled',False):raise Error('局域网直连尚未启用',403)
    if settings.get('vpnGuard'):raise Error('VPN路径保护尚未核验，请联系管理员',503)
    if not settings.get('allowUploads' if action=='send' else 'allowDownloads',True) or not rule.get(action) or 'lan-direct' not in rule.get('links',[]):raise Error('当前身份未获准使用此方向的局域网直连',403)
    check_limits(settings,rule,size,folder)
    # Existing byte quotas are server-enforced for cached traffic. Direct file bytes
    # cannot be measured here; never silently bypass configured quota protection.
    caps=[settings.get('total'+period[0].upper()+period[1:]+'Bytes') for period in ('daily','weekly','monthly')]
    caps += [rule.get(p+'Bytes') for p in ('daily','weekly','monthly')]
    if not p:caps += [settings.get('guest'+x[0].upper()+x[1:]+'Bytes') for x in ('daily','weekly','monthly')]
    if any(limit(x) is not None for x in caps):raise Error('当前启用了流量硬配额；直连无法由服务器核实文件字节，请使用临时分享',403)
    concurrency=min(8,int(rule.get('concurrency') or settings.get('guestConcurrency',2)))
    rate=rule.get('lanRateKbps') or settings.get('lanRateKbps')
    return concurrency,float(rate)*1000/8 if rate else None

class Rooms:
    def __init__(self,clock=time.monotonic,budget=None):self.rooms={};self.lock=asyncio.Lock();self.clock=clock;self.budget=budget or Budget()
    def sweep(self):
        at=self.clock()
        for code,row in list(self.rooms.items()):
            if any(peer['expires']<=at for peer in row['peers'].values()):self.drop(code)
    def drop(self,code):
        row=self.rooms.pop(code,None)
        if row:
            if row.get('folder'):row['folder'].release()
            if row.get('timer'):row['timer'].cancel()
    def expire(self):
        if self.lock.locked():asyncio.get_running_loop().call_later(1,self.expire)
        else:self.sweep()
    def arm(self,row):
        if row.get('timer'):row['timer'].cancel()
        row['timer']=asyncio.get_running_loop().call_later(max(.01,min(p['expires'] for p in row['peers'].values())-self.clock()),self.expire)
    def peer(self,p,key):return {'p':p,'key':key,'expires':self.clock()+TTL,'next':{'poll':0,'signal':0}}
    def count(self,p):return sum(any(identity(peer['p'])==identity(p) for peer in row['peers'].values()) for row in self.rooms.values())
    async def act(self,r,op,data):
        if not isinstance(data,dict):raise Error('请求格式无效')
        fields={'create':{'key','name','size'},'join':{'key','code'},'poll':{'key','code'},'signal':{'key','code','description'},'cancel':{'key','code'}}
        if op=='create' and isinstance(data,dict) and 'folder' in data:fields['create']=fields['create']|{'folder'}
        fields.update(manifest={'key','code','after'}|({'entries'} if isinstance(data,dict) and 'entries' in data else set()),seal={'key','code'})
        if op not in fields or set(data)!=fields[op]:raise Error('请求字段无效')
        key=valid_key(data['key'])
        async with self.lock:
            self.sweep()
            if op=='create':
                name,size=data['name'],data['size']
                if not isinstance(name,str) or not 1<=len(name)<=200 or any(ord(x)<32 or x in '/\\' for x in name):raise Error('文件名无效')
                if type(size)!=int or not (0 if 'folder' in data else 1)<=size<=9007199254740991:raise Error('文件大小无效')
                header=specification(data);folder=Manifest(name,size,header,self.budget) if header else None
                concurrency,rate=await policy(r,r.p,'send',size,folder)
                for code,row in self.rooms.items():
                    peer=row['peers']['send']
                    if peer['key']==key and identity(peer['p'])==identity(r.p):
                        if row['name']!=name or row['size']!=size or (row['folder'].header if row.get('folder') else None)!=header:raise Error('创建凭证已使用',409)
                        return self.view(code,row,'send')
                if len(self.rooms)>=MAX_ROOMS or self.count(r.p)>=concurrency:raise Error('直连会话数已满，请取消旧会话或等待过期',429)
                code=secrets.token_hex(16)
                row={'name':name,'size':size,'folder':folder,'rate':rate,'peers':{'send':self.peer(r.p,key)},'signals':{}}
                self.rooms[code]=row;self.arm(row)
                return self.view(code,row,'send')
            code=data['code']
            if not isinstance(code,str) or not re.fullmatch('[a-f0-9]{32}',code) or code not in self.rooms:raise Error('配对不存在或已过期，请重新配对',410)
            row=self.rooms[code]
            if op=='join':
                if row.get('folder') and not row['folder'].sealed:raise Error('发送方目录清单尚未完成',409)
                concurrency,rate=await policy(r,r.p,'receive',row['size'],row.get('folder'))
                await policy(r,row['peers']['send']['p'],'send',row['size'],row.get('folder'))
                existing=row['peers'].get('receive')
                if existing:
                    if not secrets.compare_digest(existing['key'],key) or identity(existing['p'])!=identity(r.p):raise Error('配对已被另一接收方使用',409)
                else:
                    existing_owner=identity(row['peers']['send']['p'])==identity(r.p)
                    if self.count(r.p)-int(existing_owner)>=concurrency:raise Error('直连会话数已满',429)
                    if key==row['peers']['send']['key']:raise Error('收发凭证必须不同')
                    row['peers']['receive']=self.peer(r.p,key)
                    if rate:row['rate']=min(row['rate'],rate) if row['rate'] else rate
                return self.view(code,row,'receive')
            role=next((role for role,peer in row['peers'].items() if secrets.compare_digest(peer['key'],key) and identity(peer['p'])==identity(r.p)),None)
            if not role:raise Error('没有此配对权限',403)
            if op=='cancel':self.drop(code);return {'cancelled':True}
            try:
                for side,peer in row['peers'].items():await policy(r,peer['p'],side,row['size'],row.get('folder'))
            except Error:
                self.drop(code);raise
            if op in ('manifest','seal'):
                if not row.get('folder'):raise Error('不是目录配对',409)
                row['peers'][role]['expires']=self.clock()+TTL;self.arm(row)
                return row['folder'].operate(role,op,data)
            peer=row['peers'][role];at=self.clock()
            if at<peer['next'][op]:raise Error('查询过快',429)
            peer['next'][op]=at+.2;peer['expires']=at+TTL;self.arm(row)
            if op=='signal':
                desc=description(data['description'],'offer' if role=='send' else 'answer')
                if role=='receive' and 'send' not in row['signals']:raise Error('请等待发送方准备连接',409)
                if role in row['signals'] and row['signals'][role]!=desc:raise Error('连接描述已提交，请重新配对',409)
                row['signals'][role]=desc
            return self.view(code,row,role)
    def view(self,code,row,role):
        return {**(row['folder'].view() if row.get('folder') else {'kind':'file'}),'code':code,'name':row['name'],'size':row['size'],'rate':row['rate'],'role':role,
                'paired':'receive' in row['peers'],'description':row['signals'].get('receive' if role=='send' else 'send'),
                'lease_seconds':TTL,'server_file_bytes':0}

def install(app,get,check):
    rooms=Rooms(budget=app_budget(app));app.state.lan_rooms=rooms
    active=0
    @app.post('/api/lan/{op}')
    async def action(op:str,request:Request):
        nonlocal active
        if active>=16:raise Error('连接协商繁忙，请稍后重试',503)
        active+=1
        try:return await process(op,request)
        finally:active-=1
    async def process(op,request):
        r=await get(request,False)
        if request.headers.get('origin')!=r.origin:raise Error('请求来源无效',403)
        if r.p:check(request,r,{})
        try:data=await asyncio.wait_for(payload(request,524288 if op=='manifest' else 49152),10)
        except asyncio.TimeoutError:raise Error('配对请求超时',408)
        return await rooms.act(r,op,data)
