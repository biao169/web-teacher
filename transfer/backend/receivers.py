"""Single outstanding chunk, persistent ACK cursor, expiring quota and idempotent retries."""
import hashlib,json,re
from fastapi import Request
from fastapi.responses import Response
from backend.app.native.auth import sha
from backend.app.native.catalog import Error
from backend.app.native.web_common import payload
from .accounting import Accounting,assertion,identity,milliseconds as ms
from .chunks import one
TTL=180000

class Receiver:
    def __init__(self,r):self.r=r;self.sql=r.sql;self.service=r.service
    async def share(self,token,folder=False):
        settings,rule,rate=await self.service.policy(self.r.p,'receive')
        from .codes import find_share
        rows=await find_share(self.sql,token)
        if not rows:raise Error('分享不存在或已失效',404)
        if json.loads(rows[0]['summary']).get('kind')=='folder' and not folder:raise Error('请使用目录保存功能接收此分享',409)
        return rows[0],settings,rule,rate
    async def inspect(self,token):
        row,*_=await self.share(token,True)
        if row['downloads']>=row['max_downloads']:raise Error('下载次数已用尽',403)
        info=json.loads(row['summary'])
        return {'name':info['name'],'size':int(row['reserved_bytes']),'kind':info.get('kind','file'),'fileCount':info.get('fileCount',1),'directoryCount':info.get('directoryCount',0)}
    async def start(self,token,key,folder=False):
        if not isinstance(key,str) or not re.fullmatch('[A-Za-z0-9_-]{43}',key):raise Error('接收会话密钥无效')
        row,settings,rule,rate=await self.share(token,folder);id=sha('receive:'+key)[:32]
        if folder and json.loads(row['summary']).get('kind')!='folder':raise Error('这不是目录分享',409)
        if folder:
            from .folder_receiver import limits
            await limits(self,row,settings,rule)
        old=await self.sql.query('SELECT * FROM transfer_receivers WHERE id=?',(id,))
        if old:
            receiver=await self.load(id,key)
            if receiver['task']!=row['id']:raise Error('接收会话与分享不匹配',409)
            return self.info(receiver,row)
        expiry=min(row['expires_at'],ms()+TTL)
        await self.sql.batch([assertion("EXISTS(SELECT 1 FROM temporary_shares s JOIN recovery_tasks r ON r.id=s.id WHERE s.id=? AND s.state='ready' AND s.expires_at>? AND s.downloads<s.max_downloads AND r.updated_at=?)",(row['id'],ms(),row['updated_at'])),
            *Accounting(self.sql).reserve(self.r.p,row['id'],id,int(row['reserved_bytes']),'receive',settings,rule,expiry),
            ('INSERT INTO transfer_receivers(id,task,secret_hash,identity_key,stamp,expires_at,state) VALUES (?,?,?,?,?,?,?)',(id,row['id'],sha(key),identity(self.r.p),row['updated_at'],expiry,'active')),
            ('UPDATE temporary_shares SET downloads=downloads+1 WHERE id=?',(row['id'],))])
        return self.info((await self.sql.query('SELECT * FROM transfer_receivers WHERE id=?',(id,)))[0],row)
    def info(self,receiver,row):
        return {'id':receiver['id'],'name':json.loads(row['summary'])['name'],'size':int(row['reserved_bytes']),'kind':json.loads(row['summary']).get('kind','file'),
                'offset':receiver['offset'],'state':receiver['state'],'expires_at':receiver['expires_at'],'offered_bytes':receiver['offered_bytes']}
    async def load(self,id,key,closing=False):
        rows=await self.sql.query('SELECT * FROM transfer_receivers WHERE id=? AND secret_hash=? AND identity_key=?',(id,sha(key),identity(self.r.p)))
        if not rows:raise Error('接收会话无效',403)
        row=rows[0]
        if closing:return row
        if row['state']=='cancelled' or row['expires_at']<=ms():raise Error('接收会话已取消或超时，请重新接收',410)
        source=await self.sql.query("SELECT s.* FROM temporary_shares s JOIN recovery_tasks r ON r.id=s.id WHERE s.id=? AND s.state='ready' AND s.expires_at>? AND r.updated_at=?",(row['task'],ms(),row['stamp']))
        if not source:raise Error('原分享已停止或变化',409)
        return row
    def guard(self,row):
        return assertion("EXISTS(SELECT 1 FROM transfer_receivers v JOIN temporary_shares s ON s.id=v.task JOIN recovery_tasks r ON r.id=s.id WHERE v.id=? AND v.offset=? AND v.state='active' AND v.expires_at>? AND s.state='ready' AND s.expires_at>? AND r.updated_at=v.stamp)",(row['id'],row['offset'],ms(),ms()))
    async def status(self,id,key):
        row=await self.load(id,key);source=(await self.sql.query('SELECT * FROM temporary_shares WHERE id=?',(row['task'],)))[0]
        return self.info(row,source)
    async def read(self,id,key,offset):
        row=await self.load(id,key)
        if type(offset)!=int or row['state']!='active' or offset!=row['offset']:raise Error('请先确认上一分块，再读取下一块',409)
        settings,rule,rate=await self.service.policy(self.r.p,'receive')
        if row['not_before']>ms():raise Error('接收过快，请稍后重试',429)
        if row['attempts']>=3:raise Error('此分块重读已达3次，请取消并重新接收',409)
        part=await one(self.sql,row['task'],offset);data=await self.r.store.get(part['key'],max_bytes=1048576)
        if data is None or len(data)!=part['size'] or hashlib.sha256(data).hexdigest()!=part['sha256']:raise Error('文件分块丢失或校验失败',409)
        expiry=min((await self.sql.query('SELECT expires_at FROM temporary_shares WHERE id=?',(row['task'],)))[0]['expires_at'],ms()+max(TTL,int(1048576/rate*2000) if rate else TTL))
        charge=Accounting(self.sql).charge(row['task'],id,len(data)) if row['pending'] is None else []
        await self.sql.batch([self.guard(row),assertion('EXISTS(SELECT 1 FROM transfer_receivers WHERE id=? AND attempts=?)',(id,row['attempts'])),
            *charge,('UPDATE transfer_receivers SET pending=?,attempts=attempts+1,offered_bytes=offered_bytes+?,expires_at=?,not_before=? WHERE id=?',(offset,len(data),expiry,ms()+int(len(data)/rate*1000) if rate else 0,id)),
            ('UPDATE transfer_allowances SET expires_at=? WHERE task=? AND member=?',(expiry,row['task'],id))])
        return data,part,max(0,int(len(data)/rate*1000) if rate else 0)
    async def ack(self,id,key,offset,digest):
        row=await self.load(id,key)
        if type(offset)!=int or offset<0:raise Error('确认位置无效')
        part=await one(self.sql,row['task'],offset)
        if part['sha256']!=digest:raise Error('分块摘要不匹配',409)
        end=offset+part['size']
        if end==row['offset']:return {'offset':end,'complete':row['state']=='complete'}
        if row['offset']!=offset or row['pending']!=offset:raise Error('确认窗口不匹配',409)
        source=(await self.sql.query('SELECT reserved_bytes,expires_at,summary FROM temporary_shares WHERE id=?',(row['task'],)))[0]
        done=end==int(source['reserved_bytes']) and json.loads(source['summary']).get('kind')!='folder';expiry=min(source['expires_at'],max(row['expires_at'],ms()+TTL))
        await self.sql.batch([self.guard(row),assertion('EXISTS(SELECT 1 FROM transfer_receivers WHERE id=? AND pending=?)',(id,offset)),
            ('UPDATE transfer_receivers SET offset=?,pending=NULL,attempts=0,state=?,expires_at=? WHERE id=?',(end,'complete' if done else 'active',expiry,id)),
            *([Accounting(self.sql).release(row['task'],id)] if done else [('UPDATE transfer_allowances SET expires_at=? WHERE task=? AND member=?',(expiry,row['task'],id))])])
        return {'offset':end,'complete':done}
    async def cancel(self,id,key):
        row=await self.load(id,key,closing=True)
        await self.sql.batch([('UPDATE transfer_receivers SET state=CASE WHEN state=\'complete\' THEN state ELSE \'cancelled\' END WHERE id=?',(id,)),Accounting(self.sql).release(row['task'],id)])
        return {'ok':True}


