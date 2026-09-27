/** Reuse the existing request/CSRF pipeline, preserving unsaved settings during task refresh. */
export function mountSettings({api,request,loadUsage}){
 const controls=document.querySelector('#transfer-controls');if(!controls)return;
 const rules=controls.querySelector('#custom-rules'),message=controls.querySelector('#settings-feedback'),save=controls.querySelector('#save-settings');
 let busy=false;
 controls.querySelector('#add-rule').addEventListener('click',()=>{if(busy)return;if(rules.children.length>=100){message.textContent='专属规则最多100条。';return}rules.append(document.querySelector('#rule-template').content.cloneNode(true));rules.lastElementChild.querySelector('[data-rule-field=id]').focus()});
 rules.addEventListener('click',event=>{if(!busy&&event.target.closest('[data-remove-rule]')&&confirm('移除此专属规则？保存设置后生效。'))event.target.closest('[data-rule]').remove()});
 const fields=node=>Object.fromEntries([...node].map(el=>[el.dataset.ruleField||el.id,el.type==='checkbox'?el.checked:el.value]));
 save.addEventListener('click',async()=>{
  if(busy)return;
  if([...controls.querySelectorAll('input,select')].some(el=>!el.reportValidity()))return;
  const data={revision:Number(save.dataset.revision),...fields(controls.querySelectorAll('[data-setting]')),customRules:[...rules.querySelectorAll('[data-rule]')].map(row=>fields(row.querySelectorAll('[data-rule-field]')))};
  busy=true;controls.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
  try{const result=await api('/api/settings',data);save.dataset.revision=result.revision;message.textContent='设置已保存；新额度用于后续授权。';loadUsage();refreshUsage()}catch(error){message.textContent=error.message+'；草稿已保留。'}finally{busy=false;controls.querySelectorAll('input,select,button').forEach(el=>el.disabled=false)}
 });
 const format=value=>value===null?'不限':new Intl.NumberFormat('zh-CN').format(value)+' 字节';let generation=0;
 async function refreshUsage(){
  const token=++generation,status=document.querySelector('#admin-usage-status'),body=document.querySelector('#admin-usage');status.textContent='正在读取用量…';
  const query=new URLSearchParams({uid:document.querySelector('#usage-uid').value.trim(),role:document.querySelector('#usage-role').value.trim()});
  try{const result=await request('/api/admin/usage?'+query);if(token!==generation)return;body.replaceChildren();
   for(const [scope,values] of [['全站',result.total],[result.scope,result.identity]])for(const [key,label] of [['daily','今日'],['weekly','本周'],['monthly','本月']]){const row=document.createElement('tr');for(const text of [scope+' / '+label,...['charged_and_reserved','limit','remaining'].map(k=>format(values[key][k]))]){const cell=document.createElement('td');cell.textContent=text;row.append(cell)}body.append(row)}status.textContent='结算时区：'+result.timeZone+'；周一开始。';
  }catch(error){if(token===generation){body.replaceChildren();status.textContent=error.message}}
 }
 document.querySelector('#refresh-usage').addEventListener('click',refreshUsage);refreshUsage();
}
