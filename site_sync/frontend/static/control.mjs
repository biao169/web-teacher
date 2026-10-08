const box=document.querySelector('#sync-control');
if(box){
 const status=box.querySelector('[data-sync-control-status]'),pause=box.querySelector('[data-sync-pause]'),resume=box.querySelector('[data-sync-resume]'),refresh=box.querySelector('[data-sync-control-refresh]');
 async function load(value){
  pause.disabled=resume.disabled=refresh.disabled=true;
  try{
   const options={credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)};
   if(value!==undefined)Object.assign(options,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':document.querySelector('meta[name="csrf-token"]')?.content||''},body:JSON.stringify({paused:value})});
   const r=await fetch('/api/admin/site-sync/control',options);if(!r.ok)throw Error('HTTP '+r.status+'；请检查登录权限或运行日志');
   const d=await r.json();status.textContent=(d.paused?'同步已暂停':'同步运行中')+' · 活动租约 '+d.active_leases+(d.environment_paused?' · 环境变量 TEACHER_SYNC_PAUSED=1，需先移除或设为0后重新部署/重启':'')+(d.paused&&d.active_leases?' · 等待当前步骤收尾或租约到期':'')+(value!==undefined&&d.coordinator_notified===false?' · 状态已保存；调度器未确认，后续入口仍受数据库开关限制':'');
   pause.disabled=d.paused;resume.disabled=!d.saved_paused||d.environment_paused;
  }catch(e){status.textContent='控制状态未确认：'+e.message+'。请刷新确认，勿假定操作已完成。';}finally{refresh.disabled=false;}
 }
 pause.onclick=()=>load(true);resume.onclick=()=>load(false);refresh.onclick=()=>load();load();
}
