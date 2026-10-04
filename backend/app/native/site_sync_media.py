"""Signed, version-bound media ranges; reuse local/R2 inventory and upload validation."""
import base64,hashlib
from pathlib import PurePosixPath
from .catalog import Error
from .data_tools import digest
from .media_inventory_store import inventory
from .media import signature
from .site_sync_limits import for_resource,WORKER

from .site_sync_work import MEDIA_CHUNK_BYTES as CHUNK,MEDIA_FILE_BYTES as FILE_LIMIT,MEDIA_TOTAL_BYTES as TOTAL_LIMIT

def chunk_size(value=CHUNK):
    if type(value) is not int or value not in (WORKER['media_chunk_bytes'],CHUNK):
        raise Error('媒体分片大小无效，请更新两端并重新准备',409)
    return value

def negotiate(r,head):
    # No capability means the existing fixed-width protocol, including old peers.
    if head.get('adaptive_ranges')!=1:return CHUNK
    return min(for_resource(r)['media_chunk_bytes'],chunk_size(head.get('preferred_chunk_bytes')))

def chunk_key(task,index,offset):return f'site-sync/{task}/{index}/{offset}.bin'

async def serve(r,data):
    uid=data.get('uid')
    if not isinstance(uid,str) or len(uid)>120:raise Error('媒体标识无效')
    rows=await r.sql.query('SELECT * FROM media_assets WHERE uid=?',(uid,))
    if data['op']=='media-record':return {'uid':uid,'exists':bool(rows)}
    if not rows or rows[0]['storage_kind'] not in ('local','r2'):raise Error('媒体不是受管理原文件',409)
    row=rows[0];record_version=digest(row)
    if data['op'] in ('media-range','media-range-binary') and data.get('record_version')!=record_version:raise Error('来源媒体登记已变化，停止读取分片',409)
    store=inventory(r.media_store);head=await store.head(row['object_key'])
    if not head or head['size']!=row['size']:raise Error('来源媒体缺失或大小不符',409)
    if not 0<head['size']<=FILE_LIMIT:raise Error('同步单文件最多20MiB',413)
    if data['op']=='media-head':return {'uid':uid,**head,'checksum':row.get('checksum'),'record_version':record_version,'binary_ranges':1,'adaptive_ranges':1,'preferred_chunk_bytes':for_resource(r)['media_chunk_bytes']}
    width=chunk_size(data.get('chunk_bytes',CHUNK))
    offset=data.get('offset');version=data.get('version')
    if type(offset) is not int or offset<0 or offset%width or offset>=head['size'] or version!=head['version']:raise Error('媒体区间或版本无效',409)
    length=min(width,head['size']-offset)
    raw=await store.read_range(row['object_key'],offset,length,version)
    if await store.head(row['object_key'])!=head:raise Error('来源文件读取期间发生变化',409)
    if len(raw)!=length:raise Error('来源媒体分片长度不符',409)
    result={'uid':uid,'version':version,'offset':offset,'size':length,'sha256':hashlib.sha256(raw).hexdigest()}
    if data['op']=='media-range-binary':result['raw']=raw
    else:result['bytes']=base64.b64encode(raw).decode()
    return result

COMPOSE_FANOUT=4

def merged_key(task,index,width,offset,base=CHUNK):
    return chunk_key(task,index,offset) if width==base else f'site-sync/{task}/{index}/merge-{width}-{offset}.bin'

async def finalize_step(r,task,index,item):
    """One merge group, one checksum, or one publication per call."""
    from .site_sync_stream import compose,checksum
    from .media_locks import lease
    from .media_references import REFERENCE_LOCK
    e=task['state']['execution'];uid=task['uid']
    base=chunk_size(item.get('chunk_bytes',CHUNK))
    width=item.get('merge_width',base);offset=item.get('merge_offset',0)
    if width<item['size']:
        parts=[(merged_key(uid,index,width,n,base),min(width,item['size']-n)) for n in range(offset,min(offset+width*COMPOSE_FANOUT,item['size']),width)]
        await compose(r.cache_store,r.cache_store,parts,merged_key(uid,index,width*COMPOSE_FANOUT,offset,base))
        offset+=width*COMPOSE_FANOUT
        if offset>=item['size']:width*=COMPOSE_FANOUT;offset=0
        item.update(merge_width=width,merge_offset=offset);return
    key=merged_key(uid,index,width,0,base);cache=inventory(r.cache_store)
    head=await cache.head(key)
    if not head or head['size']!=item['size']:raise Error('合并暂存缺失，请取消后重新同步',409)
    if not item.get('assembled_version'):
        prefix=await cache.read_range(key,0,min(512,item['size']),head['version'])
        mime=signature(prefix,PurePosixPath(item['key']).suffix.lstrip('.').lower())
        if mime!=item['mime_type']:raise Error('媒体内容与登记类型不符',409)
        value=await checksum(r.cache_store,key,item['size'])
        if item.get('source_checksum') and value!=item['source_checksum']:raise Error('媒体整体摘要不符，未覆盖目标文件',409)
        if await cache.head(key)!=head:raise Error('合并暂存发生变化',409)
        item.update(sha256=value,assembled_version=head['version']);return
    if head['version']!=item['assembled_version']:raise Error('合并暂存已变化，未写入媒体',409)
    store=inventory(r.media_store)
    async with lease(r,REFERENCE_LOCK,'edit'):
        existing=await store.head(item['key'])
        if existing:
            if existing['size']!=item['size'] or await checksum(r.media_store,item['key'],item['size'])!=item['sha256']:
                raise Error('目标存在同名不同内容文件；未覆盖',409)
            if await store.head(item['key'])!=existing:raise Error('目标媒体发生变化',409)
            target=existing
        else:
            await compose(r.cache_store,r.media_store,[(key,item['size'])],item['key'],exclusive=True)
            target=await store.head(item['key']);item['created_version']=target['version']
        if await cache.head(key)!=head:raise Error('发布期间暂存发生变化，请重新核对',409)
        item['target_version']=target['version'];e['file_index']+=1;e['offset']=0

async def cleanup_step(r,task,index,item,budget):
    """At most budget deletes, including partially constructed merge levels."""
    base=chunk_size(item.get('chunk_bytes',CHUNK))
    e=task['state']['execution'];width=e.get('cleanup_width',base);offset=e['cleanup_offset'];used=0
    maximum=base
    while maximum<item['size']:maximum*=COMPOSE_FANOUT
    while width<=maximum and used<budget:
        await r.cache_store.delete(merged_key(task['uid'],index,width,offset,base));used+=1;offset+=width
        if offset>=item['size']:width*=COMPOSE_FANOUT;offset=0
    e.update(cleanup_width=width,cleanup_offset=offset)
    return width>maximum
