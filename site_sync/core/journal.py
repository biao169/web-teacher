"""Small structured diagnostics; never serialize exception bodies or secrets."""
import json,traceback,re

def failure(exc):
    frames=[]
    for frame in traceback.extract_tb(exc.__traceback__)[-8:]:
        path=frame.filename.replace('\\','/')
        for marker in ('/site_sync/','/backend/'):
            if marker in path:
                frames.append({'file':'backend/'+path.split(marker,1)[1] if marker=='/backend/' else 'site_sync/'+path.split(marker,1)[1],'function':frame.name,'line':frame.lineno});break
    codes=[];cause=exc
    for _ in range(4):
        if cause is None:break
        info={'type':type(cause).__name__[:80]}
        status=getattr(cause,'http_status',None)
        if type(status)==int and 400<=status<=599:info['http_status']=status
        code=getattr(cause,'platform_code',None)
        if code in (1101,1102):info['platform_code']=code
        else:
            found=re.search(r'\b110[12]\b',str(cause)[:2048])
            if found:info['platform_code']=int(found.group())
        ray=getattr(cause,'ray_id',None)
        if isinstance(ray,str) and re.fullmatch(r'[a-fA-F0-9]{8,32}-[A-Z]{3}',ray):info['ray_id']=ray
        codes.append(info);cause=cause.__cause__
    return {'error':type(exc).__name__[:80],'frames':frames,'causes':codes}

def statements(uid,now,kind,detail=None,level='info',condition='1',args=()):
    raw=json.dumps(detail or {},ensure_ascii=True,separators=(',',':'))
    if len(raw)>6000:raw=json.dumps({'error':'DiagnosticBoundExceeded'})
    return [('''INSERT INTO sync_events(task_id,occurred_at,kind,level,phase,status,progress_seq,next_run_at,slice_bytes,attempt_id,detail) SELECT task_id,?,?,?,phase,status,progress_seq,next_run_at,slice_bytes,attempt_id,json_set(?, '$.next_item',json((SELECT json_object('item_id',i.item_id,'module',i.module,'record_id',i.record_id,'state',i.status,'body_offset',i.staged_bytes) FROM sync_items i WHERE i.task_id=sync_tasks.task_id AND i.selected=1 AND i.status NOT IN ('applied','skipped') ORDER BY i.item_id LIMIT 1)), '$.next_file',json((SELECT json_object('file_id',f.file_id,'state',f.status,'offset',f.committed_bytes,'total',f.total_bytes) FROM sync_files f WHERE f.task_id=sync_tasks.task_id AND f.status NOT IN ('uploaded','published','done') ORDER BY f.file_id LIMIT 1))) FROM sync_tasks WHERE task_id=? AND '''+condition,
             (now,kind,level,raw,uid,*args)),
            ('DELETE FROM sync_events WHERE event_id IN (SELECT event_id FROM sync_events WHERE task_id=? ORDER BY event_id DESC LIMIT 16 OFFSET 256)',(uid,))]
