import {codeCard} from './portal-codes.js?v=0.15.96';
import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
import {sendFolder} from './folder-upload.js?v=0.15.96';
import {bytes,transferPath} from './portal-core.js?v=0.15.158';
const panel=document.querySelector('[data-folder-preview]'),portal=document.querySelector('[data-portal]');
if(panel&&portal){
 const q=n=>document.getElementById('folder-'+n),key='transfer-folder-v1:'+portal.dataset.user;let active=false,stop=false,current=null;
 try{current=JSON.parse(sessionStorage.getItem(key)||'null')}catch{}
 const shortCode=codeCard(document.getElementById('folder-code-host'));
 const note=t=>{setText(q('send-status'),t)};
 function refresh(){q('send').disabled=active||!panel.folderSelection||!portal.dataset.user;setText(q('send'),current?tr("继续 / 核对目录任务"):tr("发送到临时缓存"));q('stop').disabled=!active;q('forget').disabled=active||!current}
 function remember(value){current=value;try{sessionStorage.setItem(key,JSON.stringify(value))}catch{note(tr("浏览器无法保存续传记录，请保留当前页面和任务编号。"))}setText(q('task'),joinText(tr("任务编号："),value.id))}
 if(current){setText(q('task'),joinText(tr("待核对任务："),current.id));note(tr("请选择原目录，再点击继续。浏览器不会保存文件内容。"))}
 if(!portal.dataset.user)note(tr("请先登录后发送目录。"));
 panel.addEventListener('folder-selection-ready',refresh);panel.addEventListener('folder-selection-reset',refresh);
 q('stop').addEventListener('click',()=>{stop=true;q('stop').disabled=true;note(tr("正在停止；已提交的分块会保留，可继续核对。"))});
 q('forget').addEventListener('click',()=>{current=null;try{sessionStorage.removeItem(key)}catch{}setText(q('task'),'');q('link').hidden=true;shortCode.clear();note(tr("已解除本页续传关联；服务器任务仍按缓存期限保留，可在任务管理中清理。"));refresh()});
 q('send').addEventListener('click',async()=>{
  if(active||!panel.folderSelection)return;active=true;stop=false;panel.folderBusy=true;refresh();q('choose').disabled=true;q('clear').disabled=true;note(tr("正在核对目录与额度…"));
  try{
   const result=await sendFolder({manifest:panel.folderSelection,current,csrf:portal.dataset.csrf,created:remember,stopped:()=>stop,progress:p=>{
    if(p.phase==='manifest'){note(tr("正在提交目录清单：{0} 项",[p.entries]));return}
    q('progress').value=p.total?p.bytes/p.total:1;panel.folderProgress=p;panel.dispatchEvent(new CustomEvent('folder-upload-progress'));let offset=0,completed=0;
    for(const entry of panel.folderSelection.entries)if(entry.kind==='file'){offset+=entry.size;if(offset<=p.bytes)completed++}
    note(tr("已确认 {0} / {1} · {2} / {3} 个文件",[bytes(p.bytes),bytes(p.total),completed,panel.folderSelection.fileCount]));
   }});
   if(result.complete){q('progress').value=1;q('link').value=new URL(transferPath('/s/'+current.token),location.origin).href;q('link').hidden=false;shortCode.show({mode:'offline',target:current.id});note(tr("整个目录已缓存，共用一个分享链接。接收方打开链接后，可选择本地目录，按原层级保存。"))}
   else note(tr("已停止发送，点击继续可核对已上传分块后续传。"));
  }catch(error){note(errorText(error.message)||tr("目录发送未完成，请核对任务状态后继续。"))}
  finally{active=false;panel.folderBusy=false;q('choose').disabled=false;q('clear').disabled=false;refresh()}
 });refresh();
}
