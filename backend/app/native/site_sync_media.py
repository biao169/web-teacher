"""Signed, version-bound media ranges; reuse local/R2 inventory and upload validation."""
import base64,hashlib
from pathlib import PurePosixPath
from .catalog import Error
from . import site_sync as core
from .media_inventory_store import inventory
from .media import signature

CHUNK=262144
FILE_LIMIT=20*1024*1024
TOTAL_LIMIT=24*1024*1024

def chunk_key(task,index,offset):return f'site-sync/{task}/{index}/{offset}.bin'

async def serve(r,data):
    if data.get('revision')!=await core.revision(r.sql):raise Error('来源数据已变化，请重新预览',409)
    uid=data.get('uid')
    if not isinstance(uid,str) or len(uid)>120:raise Error('媒体标识无效')
    rows=await r.sql.query('SELECT * FROM media_assets WHERE uid=?',(uid,))
    if not rows or rows[0]['storage_kind'] not in ('local','r2'):raise Error('媒体不是受管理原文件',409)
    row=rows[0];store=inventory(r.media_store);head=await store.head(row['object_key'])
    if not head or head['size']!=row['size']:raise Error('来源媒体缺失或大小不符',409)
    if not 0<head['size']<=FILE_LIMIT:raise Error('同步单文件最多20MiB',413)
    if data['op']=='media-head':return {'uid':uid,**head,'checksum':row.get('checksum')}
    offset=data.get('offset');version=data.get('version')
    if type(offset) is not int or offset<0 or offset%CHUNK or offset>=head['size'] or version!=head['version']:raise Error('媒体区间或版本无效',409)
    length=min(CHUNK,head['size']-offset);parts=[]
    # Local inventory uses 64KiB reads, R2 accepts the same safe bound.
    for n in range(offset,offset+length,65536):parts.append(await store.read_range(row['object_key'],n,min(65536,offset+length-n),version))
    raw=b''.join(parts)
    if await store.head(row['object_key'])!=head:raise Error('来源文件读取期间发生变化',409)
    return {'uid':uid,'version':version,'offset':offset,'size':length,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':base64.b64encode(raw).decode()}

async def assemble(r,task,index,item):
    raw=bytearray()
    for offset in range(0,item['size'],CHUNK):
        part=await r.cache_store.get(chunk_key(task,index,offset),CHUNK)
        if part is None or len(part)!=min(CHUNK,item['size']-offset):raise Error('暂存分片缺失，请取消后重新同步',409)
        raw.extend(part)
    checksum=hashlib.sha256(raw).hexdigest()
    if item.get('source_checksum') and checksum!=item['source_checksum']:raise Error('媒体整体摘要不符，未覆盖目标文件',409)
    mime=signature(raw,PurePosixPath(item['key']).suffix.lstrip('.').lower())
    if not mime or mime!=item['mime_type']:raise Error('媒体内容与扩展名或登记类型不符',409)
    return raw,checksum
