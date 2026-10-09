"""Bounded folder manifests in the shared metadata store; chunks keep one task cursor.

Entry rows are ordered by ordinal. Separate canonical path keys enforce portable
uniqueness in the same transaction. Neither client paths nor names become disk keys.
"""
import json,re,unicodedata
from fastapi import Request
from backend.app.native.catalog import Error
from backend.app.native.web_common import payload
from backend.app.native.auth import sha
from .accounting import assertion,Accounting,limit,milliseconds as ms
PAGE=100
MAX_SAFE=9007199254740991

def path(value):
    if not isinstance(value,str) or not value or len(value)>1024:raise Error('目录路径无效')
    parts=value.split('/')
    if len(parts)>32:raise Error('目录最多32层')
    for part in parts:
        if not part or len(part)>255 or part in ('.','..') or re.search(r'[\x00-\x1f\x7f\\<>:"|?*]',part) or part.endswith((' ','.')) or re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?',part,re.I):raise Error('路径包含不兼容名称')
    return value

def integer(value,maximum):
    if type(value)!=int or not 0<=value<=maximum:raise Error('目录数量或大小无效')
    return value

def prefix(id):return 'folder:'+id+':'
def path_key(id,p):return prefix(id)+'p:'+sha(unicodedata.normalize('NFC',p).lower())
def entry_key(id,n):return prefix(id)+'e:'+str(n).zfill(5)

