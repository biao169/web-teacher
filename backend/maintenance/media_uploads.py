"""Durable, bounded upload recovery queue in the existing service_meta table."""
import json,re,time
from backend.app.ports.operations import emit,error,current
PREFIX='media:upload-session:'
LEASE_SECONDS=240
RECOVER_AFTER=600
RETAIN_SECONDS=86400

def create(uid,key,owner,stamp=None):
    stamp=int(time.time()) if stamp is None else int(stamp)
    name=PREFIX+f'{stamp+RECOVER_AFTER:012d}:'+uid
    value=json.dumps({'version':1,'uid':uid,'object_key':key,'owner':owner,'created_at':stamp,'expires_at':stamp+LEASE_SECONDS,'retain_until':stamp+RETAIN_SECONDS,'status':'receiving','request_id':current().get('request_id','')},separators=(',',':'))
    return name,('INSERT INTO service_meta(key,value) VALUES (?,?)',(name,value))

def fence(name):
    return ("EXISTS(SELECT 1 FROM service_meta WHERE key=? AND json_extract(value,'$.status')='stored' AND json_extract(value,'$.expires_at')>=unixepoch())",(name,))

def finish(name):return ('DELETE FROM service_meta WHERE key=?',(name,))

async def _move(sql,row,due):
    name=PREFIX+f'{due:012d}:'+row['key'].rsplit(':',1)[-1]
    await sql.batch([('INSERT INTO service_meta(key,value) SELECT ?,value FROM service_meta WHERE key=? AND value=?',(name,row['key'],row['value'])),('DELETE FROM service_meta WHERE key=? AND value=?',(row['key'],row['value']))])

async def recover(sql,store,stamp=None,batch=5):
    stamp=int(time.time()) if stamp is None else int(stamp)
    rows=await sql.query('SELECT key,value FROM service_meta WHERE key>=? AND key<? ORDER BY key LIMIT ?',(PREFIX,PREFIX+f'{stamp+1:012d}:',min(5,max(1,int(batch)))))
    counts={'checked':0,'retained':0,'cleaned':0,'errors':0}
    for row in rows:
        counts['checked']+=1
        try:
            if len(row['value'])>4096:raise ValueError('upload state bound')
            v=json.loads(row['value'])
            if v.get('version')!=1 or not re.fullmatch('[a-f0-9]{32}',v.get('uid','')) or not re.fullmatch(r'[a-f0-9]{32}\.(jpg|jpeg|png|webp|gif|pdf|zip|mp4|webm)',v.get('object_key','')) or not isinstance(v.get('owner'),str) or len(v['owner'])>128:raise ValueError('upload state invalid')
            if not all(type(v.get(k)) is int for k in ('created_at','expires_at','retain_until')) or v['expires_at']!=v['created_at']+LEASE_SECONDS or v['retain_until']!=v['created_at']+RETAIN_SECONDS:raise ValueError('upload lease invalid')
            if v['expires_at']>stamp:
                await _move(sql,row,v['expires_at']+RECOVER_AFTER);continue
            # Expired sessions cannot pass the registration transaction's fence.
            found=await sql.query("SELECT 1 FROM media_assets WHERE object_key=? AND storage_kind='r2' LIMIT 1",(v['object_key'],))
            if found:
                counts['retained']+=1
                await sql.batch([finish(row['key'])])
            else:
                await store.delete(v['object_key']);counts['cleaned']+=1
                if stamp>=v['retain_until']:await sql.batch([finish(row['key'])])
                else:await _move(sql,row,min(v['retain_until'],stamp+21600))
            # Delete only this upload's reservation, never a later owner's lock.
            await sql.batch([('DELETE FROM admin_mutation_guards WHERE uid=? AND target_uid=?',('media:upload',v['owner']))])
            emit('MEDIA-RECOVERY',stage='upload-recovery',upload_id=v['uid'],upload_request_id=v.get('request_id',''),outcome='registered-retained' if found else 'unregistered-cleaned')
        except Exception as exc:
            counts['errors']+=1
            emit('MEDIA-RECOVERY-ERROR',stage='upload-recovery',**error(exc))
            # Keep evidence and avoid a corrupt/temporarily unavailable item starving others.
            try:await _move(sql,row,stamp+RECOVER_AFTER)
            except Exception as retry:emit('MEDIA-RECOVERY-ERROR',stage='upload-recovery-reschedule',**error(retry))
    return counts if rows else {'skipped':'no-expired-uploads'}

async def scheduled(sql,bindings):
    tables=await sql.query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('service_meta','media_assets','admin_mutation_guards')")
    if len(tables)!=3:return {'skipped':'not-initialized'}
    from backend.app.native.storage import R2Store
    return await recover(sql,R2Store(getattr(bindings,str(bindings.TEACHER_MEDIA_BINDING)),str(bindings.TEACHER_MEDIA_PREFIX)))
