"""Constant-size checkpoints, bounded chunk pages and explicit legacy conversion."""
import json,re
from backend.app.native.catalog import Error
from backend.app.native.storage import key_path
PAGE=64


def index_legacy(c):
    """Stopped-service migration: one historical (<=200 MiB) task at a time, same transaction."""
    original_factory=c.row_factory
    if c.execute('SELECT 1 FROM recovery_tasks WHERE length(point)>8388608 LIMIT 1').fetchone():raise ValueError('Legacy manifest exceeds safe migration budget; inspect offline before upgrade')
    c.row_factory=None
    for task,raw,extra,state in c.execute('SELECT id,point,extra,state FROM recovery_tasks'):
        point=json.loads(raw)
        if point.get('indexed')==1:continue
        parts=point.get('parts',[]);offset=0
        if not isinstance(parts,list):raise ValueError('Invalid legacy chunk manifest')
        for part in parts:
            key=key_path(part['key']);size=part['size'];digest=part['sha256']
            if not key.startswith(task+'/') or type(size)!=int or not 0<size<=1048576 or not re.fullmatch('[0-9a-f]{64}',digest):raise ValueError('Invalid legacy chunk')
            c.execute('INSERT INTO transfer_chunks(task,offset,size,key,sha256) VALUES (?,?,?,?,?)',(task,offset,size,key,digest));offset+=size
        if offset!=point.get('bytes',0):raise ValueError('Legacy checkpoint size mismatch')
        point.update(indexed=1,parts=[]);encoded=json.dumps(point)
        c.execute('UPDATE recovery_tasks SET point=? WHERE id=?',(encoded,task))
        c.execute('UPDATE temporary_shares SET manifest=? WHERE id=? AND manifest IS NOT NULL',(encoded,task))
        old=json.loads(extra);skip=int(old.get('cleanup_index',0))
        if skip and state!='deleted':
            if not 0<=skip<=len(parts):raise ValueError('Invalid cleanup checkpoint')
            old['cleanup_offset']=sum(p['size'] for p in parts[:skip]);c.execute('UPDATE recovery_tasks SET extra=? WHERE id=?',(json.dumps(old),task))
    c.row_factory=original_factory


async def page(sql,task,after=0,limit=PAGE):
    if type(after)!=int or after<0 or not 1<=limit<=PAGE:raise Error('分块游标无效')
    return await sql.query('SELECT offset,size,key,sha256 FROM transfer_chunks WHERE task=? AND offset>=? ORDER BY offset LIMIT ?',(task,after,limit))


async def one(sql,task,offset):
    rows=await sql.query('SELECT offset,size,key,sha256 FROM transfer_chunks WHERE task=? AND offset=?',(task,offset))
    if not rows:raise Error('分块不存在，请核对任务',409)
    return rows[0]
