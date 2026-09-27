import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
/** One cached task; bounded manifests and existing hashed chunk uploader. */
import {request,upload} from './portal-core.js?v=0.15.96';
export const metadata=e=>e.kind==='file'?{kind:e.kind,path:e.path,size:e.size,lastModified:e.lastModified||0}:{kind:e.kind,path:e.path};
export function folderFile(manifest){
 const spans=[];let offset=0;
 for(const e of manifest.entries)if(e.kind==='file'){spans.push({file:e.file,start:offset,end:offset+e.size});offset+=e.size}
 return {name:manifest.rootName,size:offset,slice(start,end){
  if(end-start>1048576)throw Error(tr("目录分块超过内存窗口"));
  const parts=[];for(const s of spans){if(s.end<=start)continue;if(s.start>=end)break;parts.push(s.file.slice(Math.max(0,start-s.start),Math.min(s.end,end)-s.start))}
  return new Blob(parts);
 }};
}
export async function sendFolder({manifest,current,csrf,created=()=>{},progress=()=>{},stopped=()=>false,call=request,sleep,hash}){
 const post=(path,data={})=>call(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_csrf:csrf,...data})});
 if(!current){
  if(stopped())return {current:null,complete:false};
  current=await post('/api/folders',{name:manifest.rootName,size:manifest.totalBytes,fileCount:manifest.fileCount,directoryCount:manifest.directoryCount});created(current);
 }
 if(!/^[a-f0-9]{32}$/.test(current.id)||!/^[A-Za-z0-9_-]{43}$/.test(current.token))throw Error(tr("目录任务凭据无效，请核对任务列表"));
 const path='/api/folders/'+current.id;let page=await call(path+'/manifest'),seen=0;
 if(page.name!==manifest.rootName||page.size!==manifest.totalBytes||page.fileCount!==manifest.fileCount||page.directoryCount!==manifest.directoryCount)throw Error(tr("所选目录与原任务不一致，请重新选择原目录"));
 if(page.expired||!['uploading','ready'].includes(page.state))throw Error(tr("目录任务已暂停、到期或结束，请在任务管理中核对"));
 const received=page.received,ready=page.manifestReady;
 while(true){
  if(page.received!==received||page.manifestReady!==ready||page.entries.length>100)throw Error(tr("目录清单已变化，请停止其他发送窗口后重试"));
  for(const entry of page.entries){if(!manifest.entries[seen]||JSON.stringify(metadata(entry))!==JSON.stringify(metadata(manifest.entries[seen++])))throw Error(tr("目录内容、路径或修改时间与原任务不同，不能续传"))}
  if(stopped())return {current,complete:false};
  if(page.next===null)break;
  if(page.next!==seen||!page.entries.length)throw Error(tr("目录分页游标无效"));page=await call(path+'/manifest?after='+seen);
 }
 if(seen!==received)throw Error(tr("目录清单不完整"));
 for(let start=received;start<manifest.entries.length;start+=100){
  if(stopped())return {current,complete:false};
  const entries=manifest.entries.slice(start,start+100).map(metadata),result=await post(path+'/manifest',{after:start,entries});
  if(result.received!==start+entries.length)throw Error(tr("目录确认位置异常，请点击继续核对"));progress({phase:'manifest',entries:result.received});
 }
 if(stopped())return {current,complete:false};
 await post(path+'/seal');
 if(!manifest.totalBytes){progress({phase:'upload',bytes:0,total:0});return {current,complete:true}}
 return upload({file:folderFile(manifest),current,csrf,maxBytes:Number.MAX_SAFE_INTEGER,call,sleep,hash,stopped,progress:(bytes,total)=>progress({phase:'upload',bytes,total})});
}
