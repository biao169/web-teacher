import {adminFetch} from './native-access.js?v=0.15.28';
// One compact, session-only workflow: select → export or preflight → explicit restore.
// Sensitive documents/passwords never enter storage, URLs, logs, or HTML rendering.
import {notify} from './native-notifications.js';
import {base64,unbase64,encryptDocument,decryptDocument,MAX_FILE,MAX_PLAIN} from './native-data-crypto.js';
const root=document.querySelector('#data-tools');
if(root){
 const q=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)];
 const tables=()=>all('[name=backup-table]:checked').map(e=>e.value), csrf=root.dataset.csrf;
 const execute=q('[data-data-execute]'),status=q('[data-data-status]');let prepared=null,documentValue=null,mediaBodies=[],busy=false;
 async function request(path,value,raw=false){
  const response=await adminFetch('/api/admin/data/'+path,{method:'POST',headers:{'X-CSRF-Token':csrf,'Accept':'application/json',...(!raw?{'Content-Type':'application/json'}:{})},body:raw?value:JSON.stringify(value)});
  if(!response.ok){let v;try{v=await response.json()}catch{}throw Error(v?.error||'请求未完成，请检查网络或登录状态')}
  return response;
 }
 function download(value,name,type){
  const url=URL.createObjectURL(new Blob([value],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function sync(){
  const format=q('#data-format').value,encrypted=format==='acms';q('#data-export-password').disabled=!encrypted;q('#data-include-media').disabled=!encrypted||!tables().includes('media_assets');
  q('[data-data-selected]').textContent=`已选择 ${tables().length} 张表`;q('[data-data-confirm-field]').hidden=q('#data-mode').value!=='replace';
  execute.disabled=busy||!prepared?.token||!prepared?.ready;q('[data-data-cancel]').disabled=busy||!prepared?.token;
 }
 async function invalidate(){
  const previous=prepared;prepared=null;documentValue=null;mediaBodies=[];sync();
  if(previous?.token)try{await request('cancel',{token:previous.token})}catch{notify('旧预检已失效或未能清理；暂存文件可在下次预检时清理','warning')}
 }
 async function work(fn){
  if(busy)return;busy=true;const controls=all('#data-tools button,#data-tools input,#data-tools select,[data-data-execute]');const disabled=controls.map(e=>e.disabled);controls.forEach(e=>e.disabled=true);status.textContent='正在处理，请稍候…';
  try{await fn()}catch(error){status.textContent=error.message;notify(error.message,'error',{id:'data-tools'})}
  finally{controls.forEach((e,i)=>e.disabled=disabled[i]);busy=false;sync()}
 }
 root.addEventListener('change',event=>{if(event.target.matches('[name=backup-table],#data-file,#data-mode,#data-import-password')){invalidate();q('[data-data-report]').hidden=true}sync()});
 all('[data-data-select]').forEach(button=>button.addEventListener('click',()=>{all('[name=backup-table]').forEach(e=>e.checked=button.dataset.dataSelect==='all');invalidate();sync()}));
 q('[data-data-export]').addEventListener('click',()=>work(async()=>{
  const selected=tables(),format=q('#data-format').value,password=q('#data-export-password').value;
  if(!selected.length)throw Error('请先选择数据表');
  if(format==='acms'&&(!crypto.subtle||password.length<15))throw Error('加密备份需要安全浏览器环境及至少15位口令');
  const response=await request('export',{tables:selected,format});
  if(format!=='acms'){download(await response.blob(),'teacher-business.'+format,format==='csv'?'text/csv':'application/json');status.textContent='导出完成。';notify('文件已生成','success',{id:'data-tools'});return}
  const value=await response.json();value.media=[];let total=0;
  if(q('#data-include-media').checked&&selected.includes('media_assets')){
   const assets=value.tables.media_assets.filter(a=>['local','r2'].includes(a.storage_kind));
   if(assets.length>100||assets.reduce((n,a)=>n+a.size,0)>24*1024*1024)throw Error('媒体随包最多100项、24MiB；请先整理媒体或取消包含文件');
   for(const asset of assets){status.textContent=`读取媒体 ${value.media.length+1}/${assets.length}…`;const result=await request('media/'+encodeURIComponent(asset.uid),{stamp:asset.updated_at});const bytes=new Uint8Array(await result.arrayBuffer());total+=bytes.length;
    if(total>24*1024*1024)throw Error('媒体总大小超过24MiB');value.media.push({uid:asset.uid,size:bytes.length,sha256:result.headers.get('X-Content-SHA256'),data:base64(bytes)});
   }
  }
  status.textContent='正在浏览器中加密…';const encrypted=await encryptDocument(value,password);download(encrypted,'teacher-backup.acms','application/octet-stream');q('#data-export-password').value='';status.textContent='加密备份已生成，请妥善保管文件和口令。';notify('加密备份已生成','success',{id:'data-tools'});
 }));
 q('[data-data-preflight]').addEventListener('click',()=>work(async()=>{
  await invalidate();const file=q('#data-file').files[0];if(!file||!tables().length)throw Error('请选择文件和目标数据表');if(file.size>MAX_FILE)throw Error('文件超过48MiB');
  const acms=file.name.toLowerCase().endsWith('.acms');if(!acms&&!file.name.toLowerCase().endsWith('.json'))throw Error('仅支持JSON和ACMS，不接收CSV');
  const text=await file.text();const value=acms?await decryptDocument(text,q('#data-import-password').value):JSON.parse(text);
  if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_PLAIN)throw Error('解密后文档超过32MiB');
  if(!acms&&value.sensitive)throw Error('包含密钥的数据只允许从加密ACMS文件恢复');
  const media=value.media||[];if(!Array.isArray(media)||media.length>100||(!acms&&media.length))throw Error('媒体正文仅支持加密包，最多100项');
  mediaBodies=media.map(item=>unbase64(item.data,20*1024*1024));
  value.media=media.map(({data,...item})=>item);
  // The server receives bounded records/manifest, then one raw file at a time.
  documentValue=value;const args={document:value,tables:tables(),mode:q('#data-mode').value};prepared=await (await request('preflight',args)).json();
  const body=q('[data-data-counts]');body.replaceChildren();
  for(const count of prepared.counts){const row=document.createElement('tr');for(const value of [q(`[name=backup-table][value="${count.table}"]`).parentElement.textContent.trim(),count.create,count.update,count.delete]){const cell=document.createElement('td');cell.textContent=value;row.append(cell)}body.append(row)}
  const errors=q('[data-data-errors]');errors.replaceChildren();for(const error of prepared.errors){const li=document.createElement('li');li.textContent=`${error.table} · ${error.row}：${error.message}`;errors.append(li)}q('[data-data-report]').hidden=false;
  if(!prepared.token){status.textContent=`预检发现 ${prepared.error_count} 个问题，未修改业务数据。`;notify('预检未通过，请查看问题列表','warning',{id:'data-tools'});return}
  for(let i=0;i<mediaBodies.length;i++){status.textContent=`暂存媒体 ${i+1}/${mediaBodies.length}…`;await request(`stage/${prepared.token}/${i}`,mediaBodies[i],true)}
  prepared.ready=true;status.textContent='预检通过，有效期10分钟。请核对增删改数量，再点击底部“确认恢复”。';notify('预检通过，等待确认恢复','success',{id:'data-tools'});q('#data-import-password').value='';
 }));
 execute.addEventListener('click',()=>work(async()=>{
  if(!prepared?.token)throw Error('请先运行预检');
  const result=await (await request('execute',{token:prepared.token,document:documentValue,tables:tables(),mode:q('#data-mode').value,confirmation:q('#data-confirm').value})).json();
  prepared=null;documentValue=null;mediaBodies=[];q('#data-file').value='';status.textContent=`恢复已完成，写入 ${result.media_written} 个缺失媒体文件。${result.cleanup_pending?'暂存清理待重试。':''}`;notify('数据恢复已完成','success',{id:'data-tools'});
 }));
 q('[data-data-cancel]').addEventListener('click',()=>work(async()=>{await invalidate();q('[data-data-report]').hidden=true;status.textContent='预检已取消，网站数据未更改。'}));
 window.addEventListener('pagehide',()=>{q('#data-export-password').value='';q('#data-import-password').value='';prepared=null;documentValue=null;mediaBodies=[]});sync();
}
