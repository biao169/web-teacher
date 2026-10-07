/** Accessible denial feedback; the server decides every permission and no request is replayed. */
let dialog=null,returnFocus=null;
export function showAccessNotice({message='当前角色没有此功能的权限。',code='access_denied',status=403,trigger=document.activeElement}={}){
 if(!document.querySelector('[data-workspace]'))return;
 if(!dialog){
  returnFocus=trigger;dialog=document.createElement('dialog');dialog.className='native-access-dialog';dialog.setAttribute('aria-labelledby','access-title');dialog.setAttribute('aria-describedby','access-message');
  dialog.innerHTML='<span class="native-access-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></span><h2 id="access-title"></h2><p id="access-message"></p><p class="native-muted" data-access-help></p><div class="native-access-actions"><a class="btn btn-outline-primary" data-access-link hidden target="_blank" rel="noopener"></a><button type="button" class="btn btn-primary" data-access-close>知道了</button></div>';
  document.body.append(dialog);dialog.querySelector('[data-access-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{dialog.remove();dialog=null;const target=returnFocus;returnFocus=null;requestAnimationFrame(()=>{if(target?.isConnected&&!target.closest('[inert]'))target.focus({preventScroll:true})})});
 }
 const login=status===401,password=code==='password_required';
 dialog.querySelector('h2').textContent=login?'登录已过期':code==='access_denied'?'权限不足':'操作受限';dialog.querySelector('#access-message').textContent=message;
 dialog.querySelector('[data-access-help]').textContent=login?'当前输入仍在本页。可在新标签页登录后返回核对。':code==='access_denied'?'如需使用，请联系网站管理员调整角色权限。当前填写内容已保留。':'当前输入已保留，请按提示处理后重试。';
 const link=dialog.querySelector('[data-access-link]');link.hidden=!(login||password);link.href=password?'/auth/password':'/auth/login';link.textContent=password?'前往修改密码 ↗':'新标签登录 ↗';
 if(!dialog.open){dialog.showModal();dialog.querySelector('[data-access-close]').focus();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)dialog.animate([{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:220})}
}
export async function adminFetch(input,options){
 const trigger=document.activeElement,response=await fetch(input,options);
 const url=new URL(response.url||String(input),location.href);
 if((response.status===401||response.status===403)&&url.origin===location.origin&&/^\/(api\/|admin\/)/.test(url.pathname)&&options?.method!=='HEAD'){
  const data=await response.clone().json().catch(()=>({}));showAccessNotice({message:data.error||'请求被拒绝，请核对登录状态和权限。',code:data.code||'request_forbidden',status:response.status,trigger});
 }
 return response;
}
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-access-denied]');if(!target)return;event.preventDefault();showAccessNotice({message:'当前角色无法进入“'+target.dataset.accessDenied+'”。',trigger:target});
});
