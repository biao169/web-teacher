import {adminFetch} from './native-access.js?v=0.15.28';
/** URL presentation and bounded browser-only image reads shared by fields and the chooser. */
import {watchMediaPreview,clearMediaPreviews} from './native-media.js?v=0.15.113';
export const mediaURL=row=>row.storage_kind==='external'?row.object_key:'/media/'+row.uid;
export const previewURL=row=>row.storage_kind==='external'?row.object_key:'/api/admin/media/'+encodeURIComponent(row.uid)+'/content';
export function lookupMedia(key,csrf,signal){
 // Signed external URLs travel in a private request body, never in lookup query strings.
 return adminFetch('/api/admin/media/lookup/by-key',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':csrf},body:JSON.stringify({key}),signal});
}
export const suggestedType=value=>{
 const extensions={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm',zip:'application/zip'};
 try{return extensions[new URL(value,location.origin).pathname.split('.').pop().toLowerCase()]||''}catch{return ''}
};
export function showLinkPreview(box,row,onStatus=()=>{}){
 // The remote browser decoder controls image/video display; declared MIME is never called verified.
 clearMediaPreviews(box);box.replaceChildren();let node;
 if(row.mime_type.startsWith('image/')){node=document.createElement('img');node.alt=row.title||'媒体预览';node.decoding='async'}
 else if(row.mime_type.startsWith('video/')){node=document.createElement('video');node.controls=true;node.preload='metadata';node.playsInline=true}
 else{const text=document.createElement('span');text.textContent=row.mime_type==='application/pdf'?'▤ PDF · 打开完整预览':'▧ 附件 · 打开查看';box.append(text);return}
 node.referrerPolicy='no-referrer';node.src=previewURL(row);box.append(node);watchMediaPreview(node,{host:box,onStatus});
}
export async function imageFile(row,signal){
 // CORS-capable, direct responses only. No backend proxy and no cookie/referrer sent to external hosts.
 const external=row.storage_kind==='external',controller=new AbortController(),abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,15000);
 try{
  const response=await adminFetch(previewURL(row),{signal:controller.signal,credentials:external?'omit':'same-origin',referrerPolicy:'no-referrer',redirect:external?'error':'follow',mode:'cors'});
  if(!response.ok)throw Error('原图暂不可读取，请检查媒体详情');
  const max=20*1048576;if(Number(response.headers.get('content-length'))>max)throw Error('原图文件不能超过20 MiB');
  const mime=response.headers.get('content-type')?.split(';')[0]||'';
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(mime))throw Error('返回内容不是受支持图片，请上传本地原图');
  if(!response.body)throw Error('原图响应为空');const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw Error('原图文件不能超过20 MiB');parts.push(value)}}finally{await reader.cancel().catch(()=>{})}
  return new File(parts,'source.'+({ 'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp'}[mime]),{type:mime});
 }catch(error){
  if(signal?.aborted)throw new DOMException('已取消','AbortError');
  if(external&&(error instanceof TypeError||error.name==='AbortError'))throw Error('外链未允许CORS、发生重定向或读取超时；请上传本地原图后编辑');
  throw error;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
