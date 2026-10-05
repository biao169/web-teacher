"""Signed, version-bound JSON field fragments; one durable fragment per step.

SQL slices JSON-quoted text before it crosses the runtime bridge. Accumulation
and final field decoding stay in SQL; task state contains only bounded cursors.
"""
import hashlib,hmac
from . import site_sync as core,site_sync_tasks as tasks
from .catalog import Error
from .data_tools import encoded
from .site_sync_analysis import put,get

VERSION=1
INLINE=256
MAX_CHARS=2048
PARTIAL='@field-row:'
TEXT='@field-text:'

def fail(message='长字段分片响应无效'):
    return Error(message,409,'sync_conflict')

def width(r,task=None):
    from .site_sync_limits import level
    state=(task or {}).get('state',{});work=state.get('work',{})
    pressure=level(work);base=2048 if getattr(r,'kind',None)=='local' else 512
    # A local receiver can also encounter a resource-limited remote Worker.
    if str(work.get('last_error_code')) in ('1101','1102','sync_unconfirmed'):
        base=min(base,512)
        failures=work.get('total_failures',0)
        pressure=max(pressure,min(2,max(1,failures)) if type(failures) is int else 1)
    preferred=max(128,base>>pressure)
    previous=state.get('current',{}).get('field_reader',{}).get('chars',MAX_CHARS)
    return min(preferred,previous)

def quoted(name):return '"'+name+'"'

def location(table,key):
    names=core.columns(table)
    if not isinstance(key,str) or not 1<=len(key)<=128:raise fail('记录定位参数无效')
    return names,('1',()) if table in ('site_settings','global_settings') and key=='@settings' else ('uid=?',(key,))

async def manifest(sql,table,key):
    names,(where,args)=location(table,key)
    # The complete record never enters Python. SQL only returns lengths and small values.
    obj='json_object('+','.join("'"+c+"',"+quoted(c) for c in names)+')'
    expr=['uid','updated_at AS stamp','length(CAST('+obj+' AS BLOB)) AS total']
    for i,c in enumerate(names):
        value='json_quote('+quoted(c)+')';size='length(CAST('+value+' AS BLOB))'
        expr.extend([size+' AS b'+str(i),'length('+value+') AS n'+str(i),
                     'CASE WHEN '+('1' if c=='uid' else size+'<='+str(INLINE))+' THEN '+quoted(c)+' ELSE NULL END AS v'+str(i)])
    rows=await sql.query('SELECT '+','.join(expr)+' FROM '+quoted(table)+' WHERE '+where+' LIMIT 2',args)
    if len(rows)>1:raise fail('来源记录定位不唯一')
    if not rows:return {'field_chunks':VERSION,'uid':None,'stamp':None,'row':None,'fields':[]}
    row=rows[0]
    if row['total']>core.RECORD_BYTES:raise Error('所选单条记录编码后超过200KB',413)
    inline={};fields=[]
    for i,c in enumerate(names):
        if c!='uid' and row['b'+str(i)]>INLINE:fields.append({'name':c,'chars':row['n'+str(i)],'bytes':row['b'+str(i)]})
        else:inline[c]=row['v'+str(i)]
    return {'field_chunks':VERSION,'uid':row['uid'],'stamp':row['stamp'],'row':inline,'fields':fields}

async def fragment(r,data):
    table=data.get('table');key=data.get('key');names,_=location(table,key)
    field=data.get('field');offset=data.get('offset');amount=data.get('chars');stamp=data.get('stamp')
    if field not in names or type(offset) is not int or not 0<=offset<core.RECORD_BYTES or type(amount) is not int or not 1<=amount<=MAX_CHARS or not isinstance(stamp,str) or not 1<=len(stamp)<=64:
        raise fail('长字段分片参数无效')
    amount=min(amount,width(r));value='json_quote('+quoted(field)+')'
    rows=await r.sql.query('SELECT substr('+value+',?,?) AS text,length('+value+') AS chars FROM '+quoted(table)+' WHERE uid=? AND updated_at=?',(offset+1,amount,key,stamp))
    if not rows:raise fail('来源条目已变化，请重新准备')
    row=rows[0];text=row['text']
    if offset>=row['chars']:raise fail('长字段分片偏移越界')
    return {'uid':key,'stamp':stamp,'field':field,'offset':offset,'next':offset+len(text),'text':text,
            'sha256':hashlib.sha256(text.encode()).hexdigest()}

def validate_manifest(value,table,key):
    if value.get('field_chunks')!=VERSION:raise fail()
    uid=value.get('uid');stamp=value.get('stamp');row=value.get('row');fields=value.get('fields')
    if uid is None:
        if stamp is not None or row is not None or fields!=[]:raise fail()
        return
    if not isinstance(uid,str) or not 1<=len(uid)<=128 or not isinstance(stamp,str) or not 1<=len(stamp)<=64 or not isinstance(row,dict) or not isinstance(fields,list):raise fail()
    names=core.columns(table)
    if not (table in ('site_settings','global_settings') and key=='@settings') and uid!=key:raise fail()
    if len(fields)>len(names) or len(encoded(row))>len(names)*(INLINE+100):raise fail()
    found=set(row)
    for field in fields:
        if not isinstance(field,dict) or set(field)!={'name','chars','bytes'}:raise fail()
        name=field['name'];chars=field['chars'];size=field['bytes']
        if not isinstance(name,str) or name in found or name not in names or type(chars) is not int or type(size) is not int or not 0<chars<=size<=core.RECORD_BYTES:raise fail()
        found.add(name)
    if found!=set(names) or sum(f['bytes']+len(encoded(f['name']))+2 for f in fields)+len(encoded(row))>core.RECORD_BYTES:raise fail()
    if 'uid' not in row or row['uid']!=uid:raise fail()
    if any(isinstance(v,(dict,list)) or len(encoded(v))>(770 if k=='uid' else INLINE) for k,v in row.items()):raise fail()

