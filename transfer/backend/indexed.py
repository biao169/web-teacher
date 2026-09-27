"""Indexed upload acknowledgements and paged recovery without growing JSON arrays."""
import hashlib,json,secrets,asyncio
from backend.app.native.catalog import Error
from .accounting import Accounting,assertion,milliseconds as ms
from .chunks import page,one,PAGE
CHUNK=1048576

async def checkpoint(service,p,id,after=0):
    row=await service.task(id,p)
    task=(await service.sql.query('SELECT point,updated_at FROM recovery_tasks WHERE id=?',(id,)))[0]
    point=json.loads(task['point']);info=json.loads(row['summary'])
    parts=await page(service.sql,id,after)
    end=parts[-1]['offset']+parts[-1]['size'] if parts else after
    return {'name':info['name'],'size':int(row['reserved_bytes']),'state':row['state'],'expired':row['expires_at']<=ms(),
            'confirmed':point['bytes'],'version':task['updated_at'],'paged':True,
            'parts':[{k:v for k,v in part.items() if k!='key'} for part in parts],
            'wait_ms':max(0,point.get('not_before',0)-ms()),'next_offset':end if end<point['bytes'] else None}

async def chunk(service,p,id,offset,data):
    if service.disk:
        return await service.disk.run(lambda:_chunk(service,p,id,offset,data))
    return await _chunk(service,p,id,offset,data)

async def _chunk(service,p,id,offset,data):
    if not p.get('send'):raise Error('没有上传权限',403)
    if type(offset)!=int or offset<0 or not 0<len(data)<=CHUNK:raise Error('分块位置或大小无效',409)
    settings,rule,rate=await service.policy(p,'send');row=await service.task(id,p)
    if row['state'] not in ('uploading','ready') or row['expires_at']<=ms():raise Error('任务不处于可上传状态',409)
    info=json.loads(row['summary'])
    if info.get('kind')=='folder' and not info.get('manifestReady'):raise Error('请先提交完整目录清单',409)
    task=(await service.sql.query('SELECT point,updated_at FROM recovery_tasks WHERE id=?',(id,)))[0];point=json.loads(task['point']);digest=hashlib.sha256(data).hexdigest()
    if offset<point['bytes']:
        saved=await one(service.sql,id,offset)
        if saved['size']!=len(data) or saved['sha256']!=digest:raise Error('此位置已确认不同内容',409)
        return {'offset':offset+len(data),'complete':offset+len(data)==int(row['reserved_bytes']),'replayed':True}
    if row['state']!='uploading' or offset!=point['bytes'] or offset+len(data)>int(row['reserved_bytes']):raise Error('分块位置或大小不正确',409)
    if point.get('not_before',0)>ms():raise Error('上传过快，请稍后重试',429)
    ledger=Accounting(service.sql);operations=[]
    if not await service.sql.query("SELECT 1 FROM transfer_allowances WHERE task=? AND member='upload'",(id,)):
        operations+=ledger.reserve(p,id,'upload',int(row['reserved_bytes'])-offset,'send',settings,rule,row['expires_at'])
    key=id+'/'+secrets.token_hex(16)+'.part'
    if service.disk:await service.disk.write(service,id,key,data,settings)
    else:await service.store.put(key,data)
    old=task['point'];point.update(bytes=offset+len(data),indexed=1,parts=[],not_before=ms()+int(len(data)/rate*1000) if rate else 0);encoded=json.dumps(point);done=point['bytes']==int(row['reserved_bytes'])
    try:
        await service.sql.batch([*operations,*ledger.charge(id,'upload',len(data),done),
            assertion("EXISTS(SELECT 1 FROM recovery_tasks r JOIN temporary_shares s ON s.id=r.id WHERE r.id=? AND r.point=? AND s.state='uploading' AND s.expires_at>?)",(id,old,ms())),
            ('INSERT INTO transfer_chunks(task,offset,size,key,sha256) VALUES (?,?,?,?,?)',(id,offset,len(data),key,digest)),
            ('UPDATE recovery_tasks SET point=?,updated_at=? WHERE id=?',(encoded,max(ms(),task['updated_at']+1),id)),
            ('UPDATE temporary_shares SET manifest=?,state=? WHERE id=?',(encoded,'ready' if done else 'uploading',id))])
    except BaseException:
        # Unknown cancellation can happen after commit: never delete a referenced chunk.
        if not await service.sql.query('SELECT 1 FROM transfer_chunks WHERE key=?',(key,)):await service.store.delete(key)
        raise
    return {'offset':point['bytes'],'complete':done,'replayed':False,'wait_ms':max(0,point['not_before']-ms())}
