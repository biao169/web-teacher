/** Explicit one-at-a-time insertion; refresh never resumes and a lost response is not resent automatically. */
import {requestJSON} from './native-http.js?v=0.16.076';
import {notify} from './native-notifications.js';
const root=document.querySelector('[data-examples]');
if(root){
 let state=JSON.parse(root.dataset.initial),busy=false,stopped=false;
 const status=root.querySelector('[data-example-status]'),errors=root.querySelector('[data-example-errors]'),progress=root.querySelector('progress');
 function controls(){root.querySelectorAll('button,[name=example-group]').forEach(n=>n.disabled=n.matches('[data-example-stop]')?!busy:busy||n.name==='example-group'&&!state.groups.find(g=>g.id===n.value)?.allowed)}
 async function refresh(){const data=await requestJSON('/api/admin/examples/status');state=data;for(const g of data.groups)root.querySelector(`[data-example-count="${g.id}"]`).textContent=g.existing??'—';controls()}
 root.querySelector('[data-example-refresh]').onclick=()=>refresh().catch(e=>notify(e.message,'error'));
 root.querySelectorAll('[data-example-select]').forEach(b=>b.onclick=()=>root.querySelectorAll('[name=example-group]:enabled').forEach(n=>n.checked=b.dataset.exampleSelect==='all'));
 root.querySelector('[data-example-stop]').onclick=()=>{stopped=true;status.textContent='已暂停后续添加，当前项完成后停止。'};
 root.querySelector('[data-example-run]').onclick=async()=>{
  if(busy)return;const selected=new Set([...root.querySelectorAll('[name=example-group]:checked')].map(n=>n.value));const groups=state.groups.filter(g=>g.allowed&&selected.has(g.id));
  if(!groups.length){notify('请选择至少一组示例','error');return}busy=true;stopped=false;controls();errors.replaceChildren();let done=0,created=0,kept=0;
  progress.max=groups.reduce((n,g)=>n+g.total,0);progress.value=0;
  try{for(const group of groups){for(let index=1;index<=group.total;index++){
   if(stopped)break;status.textContent=`正在添加：${group.title} ${index}/${group.total}；新增 ${created}，保留 ${kept}。`;
   let data;try{data=await requestJSON('/api/admin/examples/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_csrf:root.dataset.csrf,group:group.id,index})},45000)}catch(error){throw Error(`${group.title}：${error.message}`)}
   created+=Number(data.status==='created');kept+=Number(data.status==='kept');progress.value=++done;
  }if(stopped)break}
  status.textContent=`${stopped?'已暂停':'本次完成'}：新增 ${created} 项，保留 ${kept} 项。`;notify(status.textContent,'success');
  }catch(e){const p=document.createElement('p');p.textContent=e.message;errors.append(p);status.textContent='添加已停止。已保存项目保留；刷新统计后可继续添加缺失项。';notify(e.message,'error')}
  finally{busy=false;await refresh().catch(e=>notify(e.message,'error'));controls()}
 };
 window.addEventListener('pagehide',()=>{stopped=true});controls();root.dataset.ready='true';
}
