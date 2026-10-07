import {request,bytes} from './portal-core.js?v=0.15.96';
const button=document.getElementById('refresh-storage'),status=document.getElementById('storage-status');
if(button&&status)button.addEventListener('click',async()=>{
 button.disabled=true;status.textContent='正在检查 R2 缓存 / Checking R2 cache…';
 try{const v=await request('/api/storage-status'),c=v.cleanup;
 status.textContent=`R2 缓存已预留 / Reserved ${bytes(v.cache_reserved_bytes)} / ${bytes(v.cache_limit_bytes)}。自动清理 / Cleanup ${c.enabled===false?'关闭 / Off':'Cron 已配置 / Configured'}；最近删除 / Removed ${c.removed_chunks||0} 个分块，完成 / Completed ${c.completed_tasks||0} 个任务。${c.error||''} R2 无本地磁盘空闲量 / Local disk capacity does not apply.`;}
 catch(error){status.textContent=error.message}finally{button.disabled=false}
});
