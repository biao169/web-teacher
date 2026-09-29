/* Shared timestamp editor. Server independently resolves the selected IANA zone. */
(()=>{'use strict';const key='teacher-admin-timezone-v1';
const formatter=zone=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hourCycle:'h23'});
function local(ms,zone){const p=Object.fromEntries(formatter(zone).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${p.fractionalSecond}`;}
function choices(value,zone){if(!value)return [];const base=Date.parse(value+'Z');if(!Number.isFinite(base))throw Error('日期时间无效');const offsets=new Set([-36,-12,0,12,36].map(h=>{const t=base+h*3600000;return Date.parse(local(t,zone)+'Z')-t;}));return [...offsets].map(offset=>base-offset).filter(ms=>Date.parse(local(ms,zone)+'Z')===base).sort((a,b)=>a-b);}
for(const root of document.querySelectorAll('[data-zoned-time]')){
 const input=root.querySelector('[data-time-input]'),zone=root.querySelector('[data-time-zone]'),fold=root.querySelector('[data-time-fold]'),foldLabel=root.querySelector('[data-time-fold-label]'),status=root.querySelector('[data-time-status]');let current=zone.value;
 function update(){input.setCustomValidity('');zone.setCustomValidity('');fold.setCustomValidity('');try{
  formatter(zone.value);const found=choices(input.value,zone.value);foldLabel.hidden=found.length<2;
  if(input.value&&!found.length)throw Error('该当地时间因夏令时跳转不存在，请选择其他时间。');
  if(found.length>1&&!['0','1'].includes(fold.value))fold.setCustomValidity('此时间出现两次，请选择较早或较晚的一次。');
  const stamp=found[Number(fold.value)||0]??Date.now();const offset=new Intl.DateTimeFormat('zh-CN',{timeZone:zone.value,timeZoneName:'longOffset'}).formatToParts(new Date(stamp)).find(p=>p.type==='timeZoneName')?.value||zone.value;
  status.textContent=`${zone.value==='Asia/Shanghai'?'北京时间 · ':''}${zone.value} · ${offset}；保存为 UTC。切换时区保持实际时刻不变。`;
  return found;
 }catch(error){input.setCustomValidity(error instanceof RangeError?'请输入有效的 IANA 时区。':error.message);status.textContent=input.validationMessage;return null;}}
 try{const saved=localStorage.getItem(key);if(saved){formatter(saved);current=saved;zone.value=saved;}if(root.dataset.original){const ms=Date.parse(root.dataset.original);input.value=local(ms,current);const found=choices(input.value,current);fold.value=String(Math.max(0,found.indexOf(ms)));}}catch(_){current='Asia/Shanghai';zone.value=current;}
 update();
 input.addEventListener('input',()=>{fold.value='';update();});fold.addEventListener('change',update);
 zone.addEventListener('change',()=>{const next=zone.value.trim();zone.value=next;try{
  formatter(next);let instant=null;
  if(input.value){const found=choices(input.value,current);if(!found.length)throw Error('请先修正不存在的当地时间，再切换时区。');if(found.length>1&&!['0','1'].includes(fold.value))throw Error('请先选择重复时间的较早或较晚一次。');instant=found[Number(fold.value)||0];}
  current=next;if(instant!==null){input.value=local(instant,next);fold.value=String(Math.max(0,choices(input.value,next).indexOf(instant)));}
  try{localStorage.setItem(key,next);}catch(_){}update();
 }catch(error){zone.value=current;update();status.textContent=error instanceof RangeError?'时区无效，已恢复原选择。':error.message;}});
 root.closest('form')?.addEventListener('submit',event=>{update();if(!root.closest('form').reportValidity()){event.preventDefault();event.stopImmediatePropagation();}},true);
}
})();
