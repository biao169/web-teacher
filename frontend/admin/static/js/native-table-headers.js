/** Independent column filters and two-way sorting, shared by full pages and local panels. */
let serial=0;
export function mountTableHeaders(root,{query=()=>new URLSearchParams(location.search),apply,blocked=()=>false}={}){
 const listeners=new AbortController();let pop=null,trigger=null;
 const close=focus=>{pop?.remove();pop=null;trigger?.setAttribute('aria-expanded','false');if(focus&&trigger?.isConnected)trigger.focus()};
 const params=()=>new URLSearchParams(query());
 const prefix=button=>button.dataset.filterPrefix||((JSON.parse(button.dataset.options||'[]').length||!['text','json'].includes(button.dataset.kind))?'f.':'c.');
 const filterKey=button=>button.dataset.filterKey||prefix(button)+button.dataset.columnPopup;
 function paint(){
  const current=params(),sort=current.get('sort')||root.dataset.sortDefault,direction=current.get('direction')||root.dataset.directionDefault||'asc';
  root.querySelectorAll('[data-column-sort]').forEach(button=>{
   const active=button.dataset.columnSort===sort,next=active?(direction==='asc'?'desc':'asc'):(button.dataset.sortDefault||'asc');
   button.textContent=active?(direction==='asc'?'↑':'↓'):'↕';button.dataset.sortActive=String(active);
   button.title=(button.dataset.label||'此列')+'：'+(active?'当前'+(direction==='asc'?'升序':'降序')+'，':'')+'点击'+(next==='asc'?'升序':'降序');button.setAttribute('aria-label',button.title);
   button.closest('th')?.setAttribute('aria-sort',active?(direction==='asc'?'ascending':'descending'):'none');
  });
  root.querySelectorAll('[data-column-popup]').forEach(button=>{
   const active=button.hasAttribute('data-fixed-value')||!!current.get(filterKey(button))&&current.get(filterKey(button))!==(button.dataset.filterEmpty||'');
   button.dataset.filterActive=String(active);button.setAttribute('aria-label','筛选：'+(button.dataset.label||button.textContent)+(active?'（已设置）':''));button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
  });
 }
 function commit(values,kind,field){if(blocked())return;values.delete('page');close(false);apply(values,{kind,field});}
 root.addEventListener('click',event=>{
  const sorter=event.target.closest('[data-column-sort]');
  if(sorter&&root.contains(sorter)){
   if(blocked())return;const current=params(),field=sorter.dataset.columnSort,active=(current.get('sort')||root.dataset.sortDefault)===field,old=current.get('direction')||root.dataset.directionDefault||'asc';
   current.set('sort',field);current.set('direction',active?(old==='asc'?'desc':'asc'):(sorter.dataset.sortDefault||'asc'));commit(current,'sort',field);return;
  }
  const button=event.target.closest('[data-column-popup]');if(!button||!root.contains(button)||blocked())return;
  if(trigger===button&&pop){close(true);return}close(false);trigger=button;button.setAttribute('aria-expanded','true');
  pop=document.createElement('div');pop.className='native-popover';pop.setAttribute('role','dialog');pop.setAttribute('aria-label',button.title);pop.id='native-header-filter-'+(++serial);button.setAttribute('aria-controls',pop.id);
  const heading=document.createElement('strong');heading.textContent=button.dataset.label||button.textContent;pop.append(heading);
  const options=JSON.parse(button.dataset.options||'[]');if(button.dataset.kind==='boolean')options.push(1,0);const labels=JSON.parse(button.dataset.optionLabels||'{}'),key=filterKey(button),empty=button.dataset.filterEmpty||'';
  const input=document.createElement(options.length?'select':'input');input.className='form-control form-control-sm';
  if(options.length){input.add(new Option('不限',empty));options.filter(v=>String(v)!==empty).forEach(value=>input.add(new Option(labels[value]||String(value),value)))}else{input.placeholder='输入搜索内容';input.maxLength=500}
  const scale=Number(button.dataset.filterScale)||1;
  input.setAttribute('aria-label','筛选值');input.value=params().get(key)||empty;
  if(options.length&&button.dataset.filterMulti==='true'){
   input.multiple=true;input.size=Math.min(7,options.length+1);const raw=params().get(key)||'';let selected=[];
   try{selected=raw.startsWith('[')?JSON.parse(raw):raw?[raw]:[]}catch{}
   if(!Array.isArray(selected))selected=[];
   [...input.options].forEach(option=>option.selected=selected.map(String).includes(option.value));
   input.setAttribute('aria-label','筛选值（可多选）');
  }
  if(scale!==1&&input.value!=='')input.value=String(Number(input.value)/scale);
  if(button.hasAttribute('data-fixed-value')){input.value=scale===1?button.dataset.fixedValue:String(Number(button.dataset.fixedValue)/scale);input.disabled=true;input.title='此条件由当前导航固定'}pop.append(input);
  if(button.dataset.filterNote){const note=document.createElement('p');note.className='native-muted';note.textContent=button.dataset.filterNote;pop.append(note)}
  const save=document.createElement('button');save.type='button';save.className='btn btn-primary btn-sm';save.textContent='应用';
  save.addEventListener('click',()=>{const current=params();let value=input.value;if(input.multiple){const values=[...input.selectedOptions].map(option=>option.value).filter(v=>v!==empty);value=values.length?JSON.stringify(values):''}if(scale!==1&&value!==''){const raw=Number(value)*scale;if(!/^\d+(?:\.\d+)?$/.test(value)||!Number.isSafeInteger(raw)||raw<0){input.setCustomValidity('请输入可换算为整数个字节的非负KB数值');input.reportValidity();return}input.setCustomValidity('');value=String(raw)}if(!button.hasAttribute('data-fixed-value')){if(!button.dataset.filterKey){current.delete('f.'+button.dataset.columnPopup);current.delete('c.'+button.dataset.columnPopup)}if(value)current.set(key,value);else current.delete(key)}commit(current,'filter',button.dataset.columnPopup)});pop.append(save);
  const clear=document.createElement('button');clear.type='button';clear.className='btn btn-outline-secondary btn-sm';clear.textContent='清除此列';clear.disabled=button.hasAttribute('data-fixed-value');if(clear.disabled)clear.title='固定条件需在导航设置中修改';clear.addEventListener('click',()=>{input.value=empty;save.click()});pop.append(clear);
  pop.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target===input&&!e.isComposing){e.preventDefault();save.click()}});
  document.body.append(pop);const rect=button.getBoundingClientRect();pop.style.left=Math.max(8,Math.min(rect.left,innerWidth-278))+'px';pop.style.top=Math.max(8,Math.min(rect.bottom+6,innerHeight-pop.offsetHeight-8))+'px';(input.disabled?save:input).focus();
  pop.addEventListener('focusout',()=>setTimeout(()=>{if(pop&&!pop.contains(document.activeElement)&&document.activeElement!==trigger)close(false)},0));
 },{signal:listeners.signal});
 document.addEventListener('pointerdown',e=>{if(pop&&!pop.contains(e.target)&&!trigger?.contains(e.target))close(false)},{signal:listeners.signal});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pop){e.preventDefault();close(true)}},{signal:listeners.signal});
 window.addEventListener('resize',()=>close(false),{signal:listeners.signal});root.addEventListener('scroll',()=>close(false),{capture:true,signal:listeners.signal});
 paint();return {paint,get isOpen(){return Boolean(pop)},dispose(){close(false);listeners.abort()}};
}

