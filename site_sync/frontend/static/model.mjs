export const zone='Asia/Shanghai';
const formatter=new Intl.DateTimeFormat('zh-CN',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function time(value){return typeof value==='number'&&value>0?formatter.format(new Date(value*1000)):'—';}
export const phases={discover:'发现候选',await_confirmation:'等待批准',transfer:'传输',apply:'写入',cleanup:'清理',done:'完成'};
export function status(t,now){
 if(t.status==='running'&&t.lease_until<=now)return '执行中断，等待恢复';
 if(t.status==='paused')return '已暂停';
 if(t.status==='cancel_requested')return '取消中，等待安全清理';
 if(t.status==='cancelled')return '已取消';
 if(t.status==='done')return '已完成';
 if(t.phase==='await_confirmation')return '等待人工批准';
 if(t.status==='running')return '正在执行';
 if(t.next_run_at>now)return t.no_progress_count>t.fast_retries?'慢速重试等待':'等待下次推进';
 return '待调度';
}
export function settings(form,partial=false){
 const out={};for(const k of ['fast_retries','slice_bytes','min_slice_bytes','slow_retry_seconds','auto_shrink']){
  const v=form.elements[k].value.trim();if(partial&&!v)continue;
  out[k]=k==='auto_shrink'?v==='true':k.endsWith('slice_bytes')||k==='slice_bytes'?v:Number(v);
 }return out;
}

export const errors={ResourceError:'对端或执行器资源暂时不足；按设置缩片并自动退避重试',AuthorizationError:'授权被拒绝或失效；核对两端连接、密钥和授权后恢复',ConflictError:'源版本、写入前置条件或任务状态冲突；检查记录后处理',UncertainInterruptedAttempt:'上次执行未正常结束；已按持久断点对账并安排恢复',NativeError:'原生服务调用异常；保留断点等待重试',OSError:'网络、文件或存储暂不可用；后台将自动重试',TimeoutError:'请求超时；保留断点等待下一次执行',"Authorization changed":'授权范围或授权修订已变化；任务暂停等待处理'};
export function explanation(code){return errors[code]||'查看执行阶段、代码位置和断点；临时错误继续重试，冲突或授权错误需处理';}
