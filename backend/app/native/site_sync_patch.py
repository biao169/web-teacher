"""Narrow media execution snapshots and atomic field patches.

Only download/cleanup/terminal ticks use this projection. Callers retain both
existing leases. Every task writer rotates a local revision; projected writes
use that revision and status in the same atomic guard as their side effects.
"""
import copy,json,secrets
from .catalog import Error,now
from .data_tools import encoded
from .site_sync_work import TASK_FORMAT,TOTAL_ROWS
from .site_sync_diagnostics import operation

PHASES=('download','cleanup','done','cancelled')
ROOT_FIELDS=('incremental','remote_id','peer_revision')
INDEX="CASE WHEN json_extract(state,'$.execution.phase')='cleanup' THEN coalesce(json_extract(state,'$.execution.cleanup_index'),0) ELSE coalesce(json_extract(state,'$.execution.file_index'),0) END"

async def load(sql,uid):
    """Return None for phases requiring the complete, validated task snapshot."""
    rows=await sql.query("SELECT uid,status,json_extract(state,'$.preview_format') AS format,"
        "json_extract(state,'$.history_deleting') AS deleting,json_extract(state,'$._sync_revision') AS revision,"
        "json_object("+','.join("'"+k+"',json_extract(state,'$."+k+"')" for k in ROOT_FIELDS)+") AS root,"
        "json_remove(json_extract(state,'$.execution'),'$.media','$.selected','$.prepared') AS execution,"
        "json_array_length(state,'$.execution.media') AS media_count,"+INDEX+" AS media_index,"
        "json_extract(state,'$.execution.media['||("+INDEX+")||']') AS item "
        "FROM sync_tasks WHERE uid=? AND json_extract(state,'$.execution.phase') IN ('download','cleanup','done','cancelled')",(uid,))
    if not rows:return None
    row=rows[0]
    if row['deleting']:raise Error('该历史记录正在清理，请新建预览',404,'sync_history_deleted')
    if row['format']!=TASK_FORMAT:raise Error('旧版同步任务不能继续，请重新生成预览；不要重置业务数据库',409)
    s=json.loads(row['root']);e=json.loads(row['execution']);s['execution']=e
    count=row['media_count'] or 0;index=row['media_index']
    if type(count) is not int or not 0<=count<=TOTAL_ROWS or type(index) is not int or not 0<=index<=count:
        raise Error('媒体执行游标无效',409)
    e['media']=[None]*count
    if index<count:e['media'][index]=json.loads(row['item'])
    return {'uid':uid,'status':row['status'],'state':s,'_patch':{
        'revision':row['revision'],'before':copy.deepcopy(s),'index':index}}


def changes(task):
    """Diff only known projected fields; never replace omitted arrays or payloads."""
    saved=task['_patch'];before=saved['before'];after=task['state']
    if set(after)!=set(before) or any(after[k]!=before[k] for k in ROOT_FIELDS):
        raise Error('局部任务不能修改根字段',409)
    old=before['execution'];new=after['execution'];index=saved['index']
    if len(old['media'])!=len(new['media']) or any(a!=b for i,(a,b) in enumerate(zip(old['media'],new['media'])) if i!=index):
        raise Error('局部任务只能修改当前媒体',409)
    edits=[];removed=[]
    def fields(a,b,prefix):
        for key in sorted(a.keys()|b.keys()):
            if key not in b:removed.append(prefix+'.'+key)
            elif key not in a or a[key]!=b[key]:edits.append((prefix+'.'+key,b[key]))
    fields({k:v for k,v in old.items() if k!='media'},{k:v for k,v in new.items() if k!='media'},'$.execution')
    if any(path in ('$.execution.selected','$.execution.prepared') for path,_ in edits):raise Error('此阶段需要完整任务',409)
    if index<len(old['media']):fields(old['media'][index],new['media'][index],'$.execution.media['+str(index)+']')
    return edits,removed

async def persist(sql,task,statements=(),status=None):
    edits,removed=changes(task);saved=task['_patch'];uid=task['uid'];gid=secrets.token_hex(16);at=now()
    revision=secrets.token_hex(16);edits.append(('$._sync_revision',revision))
    expression='state';args=[]
    # Small independent assignments preserve absent fields and explicit JSON null.
    if removed:
        expression='json_remove('+expression+','+','.join('?' for _ in removed)+')';args+=removed
    expression='json_set('+expression+','+','.join('?,json(?)' for _ in edits)+')'
    for path,value in edits:args.extend((path,encoded(value).decode()))
    guard=("INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES(CASE WHEN EXISTS(SELECT 1 FROM sync_tasks WHERE uid=? AND status=? AND json_extract(state,'$._sync_revision') IS ? AND coalesce(json_extract(state,'$.history_deleting'),0)=0) THEN ? ELSE '' END,?,?,?,?)",
        (uid,task['status'],saved['revision'],gid,'data_tools',uid,at,at))
    next_status=status or task['status']
    with operation('snapshot:patch'):
        await sql.batch([guard,*statements,('UPDATE sync_tasks SET status=?,state='+expression+' WHERE uid=?',(next_status,*args,uid)),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    saved.update(revision=revision,before=copy.deepcopy(task['state']));task['status']=next_status
