"""Small structured diagnostics; never serialize exception bodies or secrets."""
import json,traceback,re,time
from .trace import current,category
from .diagnostics import CODES,fields,RELEASE

def failure(exc):
    frames=[]
    for frame in traceback.extract_tb(exc.__traceback__)[-8:]:
        path=frame.filename.replace('\\','/')
        for marker in ('/site_sync/','/backend/','/worker_runtime/','/deploy/cloudflare/runtime/'):
            if marker in path:
                frames.append({'file':('backend/' if marker=='/backend/' else 'site_sync/' if marker=='/site_sync/' else 'deploy/cloudflare/runtime/')+path.split(marker,1)[1],'function':frame.name,'line':frame.lineno});break
    codes=[];cause=exc
    for _ in range(4):
        if cause is None:break
        info={'type':type(cause).__name__[:80],**fields(cause)}
        d1=getattr(cause,'d1_diagnostic',None)
        if isinstance(d1,dict):info['d1']=d1
        status=getattr(cause,'http_status',None)
        if type(status)==int and 400<=status<=599:info['http_status']=status
        code=getattr(cause,'platform_code',None)
        if code in (1101,1102):info['platform_code']=code
        ray=getattr(cause,'ray_id',None)
        if isinstance(ray,str) and re.fullmatch(r'[a-fA-F0-9]{8,32}-[A-Z]{3}',ray):info['ray_id']=ray
        stage=getattr(cause,'stage',None)
        reasons={'admission':'同步入口暂停检查','control':'控制参数无效','credential_read':'原生辅助读取同步密钥失败','peer_config':'对端地址或密钥引用配置无效','peer_read':'对端请求失败','response_encode':'响应编码失败','request_encode':'请求编码失败','request_sign':'请求签名失败','fetch_request':'发出对端请求失败，尚未获得 HTTP 响应','response_headers':'对端 HTTP 状态或响应头检查失败','response_body':'读取对端响应流失败','response_verify':'对端响应签名或摘要验证失败','response_metadata':'对端响应元数据校验失败'}
        if isinstance(stage,str) and stage in reasons:info['stage']=stage;info['reason']=reasons[stage]
        code=getattr(cause,'code',None)
        diagnostics={'INVOCATION_CONTEXT':'原生函数调用上下文错误；需更新原生辅助 Worker','NETWORK_REQUEST_FAILED':'请求未获得响应；需检查网络、域名与路由','STREAM_READ_FAILED':'响应流读取失败；保留断点重试','NATIVE_TYPE_ERROR':'原生类型错误；请结合阶段定位','REQUEST_TIMEOUT':'请求超时；保留进度重试'}
        if isinstance(code,str) and code in CODES:info['code']=code;info['reason']=CODES[code]
        native=getattr(cause,'native_frames',None)
        if isinstance(native,list):
            info['native_frames']=[{'file':x['file'],'line':x['line'],'function':x.get('function','')} for x in native[:4] if isinstance(x,dict) and isinstance(x.get('file'),str) and re.fullmatch('[A-Za-z0-9_.-]{1,80}',x['file']) and type(x.get('line'))==int and 0<x['line']<100000 and isinstance(x.get('function',''),str) and re.fullmatch('[A-Za-z0-9_.<>]{0,80}',x.get('function',''))]
        name=getattr(cause,'error_type',None)
        if isinstance(name,str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9]{0,63}',name):info['native_type']=name
        if info.get('peer_component') or info.get('peer_request_id'):info['peer_diagnostic_verified']=False
        codes.append(info);cause=cause.__cause__
    result={'error':type(exc).__name__[:80],'frames':frames,'causes':codes}
    if type(exc).__name__=='CredentialRetryError':result['reason']='对端鉴权未通过或密钥未就绪；保留进度，等待退避重试，请核对两端密钥及导出授权'
    result.update(category(exc))
    result['context']=current()
    result['release']=RELEASE
    result['summary']=' → '.join(dict.fromkeys(x['reason'] for x in codes if x.get('code') in CODES)) or result.get('reason','请查看异常类型、阶段及代码位置')
    d1=next((x['d1'] for x in codes if x.get('d1')),None)
    if d1:result['summary']='D1 '+d1['operation']+' / '+d1['sql_type']+' · '+d1['message']
    result['error_message']=result['summary']
    result['error_code']=next((x['code'] for x in codes if x.get('code')),None)
    return result

def statements(uid,now,kind,detail=None,level='info',condition='1',args=()):
    context=current()
    if context:
        context=dict(context,finished_at=time.time() if kind not in ('start','created') else None)
        if context.get('started_at'):context['duration_ms']=round((time.time()-context['started_at'])*1000,2)
    detail=dict(detail or {},trace=context,task_id=uid)
    raw=json.dumps(detail,ensure_ascii=True,separators=(',',':'))
    if len(raw)>6000:
        trimmed={'error':detail.get('error'),'adaptation':detail.get('adaptation'),'trace':context,'task_id':uid,'diagnostic_truncated':True,'diagnostic':{k:v for k,v in detail.get('diagnostic',{}).items() if k in ('error','error_category','error_message','causes')}}
        raw=json.dumps(trimmed,ensure_ascii=True,separators=(',',':'))
        if len(raw)>6000:raw=json.dumps({'task_id':uid,'request_id':context.get('request_id'),'diagnostic_truncated':True})
    return [('''INSERT INTO sync_events(task_id,occurred_at,kind,level,phase,status,progress_seq,next_run_at,slice_bytes,attempt_id,detail) SELECT task_id,?,?,?,phase,status,progress_seq,next_run_at,slice_bytes,attempt_id,json_set(?, '$.checkpoint',json_object('phase',phase,'discovery_cursor',discovery_cursor,'progress_seq',progress_seq,'next_run_at',next_run_at),'$.clone_checkpoint',json((SELECT CASE WHEN length(value)<=2048 AND json_valid(value) THEN value ELSE NULL END FROM service_meta WHERE key='sync:clone-state:'||sync_tasks.task_id)),'$.sync_mode',mode,'$.retry_count',no_progress_count,'$.retryable',CASE WHEN status IN ('ready','waiting','running','cancel_requested') THEN json('true') ELSE json('false') END, '$.next_item',json((SELECT json_object('item_id',i.item_id,'module',i.module,'record_id',i.record_id,'state',i.status,'body_offset',i.staged_bytes) FROM sync_items i WHERE i.task_id=sync_tasks.task_id AND i.selected=1 AND i.status NOT IN ('applied','skipped') ORDER BY i.item_id LIMIT 1)), '$.next_file',json((SELECT json_object('file_id',f.file_id,'state',f.status,'offset',f.committed_bytes,'total',f.total_bytes) FROM sync_files f WHERE f.task_id=sync_tasks.task_id AND f.status NOT IN ('uploaded','published','done') ORDER BY f.file_id LIMIT 1))) FROM sync_tasks WHERE task_id=? AND '''+condition,
             (now,kind,level,raw,uid,*args)),
            ('DELETE FROM sync_events WHERE event_id IN (SELECT event_id FROM sync_events WHERE task_id=? ORDER BY event_id DESC LIMIT 16 OFFSET 256)',(uid,))]
