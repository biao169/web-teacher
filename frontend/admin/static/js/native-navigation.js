/** One navigation draft: visual conditions and raw path stay synchronized, while previews never save. */
import {assist} from './native-assistance.js';
import {attachHelp,refreshOptionHelp} from './native-field-help.js?v=0.15.88';
const root=document.querySelector('[data-navigation-editor]');
if(root){
 const config=JSON.parse(root.querySelector('[data-navigation-config]').textContent),form=root.closest('form'),target=root.querySelector('#nav-target'),rows=root.querySelector('[data-nav-conditions]'),feedback=root.querySelector('[data-nav-feedback]'),results=root.querySelector('[data-nav-results]'),button=root.querySelector('[data-nav-preview]'),add=root.querySelector('[data-nav-add]'),size=root.querySelector('[data-nav-size]');
 const path=form.elements.namedItem('path'),location=form.elements.namedItem('location'),slug=form.elements.namedItem('url_name'),kind=form.elements.namedItem('kind');
 const initial={table:config.table,conditions:structuredClone(config.conditions),path:path.value,location:location.value,slug:slug.value,kind:kind.value,lang:config.lang||'en'};
 let lang=config.lang||'en',conditions=structuredClone(config.conditions),controller,timer,generation=0,saving=false,composing=false,rawDirty=false;
 const tell=(message,state='info')=>{feedback.textContent=message;feedback.dataset.uiState=state};
 const cancel=()=>{clearTimeout(timer);generation++;controller?.abort();button.disabled=false;results.removeAttribute('aria-busy')};
 const requestData=()=>({uid:form.elements.namedItem('_uid').value});
 const sidebar=()=>location.value==='admin-sidebar';
 const active=()=>Boolean(target.value)&&['','admin-sidebar','header','hero','footer'].includes(location.value)&&['','route','button'].includes(kind.value);
 const specs=()=>config.modules[target.value]?.[sidebar()?'fields':'public_fields']||[];
 const conditionsData=()=>conditions.map(c=>sidebar()&&(!c.operator||c.operator==='eq')?{field:c.field,value:c.value}:c);
 const contextData=()=>({location:location.value,lang});
 // Invalid intermediate values remain editable; only valid server responses represent a preview.
 const writePath=()=>{
  if(!target.value)return;
  const query=new URLSearchParams();if(sidebar()){conditions.forEach(c=>query.append((c.operator==='contains'?'c.':'f.')+c.field,c.value));path.value='/admin/'+target.value+(conditions.length?'?'+query.toString():'');}
  else{const bytes=new TextEncoder().encode(JSON.stringify(conditions));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);const token=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');path.value='/'+lang+'/'+target.value+(conditions.length?'?nf='+token:'');}
  if(conditions.length&&!slug.value)slug.value='nav-'+crypto.randomUUID().slice(0,12);
 };
 const preview=async(page=1)=>{
  if(saving||composing)return;if(rawDirty){await parseRawPath();return}cancel();results.replaceChildren();
  if(!active()){tell('请选择内容模块和支持的显示位置、站内页面或按钮类型。');return}
  const ticket=generation;controller=new AbortController();button.disabled=true;results.setAttribute('aria-busy','true');tell('正在预览当前条件…');
  try{
   const value=await assist('navigation',{...requestData(),action:'preview',...contextData(),table:target.value,conditions:conditionsData(),page,size:Number(size.value)},{signal:controller.signal});
   if(ticket!==generation||saving)return;
   path.value=value.path;results.innerHTML=value.html;
   tell(`当前条件匹配 ${value.total} 条${sidebar()?'可查看':'公开'}记录；此预览不会保存导航。`, 'success');
  }catch(error){if(ticket!==generation||error.name==='AbortError'||saving)return;tell(error.message+' 草稿已保留，可修改条件或重试。','error')}
  finally{if(ticket===generation){button.disabled=false;results.removeAttribute('aria-busy')}}
 };
 const changed=()=>{cancel();rawDirty=false;results.replaceChildren();writePath();tell('固定条件草稿已修改，统一保存后生效。','warning');if(!composing&&!saving)timer=setTimeout(()=>preview(),450)};
 const renderRows=()=>{
  rows.replaceChildren();add.disabled=!target.value||conditions.length>=12;
  const fieldSpecs=specs();
  conditions.forEach((condition,index)=>{
   const row=document.createElement('div');row.className='native-nav-condition';
   const select=document.createElement('select');select.className='form-select form-select-sm';select.setAttribute('aria-label',`固定字段 ${index+1}`);
   fieldSpecs.forEach(spec=>{const option=new Option(spec.label,spec.key);option.disabled=conditions.some((c,i)=>i!==index&&c.field===spec.key);select.add(option)});select.value=condition.field;
   const spec=fieldSpecs.find(s=>s.key===condition.field),choices=spec?.kind==='boolean'?['1','0']:spec?.enum||[];
   const operator=document.createElement('select');operator.className='form-select form-select-sm';operator.dataset.navOperator='';operator.setAttribute('aria-label',`匹配方式 ${index+1}`);
   const allowed=spec?.operators||['eq'];for(const op of allowed)operator.add(new Option(op==='contains'?'包含':'等于',op));
   const current=condition.operator||'eq';if(!allowed.includes(current))operator.add(new Option('请改为支持的方式',current));operator.value=current;operator.setCustomValidity(allowed.includes(current)?'':'当前目标不支持此匹配方式');
   operator.addEventListener('change',()=>{condition.operator=operator.value;operator.setCustomValidity(allowed.includes(operator.value)?'':'当前目标不支持此匹配方式');changed()});
   const input=document.createElement(choices.length?'select':'input');input.className=choices.length?'form-select form-select-sm':'form-control form-control-sm';input.setAttribute('aria-label',`筛选值 ${index+1}`);
   if(choices.length){input.add(new Option('请选择筛选值',''));choices.forEach(value=>input.add(new Option(spec.kind==='boolean'?(value==='1'?'✓ 开启':'○ 关闭'):String(value),String(value))))}
   else{input.type='text';input.maxLength=500;input.placeholder=spec?.kind==='integer'?'填写整数':'填写关键词或精确值，可使用中文';}
   input.value=condition.value;input.required=true;input.dataset.navConditionValue='';
   select.setCustomValidity(spec?'':'请选择当前显示范围允许的字段');
   select.addEventListener('change',()=>{condition.field=select.value;condition.value='';condition.operator=fieldSpecs.find(f=>f.key===select.value)?.default_operator||'eq';renderRows();changed()});
   input.addEventListener('input',()=>{condition.value=input.value;changed()});
   input.addEventListener('compositionstart',()=>{composing=true;cancel()});input.addEventListener('compositionend',()=>{composing=false;condition.value=input.value;changed()});
   input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();preview()}});
   const remove=document.createElement('button');remove.type='button';remove.className='btn btn-outline-danger btn-sm';remove.textContent='⌫ 删除';remove.title='删除此固定条件，保存后生效';remove.dataset.navRemove=String(index);
   remove.addEventListener('click',()=>{conditions.splice(index,1);renderRows();changed()});
   row.append(select,operator,input,remove);rows.append(row);attachHelp(select,'固定此字段；与其他条件同时满足，不能重复。');attachHelp(input,choices.length?'选择精确匹配值；保存前不能为空。':'按所选包含或等于匹配；1–500字符，不含控制字符。');
  });
 };
 const parseRawPath=async()=>{
  cancel();results.replaceChildren();if(!['','admin-sidebar','header','hero','footer'].includes(location.value)){tell('此位置不支持固定筛选，原路径保留。');return}
  const ticket=generation,value=path.value;controller=new AbortController();tell('正在读取路径中的条件…');
  try{
   const parsed=await assist('navigation',{...requestData(),action:'parse',...contextData(),path:value},{signal:controller.signal});
   if(ticket!==generation||saving||path.value!==value)return;
   rawDirty=false;lang=parsed.lang||lang;target.value=parsed.table;conditions=parsed.conditions;renderRows();path.value=parsed.path;syncNavigationPresentation();
   if(parsed.can_preview)preview();else tell('条件已读取；没有目标模块查看权限，不能显示匹配名单。','warning');
  }catch(error){if(ticket===generation&&!saving&&error.name!=='AbortError')tell(error.message+' 原路径已保留，请修正。','error')}
 };
 target.addEventListener('change',()=>{
  cancel();conditions=[];results.replaceChildren();renderRows();
  if(!target.value){tell('尚未选择目标；下方原路径仍保留。');return}
  if(!location.value)location.value='header';if(!['route','button'].includes(kind.value))kind.value='route';refreshOptionHelp(location);refreshOptionHelp(kind);if(!slug.value)slug.value='nav-'+crypto.randomUUID().slice(0,12);changed();syncNavigationPresentation();
 });
 add.addEventListener('click',()=>{
  const spec=specs().find(f=>f.key!=='uid'&&!conditions.some(c=>c.field===f.key))||specs().find(f=>!conditions.some(c=>c.field===f.key));if(!spec||conditions.length>=12)return;
  conditions.push({field:spec.key,operator:spec.default_operator||'eq',value:''});renderRows();changed();rows.lastElementChild.querySelector('[data-nav-condition-value]')?.focus();
 });
 root.querySelector('[data-nav-reset]').addEventListener('click',()=>{
  cancel();rawDirty=false;lang=initial.lang;target.value=initial.table;conditions=structuredClone(initial.conditions);path.value=initial.path;location.value=initial.location;slug.value=initial.slug;kind.value=initial.kind;results.replaceChildren();renderRows();refreshOptionHelp(location);refreshOptionHelp(kind);syncNavigationPresentation();tell('筛选草稿已恢复为打开页面时的设置，其他字段保留。');
 });
 path.addEventListener('input',()=>{cancel();rawDirty=true;results.replaceChildren();tell('路径草稿已修改，正在同步条件…','warning');if(!saving)timer=setTimeout(parseRawPath,450)});
 location.addEventListener('change',()=>{cancel();results.replaceChildren();renderRows();syncNavigationPresentation();if(target.value){writePath();tell('显示位置已更改；请核对字段与匹配方式后预览。','warning')}else if(path.value)parseRawPath()});
 kind.addEventListener('change',()=>{cancel();results.replaceChildren();syncNavigationPresentation()});
 button.addEventListener('click',()=>preview());size.addEventListener('change',()=>preview());
 results.addEventListener('click',event=>{const page=event.target.closest('[data-match-page]');if(page&&!page.disabled)preview(Number(page.dataset.matchPage))});
 form.addEventListener('submit',()=>{saving=true;cancel()});form.addEventListener('native-save-failed',()=>{saving=false});

 // Presets and presentation share the existing path/condition draft, without erasing inactive fields.
 const preset=root.querySelector('#nav-route-preset'),adminTarget=root.querySelector('#nav-admin-target'),fragment=form.elements.namedItem('fragment'),icon=form.elements.namedItem('icon'),style=form.elements.namedItem('style');
 function syncNavigationPresentation(){
  const sidebar=location.value==='admin-sidebar';
  adminTarget.value=sidebar?target.value:'';
  const route=path.value.split('?')[0].split('#')[0],option=[...preset.options].find(o=>o.value===route)||[...preset.options].find(o=>o.value==='/zh/'+target.value);
  preset.value=sidebar?'':option?.value||'';
  const guidance=root.querySelector('[data-nav-guidance]');
  guidance.textContent=sidebar?'前台界面与后台界面二选一；后台支持等于或包含，附加搜索只缩小范围。':kind.value==='external'?'外部链接不支持固定筛选。':'前台界面与后台界面二选一；前台只筛选公开内容，条件之间同时满足。';
  const pending=root.querySelector('[data-nav-pending]');pending.hidden=sidebar;
  root.querySelector('[data-nav-description]').textContent=sidebar?'后台预览按当前账号权限读取；条件之间同时满足，支持文本包含匹配。':'前台预览只读取公开内容；项目私密字段不参与筛选或显示。';
  const sample=root.querySelector('[data-nav-sample]');sample.hidden=!sidebar;
  sample.dataset.navStyle=['normal','primary','secondary'].includes(style.value)?style.value:'normal';
  sample.querySelector('use').setAttribute('href','/assets/shared/icons.svg#'+(['file','user','book','search'].includes(icon.value)?icon.value:'file'));
  sample.querySelector('[data-nav-sample-title]').textContent=form.elements.namedItem('title').value||'入口外观预览';
  fragment.closest('.native-field').hidden=kind.value!=='anchor'&&!fragment.value;
  root.querySelector('[data-nav-apply-anchor]').hidden=sidebar||kind.value!=='anchor';
 }
 preset.addEventListener('change',()=>{
  if(!preset.value)return;
  if(location.value==='admin-sidebar'){location.value='header';refreshOptionHelp(location)}
  cancel();path.value=preset.value;rawDirty=false;conditions=[];target.value='';renderRows();
  if(!location.value){location.value='header';refreshOptionHelp(location)}
  if(!kind.value||kind.value==='external'){kind.value='route';refreshOptionHelp(kind)}
  results.replaceChildren();syncNavigationPresentation();tell('已应用站内页面路径，其他字段保留；统一保存后生效。');
  if(/^\/(en|zh)\/[^/?#]+$/.test(path.value)&&config.modules[path.value.split('/')[2]])parseRawPath();
 });
 adminTarget.addEventListener('change',()=>{
  if(!adminTarget.value)return;
  location.value='admin-sidebar';refreshOptionHelp(location);
  target.value=adminTarget.value;target.dispatchEvent(new Event('change'));
 });
 root.querySelector('[data-nav-apply-anchor]').addEventListener('click',()=>{
  if(location.value==='admin-sidebar'){tell('后台固定入口不支持页面锚点。','warning');return}
  const name=fragment.value.trim().replace(/^#/,'');
  if(!name||/[\s#/?]/.test(name)||name.length>200){tell('锚点使用1–200个非空白字符，不含#、/、?；例如main。','error');return}
  if(!path.value.startsWith('/')||path.value.startsWith('//')){tell('先填写站内路径，例如/zh。','error');return}
  cancel();path.value=path.value.split('#')[0]+'#'+encodeURIComponent(name);rawDirty=false;tell('锚点已写入路径；请确认目标页面存在此区域，再统一保存。');
 });
 for(const input of [location,kind,icon,style,fragment,form.elements.namedItem('title')])input.addEventListener('input',syncNavigationPresentation);
 syncNavigationPresentation();
 renderRows();if(config.error)tell(config.error,'error');else if(config.table&&!config.can_preview)tell('已回显导航条件；没有目标模块查看权限，不能显示名单。','warning');
}
