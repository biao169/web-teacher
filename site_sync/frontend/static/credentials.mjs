import {time} from './model.mjs';
const form=document.querySelector('#sync-credentials');
if(form){
 const input=form.querySelector('[name=sync_key]'),notice=form.querySelector('[data-key-notice]'),status=form.querySelector('[data-key-status]'),meta=form.querySelector('[data-key-meta]');
 const show=form.querySelector('[data-key-show]');
 let dirty=false,busy=false,denied=false;
 const controls=[...form.querySelectorAll('button,input')];
 const message=text=>{notice.textContent=text;};
 function lock(value){busy=value;form.setAttribute('aria-busy',String(value));controls.forEach(e=>e.disabled=value||denied);}
 function hidden(){input.type='password';show.textContent='显示';show.setAttribute('aria-pressed','false');}
 function clean(value){value=value.trim();if(!/^[a-fA-F0-9]{64}$/.test(value))throw Error('请输入64位十六进制密钥；留空不会清除已有密钥。');return value.toLowerCase();}
 async function api(action,data){
  const options={credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}};
  if(action!=='status')Object.assign(options,{method:'POST',headers:{...options.headers,'content-type':'application/json','x-csrf-token':document.querySelector('meta[name="csrf-token"]').content},body:JSON.stringify(data||{})});
  const response=await fetch('/api/admin/site-sync/credentials'+(action==='reveal'?'/reveal':''),options);
  let result;try{result=await response.json();}catch{throw Error('服务器响应异常，请重试。');}
  if(!response.ok){if([401,403].includes(response.status))denied=true;throw Error(result.error||'操作失败，请刷新后重试。');}
  return result;
 }
 function describe(result){
  status.textContent=result.source==='database'?'已生效 · 后台密钥':result.source==='environment'?'已生效 · 部署环境密钥':'未配置';
  meta.textContent=result.updated_at?'最近修改：'+time(Date.parse(result.updated_at)/1000)+'（北京时间） · 管理员：'+result.updated_by:'两端需要保存相同密钥。';
 }
 async function perform(work){if(busy)return;lock(true);try{await work();}catch(e){message(e.message||'操作未完成');}finally{lock(false);}}
 input.addEventListener('input',()=>{dirty=true;message('尚未保存：输入框中的修改尚未生效。');});
 form.querySelector('[data-key-generate]').onclick=()=>{
  if(busy)return;
  try{const bytes=crypto.getRandomValues(new Uint8Array(32));input.value=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');dirty=true;hidden();message('已生成，尚未保存。可先复制到对端，再分别保存。');}catch{message('浏览器无法安全生成密钥，请使用HTTPS访问或粘贴已有密钥。');}
 };
 async function loadCurrent(){const r=await api('reveal');input.value=r.key;dirty=false;describe(r);}
 show.onclick=()=>perform(async()=>{
  if(input.type==='text'){hidden();message(dirty?'密钥已隐藏；草稿尚未保存。':'当前密钥已隐藏。');return;}
  if(!input.value){if(dirty)throw Error('输入为空；请粘贴或生成密钥。');await loadCurrent();}
  input.type='text';show.textContent='隐藏';show.setAttribute('aria-pressed','true');
  message(dirty?'正在显示草稿，尚未保存。':'正在显示当前生效密钥，请妥善保管。');
 });
 form.querySelector('[data-key-copy]').onclick=()=>perform(async()=>{
  if(!input.value){if(dirty)throw Error('输入为空；请粘贴或生成密钥。');await loadCurrent();}
  const value=clean(input.value);
  try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(value);}
  catch{input.type='text';show.textContent='隐藏';show.setAttribute('aria-pressed','true');input.disabled=false;input.focus();input.select();throw Error('浏览器未允许自动复制，已选中密钥，请手动复制。'+(dirty?'草稿尚未保存。':''));}
  message(dirty?'已复制草稿，尚未保存。请在两端分别保存。':'已复制当前生效密钥，可粘贴到对端。');
 });
 form.onsubmit=e=>{e.preventDefault();perform(async()=>{
  const value=clean(input.value),result=await api('save',{key:value});
  describe(result);dirty=false;input.value='';hidden();message('已保存并生效。请确认对端使用相同密钥；后续同步请求自动读取新密钥。');
 });};
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',()=>{input.value='';hidden();});
 perform(async()=>{describe(await api('status'));message('输入框默认留空，不会自动读取已保存的密钥。');});
}
