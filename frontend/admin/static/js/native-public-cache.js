/* Explicit one-module maintenance; no polling, warming, or automatic retry. */
(()=>{'use strict';const root=document.querySelector('[data-maintenance]'),panel=root?.querySelector('[data-public-cache]');if(!panel)return;
const output=panel.querySelector('[data-public-cache-result]'),buttons=[...panel.querySelectorAll('[data-public-cache-module]')];let busy=false;
for(const button of buttons)button.addEventListener('click',async()=>{
 if(busy||!confirm('清除该模块的异常公开缓存？下一次真实访问会重新生成，旧成功内容的故障回退也会被移除。'))return;
 busy=true;buttons.forEach(b=>b.disabled=true);output.textContent='正在提交清理请求…';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch('/api/admin/public-cache/reset',{method:'POST',cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({module:button.dataset.publicCacheModule,_csrf:root.dataset.csrf})});
  const data=await response.json();const describe=value=>({accepted:'已接受',failed:'失败',unknown:'结果未确认',not_applicable:'不适用'}[value]||'结果未确认');
  if(data.module===button.dataset.publicCacheModule&&data.page_cache&&data.data_cache){
   const ok=response.ok&&data.page_cache==='accepted'&&(data.data_cache==='accepted'||data.data_cache==='not_applicable');
   output.textContent=(ok?'平台已接受清理请求。':'清理未全部确认，请检查日志；不会自动重试。')+' 页面缓存：'+describe(data.page_cache)+'；数据缓存：'+describe(data.data_cache)+(data.request_id?'；追踪ID：'+data.request_id:'');
  }else output.textContent='清理请求未确认，请检查权限与服务日志；不会自动重试。';
 }catch{output.textContent='清理结果未确认，请检查服务日志；不会自动重试。';}
 finally{clearTimeout(timer);busy=false;buttons.forEach(b=>b.disabled=false);}
});})();
