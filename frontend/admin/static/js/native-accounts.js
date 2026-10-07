/** Edit native role grants as one draft; hidden rows remain part of the form. */
const form=document.querySelector('[data-account-editor]');
if(form){
 const password=form.querySelector('[name=_password]'),confirm=form.querySelector('[name=_password_confirm]');
 if(password&&confirm){const validate=()=>confirm.setCustomValidity((password.value||confirm.value)&&password.value!==confirm.value?'两次输入的密码不一致':'');password.addEventListener('input',validate);confirm.addEventListener('input',validate)}
 const root=form.querySelector('[data-permissions]');
 if(root){
  const readonly=root.hasAttribute('data-readonly'),rows=[...root.querySelectorAll('[data-permission-row]')],boxes=[...root.querySelectorAll('[data-permission]')];
  const search=root.querySelector('[data-permission-search]'),category=root.querySelector('[data-permission-group]'),summary=root.querySelector('[data-permission-summary]'),undo=root.querySelector('[data-permission-undo]'),invalid=root.querySelector('[data-permission-invalid]');
  const initial=new Map(boxes.map(box=>[box,box.checked])),revisions=new WeakMap();let previous=[],applying=false;
  const visible=()=>rows.filter(row=>!row.hidden);
  const entry=row=>row.querySelector('[data-permission=view]');
  const actions=row=>[...row.querySelectorAll('[data-permission]:not([data-permission=view])')];
  function groupState(control,inputs){if(!control)return;const count=inputs.filter(i=>i.checked).length;control.checked=inputs.length>0&&count===inputs.length;control.indeterminate=count>0&&count<inputs.length;control.disabled=!inputs.length}
  function refresh(){
   const current=visible(),granted=rows.filter(r=>entry(r).checked).length,total=boxes.filter(i=>i.checked).length,changed=boxes.filter(box=>box.checked!==initial.get(box));
   summary.textContent='允许进入 '+granted+' / '+rows.length+' 个模块 · '+total+' 项授权；当前显示 '+current.length+' 个模块'+(changed.length?' · '+changed.length+' 项待保存':' · 无未保存权限变更');
   root.querySelector('[data-permission-empty]').hidden=!!current.length;
   root.querySelectorAll('[data-permission-heading]').forEach(heading=>heading.hidden=!current.some(row=>row.dataset.group===heading.dataset.permissionHeading));
   const detail=root.querySelector('[data-permission-changes]');detail.hidden=!changed.length;
   root.querySelector('[data-permission-change-summary]').textContent='待保存：新增 '+changed.filter(b=>b.checked).length+' 项，撤销 '+changed.filter(b=>!b.checked).length+' 项授权';
   const list=root.querySelector('[data-permission-change-list]');list.replaceChildren();
   changed.forEach(box=>{const item=document.createElement('li');item.textContent=(box.checked?'新增：':'撤销：')+box.getAttribute('aria-label');list.append(item)});
   const orphan=rows.some(row=>!entry(row).checked&&actions(row).some(box=>box.checked));invalid.hidden=!orphan;invalid.textContent=orphan?'已有授权包含未允许进入的操作。请开启对应入口或清除该行后再保存；原有授权尚未改动。':'';
   if(readonly)return;
   rows.forEach(row=>{actions(row).forEach(box=>box.disabled=!entry(row).checked);row.dataset.entryAllowed=String(entry(row).checked);groupState(row.querySelector('[data-permission-row-all]'),[...row.querySelectorAll('[data-permission]')])});
   root.querySelectorAll('[data-permission-column]').forEach(c=>groupState(c,current.map(row=>row.querySelector('[data-permission="'+c.dataset.permissionColumn+'"]'))));
   root.querySelectorAll('[data-permission-bulk]').forEach(button=>button.disabled=!current.length);undo.disabled=!previous.length;
  }
  function filter(){const q=search.value.trim().toLocaleLowerCase();rows.forEach(row=>row.hidden=!!((category.value&&row.dataset.group!==category.value)||!(row.dataset.moduleLabel+' '+row.dataset.module).toLocaleLowerCase().includes(q)));refresh()}
  function setBox(box,value){if(box.checked===value)return;box.checked=value;revisions.set(box,(revisions.get(box)||0)+1);box.dispatchEvent(new Event('change',{bubbles:true}))}
  function depend(box,value){setBox(box,value);const row=box.closest('[data-permission-row]');if(box.dataset.permission==='view'&&!value)actions(row).forEach(b=>setBox(b,false));else if(value&&box.dataset.permission!=='view')setBox(entry(row),true)}
  function batch(inputs,value,before=new Map(boxes.map(box=>[box,box.checked]))){
   if(readonly)return;applying=true;previous=[];inputs.forEach(box=>depend(box,value));
   boxes.forEach(box=>{if(before.get(box)!==box.checked)previous.push({box,before:before.get(box),after:box.checked,revision:revisions.get(box)})});applying=false;refresh();
  }
  search.addEventListener('input',event=>{if(!event.isComposing)filter()});search.addEventListener('compositionend',filter);category.addEventListener('change',filter);root.querySelector('[data-permission-filter]').addEventListener('click',filter);
  root.addEventListener('change',event=>{
   if(applying||readonly)return;const box=event.target;
   if(box.matches('[data-permission]')){
    revisions.set(box,(revisions.get(box)||0)+1);
    if(box.dataset.permission==='view'&&!box.checked){const before=new Map(boxes.map(b=>[b,b===box?true:b.checked]));batch([box],false,before)}else refresh();
   }else if(box.matches('[data-permission-row-all]'))batch([...box.closest('tr').querySelectorAll('[data-permission]')],box.checked);
   else if(box.matches('[data-permission-column]'))batch(visible().map(row=>row.querySelector('[data-permission="'+box.dataset.permissionColumn+'"]')),box.checked);
  });
  root.querySelectorAll('[data-permission-bulk]').forEach(button=>button.addEventListener('click',()=>batch(visible().flatMap(row=>[...row.querySelectorAll('[data-permission]')]),button.dataset.permissionBulk==='all')));
  undo?.addEventListener('click',()=>{
   applying=true;
   const restore=previous.filter(item=>revisions.get(item.box)===item.revision&&item.box.checked===item.after);
   // Restore actions first, then entrances, preserving manual edits and valid dependencies.
   for(const item of restore.filter(i=>i.box.dataset.permission!=='view'))if(!item.before||entry(item.box.closest('tr')).checked||restore.some(i=>i.box===entry(item.box.closest('tr'))&&i.before))setBox(item.box,item.before);
   for(const item of restore.filter(i=>i.box.dataset.permission==='view'))if(item.before||!actions(item.box.closest('tr')).some(b=>b.checked))setBox(item.box,item.before);
   previous=[];applying=false;refresh();
  });
  form.addEventListener('submit',event=>{if(!readonly&&rows.some(row=>!entry(row).checked&&actions(row).some(b=>b.checked))){event.preventDefault();event.stopImmediatePropagation();refresh();invalid.tabIndex=-1;invalid.focus()}},true);
  form.addEventListener('native-save-failed',refresh);refresh();
 }
}
