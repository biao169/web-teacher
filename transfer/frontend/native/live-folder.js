import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
/** Transport-neutral adapter: existing local manifest + virtual file + directory sink. */
import {folderFile,metadata} from './folder-upload.js?v=0.15.96';
import {readManifest,folderSink} from './folder-receive.js?v=0.15.96';
export function selectedFolder(){
 const manifest=document.querySelector('[data-folder-preview]')?.folderSelection;
 if(!manifest)throw Error(tr("请先在上方选择并预览文件夹"));
 let maxFileBytes=0,offset=0,encodedBytes=0;
 for(let after=0;after<manifest.entries.length;after+=100){
  const start=offset,entries=manifest.entries.slice(after,after+100).map(e=>{const result={...metadata(e),offset};if(e.kind==='file'){offset+=e.size;maxFileBytes=Math.max(maxFileBytes,e.size)}return result});
  encodedBytes+=new TextEncoder().encode(JSON.stringify({entries,bytes:offset-start})).byteLength;
 }
 if(encodedBytes>2*1024*1024)throw Error(tr("目录清单超过在线模式2 MiB上限，请使用临时缓存模式"));
 return {manifest,file:folderFile(manifest),descriptor:{fileCount:manifest.fileCount,directoryCount:manifest.directoryCount,maxFileBytes}};
}
export async function submitManifest(call,manifest,stopped=()=>false,progress=()=>{}){
 for(let after=0;after<manifest.entries.length;after+=100){
  if(stopped())throw Error(tr("已取消目录配对"));
  const entries=manifest.entries.slice(after,after+100).map(metadata),result=await call('manifest',{after,entries});
  if(result.received!==after+entries.length)throw Error(tr("目录提交位置异常，请重新配对"));progress(result.received);
 }
 if(stopped())throw Error(tr("已取消目录配对"));await call('seal');
}
export async function directoryStream(parent,info,call,{stopped=()=>false,progress=()=>{}}={}){
 const manifest=await readManifest(call,info,stopped);if(!manifest||stopped())throw Error(tr("已取消目录接收"));
 const sink=await folderSink(parent,manifest,{progress});
 if(stopped()){await sink.abort();throw Error(tr("已取消目录接收"))}
 return {name:sink.name,get broken(){return sink.broken},get completed(){return sink.completed},write:data=>sink.write(data),abort:()=>sink.abort(),close:async()=>{if(!await sink.finish(stopped))throw Error(tr("目录尚未完整保存"))}};
}