// The dependency-free header entry is also loaded directly by the shared layout.
// An unavailable list action, thumbnail or width module cannot disable read navigation.
const listHeaders=new WeakMap();
export function mountListHeaders(root){
 if(!root)return null;
 if(listHeaders.has(root))return listHeaders.get(root);
 const viewportKey='teacher-native-list-viewport',notice=document.querySelector('[data-notifications]');
 const control=mountTableHeaders(root,{blocked:()=>root.getAttribute('aria-busy')==='true',apply:(params,action)=>{
  const url=new URL(location.href);url.search=params;
  try{sessionStorage.setItem(viewportKey,JSON.stringify({url:url.href,x:root.querySelector('.native-table-scroll').scrollLeft,at:Date.now(),owner:notice?.dataset.owner,session:notice?.dataset.session,...action}))}catch{}
  location.assign(url);
 }});
 const originalDispose=control.dispose;
 control.dispose=()=>{originalDispose();listHeaders.delete(root)};
 listHeaders.set(root,control);
 root.querySelectorAll('[data-column-popup],[data-column-sort]').forEach(button=>button.disabled=false);
 root.dataset.headersReady='true';
 try{
  const saved=JSON.parse(sessionStorage.getItem(viewportKey)||'null');sessionStorage.removeItem(viewportKey);
  if(saved&&saved.url===location.href&&saved.session===notice?.dataset.session&&saved.owner===notice?.dataset.owner&&Date.now()-saved.at<30000)requestAnimationFrame(()=>{
   if(!root.isConnected)return;
   root.querySelector('.native-table-scroll').scrollLeft=saved.x;
   const button=[...root.querySelectorAll(saved.kind==='sort'?'[data-column-sort]':'[data-column-popup]')].find(item=>(item.dataset.columnSort||item.dataset.columnPopup)===saved.field);
   button?.focus({preventScroll:true});
  });
 }catch{}
 return control;
}
document.querySelectorAll('.native-list[data-table]').forEach(mountListHeaders);