class Folders:
    def __init__(self,s,p):self.s=s;self.p=p;self.sql=s.sql
    async def create(self,data):
        if not self.s.indexed:raise Error('当前部署不支持目录任务',409)
        name=path(data.get('name'))
        if '/' in name or len(name)>200:raise Error('根目录名称最多200字且不能包含斜杠')
        files=integer(data.get('fileCount'),10000);dirs=integer(data.get('directoryCount'),2000)
        if dirs<1:raise Error('目录数量必须包含根目录')
        size=integer(data.get('size'),MAX_SAFE)
        return await self.s.create(self.p,name,size,{'kind':'folder','fileCount':files,'directoryCount':dirs,'manifestReady':False,'received':0,'manifestBytes':0,'receivedFiles':0,'receivedDirs':1})
    async def task(self,id,write=False):
        row=await self.s.task(id,self.p);info=json.loads(row['summary'])
        if info.get('kind')!='folder':raise Error('不是目录任务',409)
        if write:
            if not self.p.get('send'):raise Error('没有上传权限',403)
            await self.s.policy(self.p,'send')
            if row['state'] not in ('uploading','ready') or row['expires_at']<=ms():raise Error('目录任务已暂停或失效',409)
        return row,info
    def guard(self,row):
        return assertion("EXISTS(SELECT 1 FROM temporary_shares WHERE id=? AND summary=? AND state='uploading' AND expires_at>?)",(row['id'],row['summary'],ms()))
    async def submit(self,id,data):
        row,info=await self.task(id,True);after=integer(data.get('after'),12000);items=data.get('entries')
        if not isinstance(items,list) or not 1<=len(items)<=PAGE:raise Error('每批提交1—100项')
        settings,rule,_=await self.s.policy(self.p,'send');clean=[]
        for item in items:
            if not isinstance(item,dict) or item.get('kind') not in ('file','directory'):raise Error('目录条目无效')
            value={'kind':item['kind'],'path':path(item.get('path'))}
            if item['kind']=='file':
                value['size']=integer(item.get('size'),MAX_SAFE);value['lastModified']=integer(item.get('lastModified',0),MAX_SAFE)
                for cap in (limit(settings.get('maxFileBytes')),limit(rule.get('maxFileBytes'))):
                    if cap is not None and value['size']>cap:raise Error('目录内文件超过单文件大小限制',403)
            clean.append(value)
        if after<info['received']:
            saved=await self.sql.query('SELECT value FROM service_meta WHERE key>=? AND key<? ORDER BY key LIMIT ?',(entry_key(id,after),entry_key(id,after+len(clean)),PAGE))
            if len(saved)!=len(clean) or any({k:v for k,v in json.loads(old['value']).items() if k!='offset'}!=new for old,new in zip(saved,clean)):raise Error('该批目录内容与已确认清单不同',409)
            return {'received':info['received'],'replayed':True}
        if info['manifestReady'] or after!=info['received'] or after+len(clean)>info['fileCount']+info['directoryCount']-1:raise Error('清单位置或数量不正确',409)
        operations=[self.guard(row),assertion('EXISTS(SELECT 1 FROM tool_settings WHERE id=1 AND revision=?)',(settings['_revision'],))];seen={};records=[]
        for index,item in enumerate(clean):
            p=item['path'];key=path_key(id,p)
            if key in seen or await self.sql.query('SELECT 1 FROM service_meta WHERE key=?',(key,)):raise Error('路径重复或大小写冲突',409)
            if '/' in p:
                parent=p.rsplit('/',1)[0];pk=path_key(id,parent);old=seen.get(pk)
                if old is None:
                    rows=await self.sql.query('SELECT value FROM service_meta WHERE key=?',(pk,));old=json.loads(rows[0]['value']) if rows else None
                if not old or old['kind']!='directory' or old['path']!=parent:raise Error('请先提交对应父目录且保持名称一致',409)
            seen[key]=item.copy();records.append([key,json.dumps(item)])
            item['offset']=info['manifestBytes']
            if item['kind']=='file':info['manifestBytes']+=item['size'];info['receivedFiles']+=1
            else:info['receivedDirs']+=1
            records.append([entry_key(id,after+index),json.dumps(item)])
        info['received']+=len(clean)
        if info['manifestBytes']>int(row['reserved_bytes']) or info['receivedFiles']>info['fileCount'] or info['receivedDirs']>info['directoryCount']:raise Error('清单超出预留数量或总大小',409)
        if info['fileCount']>int(rule.get('maxFiles',1)) or (limit(rule.get('maxTaskBytes')) is not None and int(row['reserved_bytes'])>limit(rule['maxTaskBytes'])):raise Error('目录超过当前身份限制',403)
        operations.append(("INSERT INTO service_meta(key,value) SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)",(json.dumps(records),)))
        encoded=json.dumps(info);operations.extend([('UPDATE temporary_shares SET summary=? WHERE id=?',(encoded,id)),('UPDATE recovery_tasks SET summary=? WHERE id=?',(encoded,id))]);await self.sql.batch(operations)
        return {'received':info['received'],'replayed':False}
    async def seal(self,id):
        row,info=await self.task(id,True)
        if info['manifestReady']:return {'ok':True,'ready':row['state']=='ready'}
        if info['receivedFiles']!=info['fileCount'] or info['receivedDirs']!=info['directoryCount'] or info['manifestBytes']!=int(row['reserved_bytes']):raise Error('目录清单尚未完整',409)
        info['manifestReady']=True;encoded=json.dumps(info);empty=int(row['reserved_bytes'])==0
        await self.sql.batch([self.guard(row),('UPDATE temporary_shares SET summary=?,state=? WHERE id=?',(encoded,'ready' if empty else 'uploading',id)),('UPDATE recovery_tasks SET summary=?,updated_at=? WHERE id=?',(encoded,ms(),id)),*([Accounting(self.sql).release(id,'upload')] if empty else [])])
        return {'ok':True,'ready':empty}
    async def listing(self,id,after):
        row,info=await self.task(id);after=integer(after,12000)
        point=json.loads((await self.sql.query('SELECT point FROM recovery_tasks WHERE id=?',(id,)))[0]['point'])
        rows=await self.sql.query('SELECT value FROM service_meta WHERE key>=? AND key<? ORDER BY key LIMIT ?',(entry_key(id,after),prefix(id)+'f',PAGE));entries=[]
        for v in rows:
            item=json.loads(v['value']);n=item.get('size',0);confirmed=max(0,min(n,point['bytes']-item['offset']))
            item.update(confirmed=confirmed,state=('deleted' if row['state']=='deleted' else 'pending' if not info['manifestReady'] else 'complete' if confirmed==n else 'uploading' if confirmed else 'pending'));entries.append(item)
        end=after+len(entries)
        return {'name':info['name'],'kind':'folder','entries':entries,'next':end if entries and end<info['received'] else None,'received':info['received'],'manifestReady':info['manifestReady'],'fileCount':info['fileCount'],'directoryCount':info['directoryCount'],'size':int(row['reserved_bytes']),'confirmed':point['bytes'],'state':row['state'],'expired':row['expires_at']<=ms()}

def install(app,get,check):
    @app.post('/api/folders')
    async def create(request:Request):
        r=await get(request);data=await payload(request,4096);check(request,r,data);return await Folders(r.service,r.p).create(data)
    @app.post('/api/folders/{id}/manifest')
    async def submit(request:Request,id:str):
        r=await get(request);data=await payload(request,524288);check(request,r,data);return await Folders(r.service,r.p).submit(id,data)
    @app.post('/api/folders/{id}/seal')
    async def seal(request:Request,id:str):
        r=await get(request);data=await payload(request,2048);check(request,r,data);return await Folders(r.service,r.p).seal(id)
    @app.get('/api/folders/{id}/manifest')
    async def listing(request:Request,id:str):
        r=await get(request)
        try:after=int(request.query_params.get('after',0))
        except ValueError:raise Error('目录游标无效') from None
        return await Folders(r.service,r.p).listing(id,after)
