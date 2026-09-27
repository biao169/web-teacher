import {request,bytes} from './portal-core.js?v=0.15.96';
const button=document.getElementById('refresh-storage'),status=document.getElementById('storage-status');
if(button&&status)button.addEventListener('click',async()=>{
 button.disabled=true;status.textContent='正在检查磁盘与清理状态…';
 try{const v=await request('/api/storage-status'),c=v.cleanup;status.textContent=`磁盘空闲 ${bytes(v.disk_free_bytes)}；待上传预留 ${bytes(v.pending_upload_bytes)}；安全余量 ${bytes(v.disk_reserve_bytes)}；可供新任务 ${bytes(v.disk_available_bytes)}。缓存已预留 ${bytes(v.cache_reserved_bytes)} / ${bytes(v.cache_limit_bytes)}。自动清理${c.enabled===false?'已关闭':c.running?'运行中':'未运行'}；最近一轮删除 ${c.removed_chunks||0} 个分块，完成 ${c.completed_tasks||0} 个任务。${c.error||''}`}
 catch(error){status.textContent=error.message}finally{button.disabled=false}
});
