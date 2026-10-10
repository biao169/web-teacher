"""Read-only monitor projections; no runtime, clone, media or event traversal."""
import json
FIELDS='task_id,peer_id,status,phase,progress_seq,no_progress_count,total_errors,last_dispatched_at,last_progress_at,next_run_at,created_at,mode,auto_confirm,cancel_intent,delete_requested,lease_until,fast_retries,operation_id'
VIEWS={'running':('running',),'waiting':('ready','waiting','cancel_requested'),'paused':('paused',),'history':('done','cancelled'),'active':('ready','running','waiting','paused','cancel_requested')}
def query(grant,view,cursor,limit):
    if view not in (*VIEWS,'all'):raise ValueError('Invalid task view')
    if type(limit)!=int or not 1<=limit<=20:raise ValueError('Summary limit must be 1..20')
    suffix='';tail=[]
    if cursor is not None:
        if not isinstance(cursor,list) or len(cursor)!=2 or type(cursor[0])!=int or not isinstance(cursor[1],str) or len(cursor[1])>128:raise ValueError('Invalid cursor')
        suffix=' AND (created_at,task_id)<(?,?)';tail=cursor
    if view=='all':return 'SELECT '+FIELDS+' FROM sync_tasks WHERE grant_id=?'+suffix+' ORDER BY created_at DESC,task_id DESC LIMIT ?',[grant,*tail,limit+1]
    # Each status branch reads at most 21 indexed rows before the bounded merge.
    branches=[];args=[]
    for status in VIEWS[view]:
        branches.append('SELECT * FROM (SELECT '+FIELDS+' FROM sync_tasks WHERE grant_id=? AND status=?'+suffix+' ORDER BY created_at DESC,task_id DESC LIMIT ?)')
        args.extend((grant,status,*tail,limit+1))
    return 'SELECT * FROM ('+' UNION ALL '.join(branches)+') ORDER BY created_at DESC,task_id DESC LIMIT ?',args+[limit+1]

def state(task,events,clone):
    terminal=task['status'] in ('done','cancelled')
    success=next((e for e in events if e['kind'] in ('step','clone-complete') and not e['detail'].get('error')),None)
    error=next((e for e in events if e['kind'] in ('error','recovered') and e['detail'].get('error')),None)
    recovered=bool(error and (task['status']=='done' or (task['progress_seq']>error['progress_seq'] and not task['no_progress_count'])))
    latest=events[0] if events else None
    checkpoint=next((e['detail']['clone_checkpoint'] for e in events if e['phase']!='done' and e['detail'].get('clone_checkpoint')),None) or clone
    return {'status':'completed' if task['status']=='done' else task['status'],'phase':'completed' if task['status']=='done' else task['phase'],
            'progress_seq':task['progress_seq'],'terminal':terminal,'finished_at':(task['last_progress_at'] or task['last_dispatched_at']) if terminal else None,
            'last_success':success,'historical_error':dict(error,recovered=recovered) if error else None,'last_work_checkpoint':checkpoint if terminal else None}

def event(row):
    value=dict(row)
    try:
        if len(value['detail'])>16384:raise ValueError('event bound')
        value['detail']=json.loads(value['detail'])
        if not isinstance(value['detail'],dict):raise ValueError('event object')
    except (ValueError,TypeError):value['detail']={'diagnostic_unavailable':True}
    return value


def source_schedule_id(task):
    """Parse persisted scheduler identity without lookups; malformed legacy data is absent."""
    if not isinstance(task,dict) or task.get('mode')!='scheduled':return None
    value=task.get('operation_id')
    if not isinstance(value,str) or len(value)>512:return None
    parts=value.split(':')
    if len(parts)!=4 or parts[0]!='auto':return None
    _,schedule,revision,when=parts
    if not schedule or not revision or not when.isascii() or not when.isdecimal():return None
    if any(c.isspace() or ord(c)<32 or ord(c)==127 for c in schedule+revision):return None
    return schedule
