import {t as tr,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
import {request,transferBase} from './portal-core.js?v=0.15.158';
const receivers=new Map();
let resolving=false,pending=null;
export const codeResolving=()=>resolving;
export function registerCodeReceiver(mode,receiver){receivers.set(mode,receiver)}
export function receiveKey(){return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}
export function normalizeCode(value){const code=value.trim().toUpperCase();if(!/^[A-Z]{2}[0-9]{4}$/.test(code))throw Error(tr('请输入两位字母和四位数字，例如 AB1234。'));return code}
const post=(op,data)=>request('/api/codes/'+op,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':document.querySelector('[data-portal]').dataset.csrf},body:JSON.stringify(data)});
export async function receiveCode(value){
 if(resolving)return;const code=normalizeCode(value);
 // Check before joining: never replace a running transfer with an incoming code.
 if([...receivers.values()].some(receiver=>receiver.busy()))throw Error(tr('请先完成或取消当前接收/在线配对，再输入新的传输码。'));
 resolving=true;
 try{
  // Keep the receive key after an ambiguous network result; retry the same pairing.
  if(!pending||pending.code!==code)pending={code,key:receiveKey()};
  const result=await post('resolve',pending),receiver=receivers.get(result.mode);
  if(!receiver)throw Error(tr('当前页面不支持此传输方式，请刷新后重试。'));
  document.querySelector('[data-mode="'+(result.mode==='offline'?'cache':result.mode)+'"]')?.click();
  document.querySelector('[data-view="receive"]')?.click();
  await receiver.accept(result,pending.key);pending=null;
  return result;
 }finally{resolving=false}
}
export function codeCard(host,{input=null}={}){
 if(!host||!transferBase)return {show:async()=>{},clear:()=>{}};
 const box=document.createElement('div');box.className='transfer-code-card';box.hidden=true;
 if(!input){const label=document.createElement('label');input=document.createElement('input');input.id='transfer-code-'+host.id;input.readOnly=true;input.className='transfer-short-code';label.htmlFor=input.id;setText(label,tr('六位传输码'));box.append(label,input)}
 else input.classList.add('transfer-short-code');
 const copy=document.createElement('button'),renew=document.createElement('button'),note=document.createElement('p');
 copy.type=renew.type='button';setText(copy,tr('复制传输码'));setText(renew,tr('获取 / 更新传输码'));note.setAttribute('role','status');note.className='muted';
 const actions=document.createElement('div');actions.className='actions';actions.append(copy,renew);box.append(actions,note);host.append(box);
 let current=null,revision=0,timer=null,loading=false;
 const clear=()=>{revision++;current=null;clearTimeout(timer);box.hidden=true;input.value='';copy.disabled=true;loading=false};
 async function issue(){
  if(!current||loading)return;loading=true;renew.disabled=true;const rev=revision;const data=current;
  setText(note,tr('正在获取传输码…'));
  try{const result=await post('issue',data);if(rev!==revision)return;
   input.value=normalizeCode(result.code);copy.disabled=false;
   setText(note,tr('有效至 {0}；仅发送给目标接收方。',[new Date(result.expires_at).toLocaleString(document.documentElement.lang)]));
   clearTimeout(timer);timer=setTimeout(()=>{input.value='';copy.disabled=true;setText(note,tr('传输码已到期，请更新；在线会话结束时会提前失效。'))},Math.max(0,Math.min(2147483647,result.expires_at-Date.now())));
  }catch(error){if(rev===revision){input.value='';copy.disabled=true;setText(note,tr('传输码暂未取得：{0}。可点击更新重试，原分享链接仍可使用。',[errorText(error.message)]))}}
  finally{if(rev===revision){loading=false;renew.disabled=false}}
 }
 renew.addEventListener('click',issue);
 copy.addEventListener('click',async()=>{if(!input.value)return;try{await navigator.clipboard.writeText(input.value);setText(note,tr('传输码已复制，请仅发给目标接收方。'))}catch{input.focus();input.select();setText(note,tr('请手动复制选中的传输码。'))}});
 return {clear,show:async data=>{clear();current=data;box.hidden=false;await issue()}};
}
if(typeof document!=='undefined'){
 const form=document.querySelector('#transfer-code-form');
 if(form){const input=form.querySelector('input'),button=form.querySelector('button'),status=document.querySelector('#transfer-code-status');
  input.addEventListener('input',()=>{input.value=input.value.toUpperCase()});
  form.addEventListener('submit',async event=>{event.preventDefault();if(button.disabled)return;button.disabled=true;input.readOnly=true;setText(status,tr('正在核对传输码…'));
   try{const result=await receiveCode(input.value);if(result)setText(status,tr('已识别传输方式，请在下方核对文件并选择保存位置。'))}catch(error){setText(status,errorText(error.message))}finally{button.disabled=false;input.readOnly=false}
  });
 }
}
