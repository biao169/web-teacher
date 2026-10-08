import {time} from './model.mjs?v=0.16.036';
import {notify} from '/assets/admin/js/native-notifications.js';
const dialog=document.querySelector('[data-sync-operation]');
let resolveConfirm=null,owner=null,started=null;
function show(title,text,state){
 if(!dialog)return;
 owner=dialog.open?owner:document.activeElement;
 dialog.querySelector('[data-operation-title]').textContent=title;
 dialog.querySelector('[data-operation-state]').textContent=state==='progress'?'执行中…':state==='error'?'操作失败':state==='confirm'?'请确认操作':state==='warning'?'需要处理':'操作完成';
 dialog.querySelector('[data-operation-log]').textContent=String(text).slice(0,24000);
 dialog.querySelector('[data-operation-confirm]').hidden=state!=='confirm';
 dialog.querySelector('[data-operation-close]').textContent=state==='confirm'?'取消':'关闭';
 if(!dialog.open)dialog.showModal();
}
export function begin(title='同步操作'){started=time(Date.now()/1000);show(title,'请求已提交，请等待服务端响应。关闭弹窗不会取消后台任务。','progress');}
export function finish(text,state='success',title='同步操作结果'){
 const log=(started?'开始：'+started+'\n':'')+'结果：'+time(Date.now()/1000)+'（北京时间）\n'+text;started=null;show(title,log,state);notify(text,state,{id:'site-sync',duration:state==='error'?0:4000});
}
export function confirmAction(text){
 if(resolveConfirm)return Promise.resolve(false);
 if(!dialog)return Promise.resolve(false);
 show('确认同步操作',text,'confirm');
 return new Promise(resolve=>{resolveConfirm=resolve;dialog.querySelector('[data-operation-close]').focus();});
}
export function isOperationOpen(){return !!dialog?.open;}
if(dialog){
 dialog.querySelector('[data-operation-close]').onclick=()=>dialog.close();
 dialog.querySelector('[data-operation-confirm]').onclick=()=>{const done=resolveConfirm;resolveConfirm=null;dialog.close();done?.(true);};
 dialog.addEventListener('close',()=>{const done=resolveConfirm;resolveConfirm=null;done?.(false);if(!dialog.open&&owner?.isConnected)owner.focus();});
}
