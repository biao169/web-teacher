import {transferPath} from './portal-core.js?v=0.15.158';
/** Examples use the existing session and CSRF; settings drafts are retained after every action. */
import {requestJSON} from '/assets/admin/js/native-http.js';
const buttons=[...document.querySelectorAll('[data-transfer-example]')],status=document.querySelector('[data-transfer-example-status]');
for(const button of buttons)button.addEventListener('click',async()=>{
 buttons.forEach(b=>b.disabled=true);status.textContent='正在生成演示内容…';
 try{const result=await requestJSON(transferPath('/api/examples'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_csrf:(document.querySelector('[data-transfer-admin]')||document.querySelector('[data-csrf]')).dataset.csrf,kind:button.dataset.transferExample})},45000);status.textContent=result.message+' 可使用列表的筛选/刷新，或在保留设置后刷新页面查看。'}catch(e){status.textContent=e.message}finally{buttons.forEach(b=>b.disabled=false)}
});
buttons.forEach(b=>b.disabled=false);
