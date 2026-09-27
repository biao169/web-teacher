import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
// Local metadata only. File contents are neither read nor uploaded in this step.
export const LIMITS=Object.freeze({files:10000,directories:2000,depth:32,pathLength:1024});
function segment(name){
 if(typeof name!=='string'||!name||name.length>255||name==='.'||name==='..'||/[\u0000-\u001f\u007f<>:"/\\|?*]/u.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error(joinText(tr("文件或目录名称不能安全地跨平台保存："),String(name).slice(0,80)));
 return name;
}
export function validPath(path,limits=LIMITS){
 if(typeof path!=='string'||path.length>limits.pathLength)throw Error(tr("相对路径过长"));
 const parts=path.split('/');if(parts.length>limits.depth)throw Error(joinText(joinText(tr("目录层级超过 "),limits.depth),tr(" 层")));parts.forEach(segment);return parts.join('/');
}
function builder(rootName,options={}){
 segment(rootName);const limits={...LIMITS,...options.limits},entries=[],seen=new Map();let fileCount=0,directoryCount=1,totalBytes=0;
 const check=()=>{if(options.signal?.aborted)throw Error(tr("已取消扫描"))};
 function add(path,kind,file){
  check();path=validPath(path,limits);const key=path.normalize('NFC').toLowerCase(),old=seen.get(key);
  if(old){if(old.path===path&&old.kind==='directory'&&kind==='directory')return;throw Error(joinText(tr("目录路径重复或大小写冲突："),path))}
  const slash=path.lastIndexOf('/');if(slash>=0)add(path.slice(0,slash),'directory');
  if(kind==='file'){
   if(!Number.isSafeInteger(file.size)||file.size<0||!Number.isSafeInteger(totalBytes+file.size))throw Error(tr("文件大小或总大小超出安全计数范围"));
   if(fileCount>=limits.files)throw Error(joinText(tr("文件数量超过预览上限 "),limits.files));fileCount++;totalBytes+=file.size;
  }else{if(directoryCount>=limits.directories)throw Error(joinText(tr("目录数量超过预览上限 "),limits.directories));directoryCount++}
  const item=kind==='file'?{kind,path,size:file.size,lastModified:file.lastModified||0,file}:{kind,path};seen.set(key,item);entries.push(item);
 }
 async function tick(){check();options.onProgress?.({fileCount,directoryCount,totalBytes});if(entries.length%64===0)await new Promise(resolve=>setTimeout(resolve,0));check()}
 function finish(emptyDirectoriesKnown){check();entries.sort((a,b)=>{const left=a.path.split('/'),right=b.path.split('/');for(let i=0;i<Math.min(left.length,right.length);i++){if(left[i]!==right[i])return left[i]<right[i]?-1:1}return left.length-right.length});return {version:1,rootName,entries,fileCount,directoryCount,totalBytes,emptyDirectoriesKnown}}
 return {add,tick,finish,check,limits};
}
export async function fromHandle(handle,options={}){
 if(!handle||handle.kind!=='directory')throw Error(tr("请拖入一个文件夹，而不是单个文件"));
 const b=builder(handle.name,options);
 async function walk(dir,prefix='',depth=0){
  b.check();if(depth>b.limits.depth)throw Error(tr("目录层级超过预览上限"));
  for await(const child of dir.values()){
   b.check();const path=prefix?prefix+'/'+segment(child.name):segment(child.name);
   if(child.kind==='directory'){b.add(path,'directory');await b.tick();await walk(child,path,depth+1)}
   else if(child.kind==='file'){const file=await child.getFile();b.add(path,'file',file);await b.tick()}
   else throw Error(tr("无法识别的目录条目"));
  }
 }
 await walk(handle);return b.finish(true);
}
export async function fromFileList(files,options={}){
 if(!files?.length)throw Error(tr("未选中文件；兼容选择器不能识别空文件夹"));
 const first=files[0].webkitRelativePath||'',root=first.split('/')[0],b=builder(root,options);
 for(const file of files){
  b.check();const full=file.webkitRelativePath||'';validPath(full,{...b.limits,depth:b.limits.depth+1,pathLength:b.limits.pathLength+root.length+1});
  if(!full.startsWith(root+'/'))throw Error(tr("请一次选择一个根文件夹"));
  b.add(full.slice(root.length+1),'file',file);await b.tick();
 }
 return b.finish(false);
}
export async function fromEntry(entry,options={}){
 if(!entry?.isDirectory)throw Error(tr("请拖入一个文件夹，而不是单个文件"));
 const b=builder(entry.name,options);
 async function walk(dir,prefix='',depth=0){
  b.check();if(depth>b.limits.depth)throw Error(tr("目录层级超过预览上限"));
  const reader=dir.createReader();
  while(true){
   b.check();const batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));b.check();if(!batch.length)break;
   for(const child of batch){const path=prefix?prefix+'/'+segment(child.name):segment(child.name);
    if(child.isDirectory){b.add(path,'directory');await b.tick();await walk(child,path,depth+1)}
    else if(child.isFile){b.add(path,'file',await new Promise((resolve,reject)=>child.file(resolve,reject)));await b.tick()}
    else throw Error(tr("无法识别的目录条目"));
   }
  }
 }
 await walk(entry);return b.finish(true);
}
// Call during the drop event: browser drag handles must be captured before awaiting.
export function captureDrop(items){
 const list=Array.from(items||[]).filter(item=>item.kind==='file');
 if(list.length!==1)throw Error(tr("请一次拖入一个文件夹"));
 const item=list[0],entry=item.webkitGetAsEntry?.();
 const promise=item.getAsFileSystemHandle?item.getAsFileSystemHandle():null;
 return async options=>{
  if(promise){let handle;try{handle=await promise}catch(error){if(!entry)throw error}if(handle)return fromHandle(handle,options)}
  if(entry)return fromEntry(entry,options);
  throw Error(tr("此浏览器不支持文件夹拖放，请使用“选择文件夹”"));
 };
}
