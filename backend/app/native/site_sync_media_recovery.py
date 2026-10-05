"""Durable media intents, bounded verification and conservative lost-ack adoption."""
from .catalog import Error
from .media_inventory_store import inventory
from .site_sync_limits import level,for_resource
from . import site_sync_sha256 as sha


def conflict(message):return Error(message,409,'sync_conflict')

def block_size(r,task,item):
    # The request budget also works with the narrow execution projection.
    pressure=level(task['state'].get('work',{}))
    base=65536 if getattr(r,'kind',None)=='local' else 4096
    value=min(for_resource(r)['verify_bytes'],max(256,base//(4**pressure)))
    return min(value,item.get('verify_block_bytes',value))

async def stable(store,key,size,version=None):
    head=await inventory(store).head(key)
    if not head or head['size']!=size or (version is not None and head['version']!=version):raise conflict('媒体对象缺失、大小或版本变化；保留断点，未提交')
    return head

async def verify_step(r,task,item,store,key,head,role):
    """Saveable SHA state for exactly one bounded range, or return a final digest."""
    cursor=item.get('verify')
    if cursor is None:
        item['verify']={'role':role,'key':key,'version':head['version'],'offset':0,'hash':sha.initial()}
        return None
    if (cursor['role'],cursor['key'],cursor['version'])!=(role,key,head['version']):raise conflict('校验对象版本变化，请重新准备')
    await stable(store,key,item['size'],cursor['version'])
    offset=cursor['offset']
    if type(offset) is not int or not 0<=offset<=item['size'] or cursor['hash'].get('count')!=offset:raise conflict('媒体校验断点无效')
    if offset==item['size']:
        try:return sha.hexdigest(cursor['hash'])
        except (ValueError,TypeError):raise conflict('媒体校验断点无效') from None
    amount=min(block_size(r,task,item),item['size']-offset)
    data=await inventory(store).read_range(key,offset,amount,cursor['version'])
    await stable(store,key,item['size'],cursor['version'])
    try:state=sha.update(cursor['hash'],data)
    except (ValueError,TypeError):raise conflict('媒体校验断点无效') from None
    cursor.update(offset=offset+len(data),hash=state)
    item['verify_block_bytes']=amount if amount>=256 else block_size(r,task,item)
    return None

async def merge_step(r,task,index,item,width,offset,base):
    from .site_sync_media import merged_key,COMPOSE_FANOUT
    from .site_sync_stream import compose
    uid=task['uid'];pending=item.get('merge_pending')
    if pending is None:
        parts=[]
        for n in range(offset,min(offset+width*COMPOSE_FANOUT,item['size']),width):
            key=merged_key(uid,index,width,n,base);size=min(width,item['size']-n)
            head=await stable(r.cache_store,key,size)
            parts.append({'key':key,'size':size,'version':head['version']})
        item['merge_pending']={'key':merged_key(uid,index,width*COMPOSE_FANOUT,offset,base),
            'parts':parts,'size':sum(p['size'] for p in parts),'checked':0,'stage':'write'}
        return
    for part in pending['parts']:await stable(r.cache_store,part['key'],part['size'],part['version'])
    target=await inventory(r.cache_store).head(pending['key'])
    if pending['stage']=='write':
        if target:
            if target['size']!=pending['size']:raise conflict('待恢复合并对象大小不符')
            pending.update(stage='compare',version=target['version'],checked=0)
            return
        await compose(r.cache_store,r.cache_store,[(p['key'],p['size']) for p in pending['parts']],pending['key'],exclusive=True,versions=[p['version'] for p in pending['parts']])
        await stable(r.cache_store,pending['key'],pending['size'])
    else:
        if not target or target['size']!=pending['size'] or target['version']!=pending['version']:raise conflict('待恢复合并对象版本变化')
        checked=pending['checked']
        if checked<pending['size']:
            start=0
            for part in pending['parts']:
                if checked<start+part['size']:break
                start+=part['size']
            amount=min(block_size(r,task,item),part['size']-(checked-start))
            cache=inventory(r.cache_store)
            source=await cache.read_range(part['key'],checked-start,amount,part['version'])
            result=await cache.read_range(pending['key'],checked,amount,target['version'])
            if source!=result:raise conflict('已存在的合并对象内容不符，未复用')
            await stable(r.cache_store,part['key'],part['size'],part['version'])
            await stable(r.cache_store,pending['key'],pending['size'],target['version'])
            pending['checked']+=amount
            return
    offset+=width*COMPOSE_FANOUT
    if offset>=item['size']:width*=COMPOSE_FANOUT;offset=0
    item.update(merge_width=width,merge_offset=offset);item.pop('merge_pending',None)
