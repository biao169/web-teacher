"""Explicit transfer demonstrations through real quota, upload and state-control services."""
import json,secrets
from backend.app.native.catalog import Error
from backend.app.native.auth import sha
from .management import Management
from .accounting import assertion,milliseconds

async def add(r,kind):
    """Generate one tiny owned scenario; existing or interrupted examples keep their actual state."""
    if kind not in ('ready','paused','revoked','cache'):raise Error('示例类型无效')
    manager=Management(r.service,r.p,r.secret,getattr(r,'cache',None));await manager.require()
    key='example-lock:'+sha(r.p['uid']);expires=milliseconds()+180000
    await r.sql.batch([manager.guard(),('DELETE FROM bridge_nonces WHERE jti=? AND expires_at<=?',(key,milliseconds())),('INSERT INTO bridge_nonces(jti,expires_at) VALUES (?,?)',(key,expires))])
    try:
        marker='example-v2:'+sha(r.p['uid'])+':'+kind
        old=await r.sql.query('SELECT value FROM service_meta WHERE key=?',(marker,))
        if old:return {'status':'kept','message':'已有演示记录，保留其当前状态；已清理的内容不会自动恢复。'}
        class GuardedSQL:
            """Preserve adapter response shapes while fencing every reused service mutation."""
            async def query(self,sql,args=()):return await r.sql.query(sql,args)
            async def batch(self,statements):
                lease=assertion('EXISTS(SELECT 1 FROM bridge_nonces WHERE jti=? AND expires_at=? AND expires_at>?)',(key,expires,milliseconds()))
                return (await r.sql.batch([manager.guard(),lease,*statements]))[2:]
        sql=GuardedSQL();service=type(r.service)(sql,r.store,indexed=r.service.indexed,disk=r.service.disk)
        if kind=='cache':
            cache=getattr(r,'cache',None)
            if cache is None:raise Error('缓存存储未配置',503)
            file='examples/'+secrets.token_hex(16)+'.txt';raw=b'Demonstration cache. Safe to remove using the cache manager.\n'
            await sql.batch([('INSERT INTO service_meta(key,value) VALUES (?,?)',(marker,json.dumps({'key':file,'status':'prepared'})))])
            await cache.put(file,raw)
            try:await sql.batch([('UPDATE service_meta SET value=? WHERE key=?',(json.dumps({'key':file,'status':'created'}),marker))])
            except Exception:
                await cache.delete(file);raise
            return {'status':'created','message':'已添加一份演示辅助缓存，可在缓存管理中扫描并删除。'}
        name={'ready':'示例-可下载.txt','paused':'示例-已暂停.txt','revoked':'示例-已撤销.txt'}[kind]
        found=await r.sql.query("SELECT id,state FROM temporary_shares WHERE owner=? AND json_extract(summary,'$.name')=? ORDER BY created_at LIMIT 1",(sha('user:'+r.p['uid']),name))
        if found:return {'status':'kept','message':'已有同名演示任务，保留当前状态。'}
        raw=('Explicit demo transfer: '+kind+'\n').encode();task=await service.create(r.p,name,len(raw))
        await sql.batch([('INSERT INTO service_meta(key,value) VALUES (?,?)',(marker,json.dumps({'id':task['id']})))])
        await service.chunk(r.p,task['id'],0,raw if kind=='ready' else raw[:8])
        if kind!='ready':
            point=(await sql.query('SELECT updated_at FROM recovery_tasks WHERE id=?',(task['id'],)))[0]
            await service.control(r.p,task['id'],'pause' if kind=='paused' else 'revoke','uploading',point['updated_at'])
        return {'status':'created','message':'演示任务已生成；可在任务列表查看、控制与清理。'}
    finally:await r.sql.batch([('DELETE FROM bridge_nonces WHERE jti=? AND expires_at=?',(key,expires))])
