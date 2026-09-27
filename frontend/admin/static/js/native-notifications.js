/** Shared bounded notifications; text only, no external dependency and no layout reflow. */
const host=document.querySelector('[data-notifications]'),active=new Map();
const flashKey='teacher-admin-notice:v1';
const states={success:['✓',3000],error:['×',0],warning:['!',10000],info:['ⓘ',6000],progress:['…',0]};

export function notify(message,state='info',{id='operation',action=null,duration}={}){
 // A stable ID updates one progress/result bubble instead of flooding the page per record.
 if(!host)return;
 if(!Object.hasOwn(states,state))state='info';
 let item=active.get(id);
 if(!item){
  while(active.size>=4)active.values().next().value.close();
  const node=document.createElement('div');node.className='toast show admin-notice';node.dataset.noticeId=id;
  const icon=document.createElement('span');icon.className='admin-notice-icon';icon.setAttribute('aria-hidden','true');
  const body=document.createElement('div');body.className='toast-body';
  const text=document.createElement('span');text.dataset.noticeText='';
  const link=document.createElement('button');link.type='button';link.className='btn btn-outline-secondary btn-sm';link.hidden=true;
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='admin-notice-close';dismiss.textContent='×';dismiss.title='关闭此通知';dismiss.setAttribute('aria-label','关闭此通知');
  body.append(text,link);node.append(icon,body,dismiss);host.append(node);
  item={node,icon,text,link,timer:null,remaining:0,started:0,hover:false,focus:false};
  // Timers pause for both pointer and keyboard readers; repeated updates restart their budget.
  item.pause=()=>{if(item.timer){clearTimeout(item.timer);item.timer=null;item.remaining=Math.max(0,item.remaining-(performance.now()-item.started))}};
  item.resume=()=>{if(item.remaining>0&&!item.hover&&!item.focus&&!item.timer){item.started=performance.now();item.timer=setTimeout(item.close,item.remaining)}};
  item.close=()=>{item.pause();node.remove();active.delete(id)};
  node.addEventListener('mouseenter',()=>{item.hover=true;item.pause()});
  node.addEventListener('mouseleave',()=>{item.hover=false;item.resume()});
  node.addEventListener('focusin',()=>{item.focus=true;item.pause()});
  node.addEventListener('focusout',event=>{if(!node.contains(event.relatedTarget)){item.focus=false;item.resume()}});
  dismiss.addEventListener('click',item.close);active.set(id,item);
 }
 item.pause();item.node.dataset.state=state;
 item.node.setAttribute('role',state==='error'?'alert':'status');
 item.node.setAttribute('aria-live',state==='error'?'assertive':'polite');item.node.setAttribute('aria-atomic','true');
 item.icon.textContent=states[state][0];item.text.textContent=String(message).slice(0,1600);
 item.link.hidden=!action;item.link.textContent=action?.label||'';item.link.title=action?.title||action?.label||'';
 item.link.onclick=action?()=>action.run():null;
 item.remaining=duration??states[state][1];item.resume();return item.close;
}

export function rememberNotice(message,state,target){
 // Store a single short-lived success for a necessary same-origin redirect, bound to this session.
 try{
  const url=new URL(target,location.href);
  if(!host?.dataset.owner||url.origin!==location.origin)return;
  sessionStorage.setItem(flashKey,JSON.stringify({message:String(message).slice(0,300),state,path:url.pathname+url.search,owner:host.dataset.owner,session:host.dataset.session,expires:Date.now()+60000}));
 }catch{/* Saving a notification must never prevent the completed editor from navigating. */}
}

function consumeNotice(){
 // Remove before checking: refresh, a different account, or a different session cannot replay it.
 try{
  const raw=sessionStorage.getItem(flashKey);sessionStorage.removeItem(flashKey);
  if(!raw||raw.length>4000)return;
  const item=JSON.parse(raw);
  if(item.owner&&item.owner===host?.dataset.owner&&item.session===host.dataset.session&&item.path===location.pathname+location.search&&item.expires>Date.now()&&item.expires<=Date.now()+60000&&item.state==='success')notify(item.message,item.state,{id:'saved'});
 }catch{/* Browser storage may be disabled; form success still works. */}
}
consumeNotice();