def install(app,get,check):
    async def context(request):
        r=await get(request,False)
        if request.headers.get('origin')!=r.origin:raise Error('请求来源不正确',403)
        if r.p:check(request,r,{})
        return Receiver(r)
    @app.post('/api/share-info')
    async def inspect(request:Request):
        service=await context(request);data=await payload(request,2048);return await service.inspect(data.get('token'))
    @app.post('/api/receive')
    async def start(request:Request):
        service=await context(request);data=await payload(request,2048);
        if type(data.get('folder',False))!=bool:raise Error('目录模式无效')
        return await service.start(data.get('token'),data.get('key'),data.get('folder',False))
    @app.post('/api/receive/{id}/{action}')
    async def window(request:Request,id:str,action:str):
        service=await context(request);data=await payload(request,2048);key=request.headers.get('x-receive-key','')
        if action in ('manifest','touch','finish'):
            from .folder_receiver import operate
            return await operate(service,id,key,action,data)
        if action=='status':return await service.status(id,key)
        if action=='ack':return await service.ack(id,key,data.get('offset'),data.get('sha256'))
        if action=='cancel':return await service.cancel(id,key)
        if action=='chunk':
            raw,part,wait=await service.read(id,key,data.get('offset'))
            return Response(raw,media_type='application/octet-stream',headers={'X-Chunk-Size':str(part['size']),'X-Chunk-SHA256':part['sha256'],'X-Chunk-Offset':str(part['offset']),'X-Chunk-Wait-Ms':str(wait)})
        raise Error('接收操作不存在',404)
