"""Small per-administrator delivery receipts; never local execution tasks."""
import hashlib,json,time
from site_sync.core.authority import ConflictError
from site_sync.core.diagnostics import coded
from .host import adapter

def prefix(uid):return 'sync:outgoing:'+hashlib.sha256(uid.encode()).hexdigest()[:32]+':'
def identity(uid,request_id):return prefix(uid)+hashlib.sha256(request_id.encode()).hexdigest()
def trim(uid,key):
    pre=prefix(uid)
    return ("DELETE FROM service_meta WHERE key IN (SELECT key FROM service_meta WHERE key>=? AND key<? AND key!=? ORDER BY json_extract(value,'$.created_at') DESC,key DESC LIMIT 10 OFFSET 49)",(pre,pre+'g',key))
async def begin(r,data,origin):
    db=adapter(r);key=identity(r.p['uid'],data['request_id']);stamp=int(time.time())
    row=dict(request_id=data['request_id'],origin=origin,scope=sorted(data['scope']),status='sending',created_at=stamp,updated_at=stamp)
    await db.batch([('INSERT INTO service_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING',(key,json.dumps(row,separators=(',',':')))),trim(r.p['uid'],key)])
    saved=json.loads((await db.query('SELECT value FROM service_meta WHERE key=?',(key,)))[0]['value'])
    if saved['scope']!=row['scope'] or saved['origin']!=origin:raise coded(ConflictError('Proposal request ID already used for another selection or peer'),'SYNC_PROPOSAL_CHANGED')
    return key,saved
async def save(r,key,row,**changes):
    value=dict(row,**changes,updated_at=int(time.time()))
    raw=json.dumps(value,separators=(',',':'))
    if len(raw)>4096:
        value['diagnostic']={'error':value.get('diagnostic',{}).get('error','Error'),'causes':value.get('diagnostic',{}).get('causes',[])[:1]};raw=json.dumps(value,separators=(',',':'))
    await adapter(r).batch([("UPDATE service_meta SET value=? WHERE key=? AND json_extract(value,'$.status')!='confirmed'",(raw,key)),trim(r.p['uid'],key)])
async def listing(r):
    pre=prefix(r.p['uid']);rows=await adapter(r).query("SELECT value FROM service_meta WHERE key>=? AND key<? ORDER BY json_extract(value,'$.updated_at') DESC,key DESC LIMIT 20",(pre,pre+'g'))
    return {'items':[json.loads(row['value']) for row in rows],'server_time':int(time.time())}
