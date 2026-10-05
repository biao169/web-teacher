"""Signed, version-bound media ranges; reuse local/R2 inventory and upload validation."""
import base64,hashlib
from pathlib import PurePosixPath
from .catalog import Error
from .data_tools import digest
from .media_inventory_store import inventory
from .media import signature
from .site_sync_limits import for_resource,WORKER,MEDIA_WIDTHS

from .site_sync_work import MEDIA_CHUNK_BYTES as CHUNK,MEDIA_FILE_BYTES as FILE_LIMIT,MEDIA_TOTAL_BYTES as TOTAL_LIMIT

def chunk_size(value=CHUNK):
    if type(value) is not int or value not in MEDIA_WIDTHS:
        raise Error('媒体分片大小无效，请更新两端并重新准备',409)
    return value

def negotiate(r,head):
    # No capability means the existing fixed-width protocol, including old peers.
    if head.get('adaptive_ranges')!=1:return CHUNK
    preferred=chunk_size(head.get('preferred_chunk_bytes'))
    # An old adaptive peer only understands 16/64 KiB. New widths require advertisement.
    supported=head.get('supported_chunk_bytes')
    common=[n for n in supported if type(n) is int and n in MEDIA_WIDTHS] if isinstance(supported,list) else [16384,CHUNK]
    target=min(for_resource(r)['media_chunk_bytes'],preferred)
    allowed=[n for n in common if n<=target]
    if allowed:return max(allowed)
    if common:return min(common)
    raise Error('对端没有兼容的媒体分片大小，请更新两端',409)

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
    if data['op']=='media-head':return {'uid':uid,**head,'checksum':row.get('checksum'),'record_version':record_version,'binary_ranges':1,'adaptive_ranges':1,'supported_chunk_bytes':list(MEDIA_WIDTHS),'preferred_chunk_bytes':for_resource(r)['media_chunk_bytes']}
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
    """Each intent, merge recovery range, hash range and publication has a checkpoint."""
    from .site_sync_stream import compose
    from .site_sync_media_recovery import merge_step,verify_step,stable,conflict
    from .media_locks import lease
    from .media_references import REFERENCE_LOCK
    e=task['state']['execution'];uid=task['uid']
    base=chunk_size(item.get('chunk_bytes',CHUNK))
    width=item.get('merge_width',base);offset=item.get('merge_offset',0)
    if width<item['size']:
        item['finalize_stage']='merge-recover' if item.get('merge_pending',{}).get('stage')=='compare' else 'merge'
        await merge_step(r,task,index,item,width,offset,base)
        return
    key=merged_key(uid,index,width,0,base);cache=inventory(r.cache_store)
    head=await stable(r.cache_store,key,item['size'],item.get('assembled_version'))
    if not item.get('assembled_version'):
        if not item.get('signature_version'):
            prefix=await cache.read_range(key,0,min(512,item['size']),head['version'])
            mime=signature(prefix,PurePosixPath(item['key']).suffix.lstrip('.').lower())
            if mime!=item['mime_type']:raise conflict('媒体内容与登记类型不符')
            await stable(r.cache_store,key,item['size'],head['version'])
            item.update(signature_version=head['version'],finalize_stage='verify-assembled');return
        if item['signature_version']!=head['version']:raise conflict('合并暂存发生变化')
        item['finalize_stage']='verify-assembled'
        value=await verify_step(r,task,item,r.cache_store,key,head,'assembled')
        if value is None:return
        if item.get('source_checksum') and value!=item['source_checksum']:raise conflict('媒体整体摘要不符，未覆盖目标文件')
        item.update(sha256=value,assembled_version=head['version']);item.pop('verify',None);return
    store=inventory(r.media_store)
    async with lease(r,REFERENCE_LOCK,'edit'):
        existing=await store.head(item['key'])
        if existing:
            if existing['size']!=item['size']:raise conflict('目标存在同名不同内容文件；未覆盖')
            item['finalize_stage']='verify-target'
            value=await verify_step(r,task,item,r.media_store,item['key'],existing,'target')
            if value is None:return
            if value!=item['sha256']:raise conflict('目标存在同名不同内容文件；未覆盖')
            await stable(r.media_store,item['key'],item['size'],existing['version'])
            target=existing
            # A publication receipt may have been lost. Ownership cannot be inferred
            # from equal content: cancellation must not delete an unrelated object.
            if item.get('publication') and not item.get('created_version'):item['publication_unconfirmed']=True
        else:
            if item.get('verify'):raise conflict('正在校验的目标媒体已消失')
            if not item.get('publication'):
                item.update(publication={'source_version':head['version']},finalize_stage='publish');return
            if item['publication']['source_version']!=head['version']:raise conflict('发布来源版本变化')
            item['finalize_stage']='publish'
            target=await compose(r.cache_store,r.media_store,[(key,item['size'])],item['key'],exclusive=True,versions=[head['version']])
            await stable(r.media_store,item['key'],item['size'],target['version'])
            item['created_version']=target['version']
        await stable(r.cache_store,key,item['size'],head['version'])
        item.pop('verify',None);item['finalize_stage']='complete'
        item['target_version']=target['version'];e['file_index']+=1;e['offset']=0

async def cleanup_step(r,task,index,item,budget):
    """At most budget deletes, including partially constructed merge levels."""
    base=chunk_size(item.get('chunk_bytes',CHUNK))
    e=task['state']['execution'];width=e.get('cleanup_width',base);offset=e['cleanup_offset'];used=0
    maximum=base
    while maximum<item['size']:maximum*=COMPOSE_FANOUT
    while width<=maximum and used<budget:
        from .site_sync_stream import discard_temp
        key=merged_key(task['uid'],index,width,offset,base)
        discard_temp(r.cache_store,key)
        await r.cache_store.delete(key);used+=1;offset+=width
        if offset>=item['size']:width*=COMPOSE_FANOUT;offset=0
    e.update(cleanup_width=width,cleanup_offset=offset)
    return width>maximum