async def read_step(r,task,side,table,key):
    """Return a complete record, or persist exactly one step and return None."""
    from .site_sync_incremental import remote,read
    s=task['state'];current=s['current'];uid=task['uid']
    state=current.get('field_reader')
    if state is None:
        value=await manifest(r.sql,table,key) if side=='local' else await remote(r,task,{'op':'record-fields','table':table,'key':key})
        validate_manifest(value,table,key)
        if not value['fields']:return value
        current['field_reader']={'uid':value['uid'],'stamp':value['stamp'],'fields':value['fields'],'index':0,'offset':0,'bytes':0,'chars':width(r,task),'stage':'chunks'}
        await tasks.persist(r.sql,task,[put(uid,side,PARTIAL+table,key,value['row']),put(uid,side,TEXT+table,key,{'text':''})])
        return None
    if state['stage']=='done':
        return {'uid':state['uid'],'stamp':state['stamp'],'row':await get(r.sql,uid,side,table,key)}
    if state['index']>=len(state['fields']):
        # Recheck once more before publishing the private assembled snapshot.
        head=await read(r,task,side,table,key,head=True)
        if head.get('uid')!=state['uid'] or head.get('stamp')!=state['stamp']:raise fail('来源条目已变化，请重新准备')
        stored=await r.sql.query('SELECT length(CAST(payload AS BLOB)) AS bytes FROM sync_task_items WHERE task_uid=? AND side=? AND module=? AND record_uid=?',(uid,side,PARTIAL+table,key))
        if not stored or stored[0]['bytes']>core.RECORD_BYTES:raise fail('暂存来源记录缺失或超过大小限制')
        state['stage']='done'
        await tasks.persist(r.sql,task,[
            ('INSERT INTO sync_task_items(task_uid,side,module,record_uid,payload) SELECT task_uid,side,?,record_uid,payload FROM sync_task_items WHERE task_uid=? AND side=? AND module=? AND record_uid=? ON CONFLICT(task_uid,side,module,record_uid) DO UPDATE SET payload=excluded.payload',(table,uid,side,PARTIAL+table,key)),
            ('DELETE FROM sync_task_items WHERE task_uid=? AND side=? AND module IN (?,?) AND record_uid=?',(uid,side,PARTIAL+table,TEXT+table,key))])
        return None
    field=state['fields'][state['index']];name=field['name'];offset=state['offset'];amount=width(r,task)
    state['chars']=amount
    if state['stage']=='field-save':
        # Parse one complete JSON scalar inside SQL, never a large Python JSON envelope.
        saved=await r.sql.query("SELECT length(json_extract(payload,'$.text')) AS chars,length(CAST(json_extract(payload,'$.text') AS BLOB)) AS bytes,json_valid(json_extract(payload,'$.text')) AS valid,CASE WHEN json_valid(json_extract(payload,'$.text')) THEN json_type(json_extract(payload,'$.text')) END AS kind FROM sync_task_items WHERE task_uid=? AND side=? AND module=? AND record_uid=?",(uid,side,TEXT+table,key))
        if not saved or saved[0]!={'chars':field['chars'],'bytes':field['bytes'],'valid':1,'kind':'text'}:raise fail('暂存长字段格式或长度无效')
        path='$.'+name
        statements=[('UPDATE sync_task_items SET payload=json_set(payload,?,json_extract((SELECT json_extract(payload,\'$.text\') FROM sync_task_items WHERE task_uid=? AND side=? AND module=? AND record_uid=?),\'$\')) WHERE task_uid=? AND side=? AND module=? AND record_uid=?',
                     (path,uid,side,TEXT+table,key,uid,side,PARTIAL+table,key)),put(uid,side,TEXT+table,key,{'text':''})]
        state.update(index=state['index']+1,offset=0,bytes=0,stage='chunks')
    else:
        data={'op':'record-field','table':table,'key':state['uid'],'stamp':state['stamp'],'field':name,'offset':offset,'chars':amount}
        value=await fragment(r,data) if side=='local' else await remote(r,task,data)
        text=value.get('text');end=value.get('next')
        if (value.get('uid'),value.get('stamp'),value.get('field'),value.get('offset'))!=(state['uid'],state['stamp'],name,offset):raise fail()
        if not isinstance(text,str) or not 0<len(text)<=amount or type(end) is not int or end!=offset+len(text) or end>field['chars']:raise fail()
        raw=text.encode();digest=value.get('sha256')
        if not isinstance(digest,str) or not hmac.compare_digest(digest,hashlib.sha256(raw).hexdigest()):raise fail('长字段分片校验失败')
        size=state['bytes']+len(raw)
        if size>field['bytes'] or (end==field['chars'])!=(size==field['bytes']):raise fail()
        # Appending and advancing the cursor share the task's CAS/authorization batch.
        statements=[("UPDATE sync_task_items SET payload=json_set(payload,'$.text',json_extract(payload,'$.text')||?) WHERE task_uid=? AND side=? AND module=? AND record_uid=?",(text,uid,side,TEXT+table,key))]
        state.update(offset=end,bytes=size)
        if end==field['chars']:state['stage']='field-save'
    await tasks.persist(r.sql,task,statements)
    return None
