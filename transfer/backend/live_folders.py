"""Ephemeral bounded folder metadata shared by LAN signaling and online relay.

Store serialized pages, not Python entry trees. Validation builds at most one
folder's path index at seal time. No file bodies or metadata are written to disk.
"""
import json,unicodedata
from backend.app.native.catalog import Error
from .folders import path as base_path,integer,PAGE,MAX_SAFE
from .accounting import limit
def path(value):
    value=base_path(value)
    if any(0xD800<=ord(c)<=0xDFFF for c in value):raise Error('路径包含无效Unicode字符')
    return value

PER_FOLDER=2*1024*1024
TOTAL=8*1024*1024

class Budget:
    def __init__(self,maximum=TOTAL):self.maximum=maximum;self.used=0

def app_budget(app):
    if not hasattr(app.state,'folder_manifest_budget'):app.state.folder_manifest_budget=Budget()
    return app.state.folder_manifest_budget

def specification(data):
    if 'folder' not in data:return None
    f=data['folder']
    if not isinstance(f,dict) or set(f)!={'fileCount','directoryCount','maxFileBytes'}:raise Error('目录描述字段无效')
    files=integer(f['fileCount'],10000);dirs=integer(f['directoryCount'],2000);largest=integer(f['maxFileBytes'],MAX_SAFE)
    if dirs<1 or largest>data['size'] or (not files and (data['size'] or largest)):raise Error('目录数量或总大小无效')
    name=path(data['name'])
    if '/' in name:raise Error('根目录名称无效')
    return {'fileCount':files,'directoryCount':dirs,'maxFileBytes':largest}

def check_limits(settings,rule,size,folder=None):
    header=folder.header if folder else None
    count=header['fileCount'] if header else 1;largest=header['maxFileBytes'] if header else size
    for value in (settings.get('maxFileBytes'),rule.get('maxFileBytes')):
        cap=limit(value)
        if cap is not None and largest>cap:raise Error('文件超过后台单文件大小限制',403)
    cap=limit(rule.get('maxTaskBytes'))
    if cap is not None and size>cap:raise Error('任务超过后台总大小限制',403)
    if count>int(rule.get('maxFiles',1)):raise Error('文件数量超过后台限制',403)

class Manifest:
    def __init__(self,name,size,header,budget):
        self.name,self.size,self.header,self.budget=name,size,header,budget
        self.pages=[];self.count=0;self.bytes=0;self.files=0;self.dirs=1;self.largest=0;self.sealed=False;self.storage=0
    def release(self):
        self.budget.used-=self.storage;self.storage=0;self.pages.clear()
    def __del__(self):self.release()
    def view(self):return {'kind':'folder',**self.header,'manifestReady':self.sealed}
    def submit(self,after,entries):
        integer(after,12000)
        if after%PAGE or not isinstance(entries,list) or not 1<=len(entries)<=PAGE:raise Error('目录每批最多100项，请按分页位置提交')
        clean=[];offset=self.bytes if after==self.count else (json.loads(self.pages[after//PAGE])['entries'][0]['offset'] if after//PAGE<len(self.pages) else 0)
        files=dirs=largest=0
        for entry in entries:
            if not isinstance(entry,dict) or entry.get('kind') not in ('file','directory'):raise Error('目录条目无效')
            item={'kind':entry['kind'],'path':path(entry.get('path')),'offset':offset}
            if item['kind']=='file':
                size=integer(entry.get('size'),MAX_SAFE);item.update(size=size,lastModified=integer(entry.get('lastModified',0),MAX_SAFE));offset+=size;files+=1;largest=max(largest,size)
            else:dirs+=1
            clean.append(item)
        page_bytes=sum(e.get('size',0) for e in clean)
        encoded=json.dumps({'entries':clean,'bytes':page_bytes},ensure_ascii=False,separators=(',',':')).encode()
        if after<self.count:
            if after//PAGE>=len(self.pages) or encoded!=self.pages[after//PAGE]:raise Error('该批目录内容已变化',409)
            return {'received':self.count,'replayed':True}
        total=self.header['fileCount']+self.header['directoryCount']-1
        if self.sealed or after!=self.count or after+len(clean)>total or (len(clean)<PAGE and after+len(clean)!=total):raise Error('目录分页位置不正确',409)
        if self.files+files>self.header['fileCount'] or self.dirs+dirs>self.header['directoryCount'] or self.bytes+page_bytes>self.size or largest>self.header['maxFileBytes']:raise Error('清单超过声明的大小或数量',409)
        if self.storage+len(encoded)>PER_FOLDER or self.budget.used+len(encoded)>self.budget.maximum:raise Error('在线目录清单内存额度不足，请减少目录项或使用临时缓存模式',413)
        self.pages.append(encoded);self.storage+=len(encoded);self.budget.used+=len(encoded);self.count+=len(clean);self.files+=files;self.dirs+=dirs;self.bytes+=page_bytes;self.largest=max(self.largest,largest)
        return {'received':self.count,'replayed':False}
    def seal(self):
        if self.sealed:return
        if self.files!=self.header['fileCount'] or self.dirs!=self.header['directoryCount'] or self.bytes!=self.size or self.largest!=self.header['maxFileBytes']:raise Error('目录清单尚未完整',409)
        seen={}
        for raw in self.pages:
            for e in json.loads(raw)['entries']:
                p=e['path'];key=unicodedata.normalize('NFC',p).lower()
                if key in seen:raise Error('目录路径重复或大小写冲突',409)
                if '/' in p:
                    parent=p.rsplit('/',1)[0];old=seen.get(unicodedata.normalize('NFC',parent).lower())
                    if not old or old!=('directory',parent):raise Error('父目录缺失或名称不一致',409)
                seen[key]=(e['kind'],p)
        self.sealed=True
    def read(self,after):
        integer(after,12000)
        if not self.sealed or after%PAGE or after>self.count:raise Error('目录未封存或分页位置无效',409)
        entries=json.loads(self.pages[after//PAGE])['entries'] if after//PAGE<len(self.pages) else []
        end=after+len(entries)
        return {'name':self.name,'size':self.size,**self.header,'entries':entries,'total':self.count,'next':end if end<self.count else None}
    def operate(self,side,op,data):
        if op=='seal':
            if side!='send':raise Error('只有发送方可以封存目录',403)
            self.seal();return {'manifestReady':True}
        if 'entries' in data:
            if side!='send':raise Error('只有发送方可以提交目录',403)
            return self.submit(data['after'],data['entries'])
        if side!='receive':raise Error('只有接收方可以读取目录',403)
        return self.read(data['after'])
