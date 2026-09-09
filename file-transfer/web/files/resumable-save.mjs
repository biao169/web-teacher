import {checkAbort,validateManifest} from '../../shared/manifest.mjs';
import {lanError} from '../../shared/lan.mjs';
import {validatePoint} from '../../shared/recovery.mjs';
import {verifyPrefix} from './checkpoint.mjs';
import {saveSingle,saveZip,saveDirectory,browserFileSupport} from './save.mjs';
async function child(root,path,create=false){const parts=path.split('/'),name=parts.pop();let parent=root;for(const part of parts)parent=await parent.getDirectoryHandle(part,{create});return{parent,name};}
async function outputFile(context,path,create=false){if(context.kind==='file')return context.handle;const{parent,name}=await child(context.handle,path,create);return parent.getFileHandle(name,{create});}
async function verifyDestination(context,bundle,summary,point,signal){
 const entries=bundle.manifest.entries.filter(e=>e.kind==='file'),sources=new Map();
 for(let index=0;index<=point.fileIndex&&index<entries.length;index++){const entry=entries[index],amount=index<point.fileIndex?BigInt(entry.sizeBytes):BigInt(point.offset);if(!amount&&index===point.fileIndex)continue;
  const handle=await outputFile(context,entry.relativePath),file=await handle.getFile();if(index<point.fileIndex&&BigInt(file.size)!==BigInt(entry.sizeBytes)||BigInt(file.size)<amount)throw lanError('FT_CHECKPOINT_INVALID');
  sources.set(entry.relativePath,async function*(readSignal){for(let at=0;at<file.size;at+=1048576){checkAbort(readSignal);yield new Uint8Array(await file.slice(at,at+1048576).arrayBuffer());}});
 }
 await verifyPrefix({...bundle,sources},summary,point,signal);
}
export async function saveResumable(remote,summary,{kind,scope=globalThis,signal,resumePoint,context=null,expectedName='',checkpointBytes=4194304,onCheckpoint=async()=>{},onDestination=()=>{}}){
 const bundle=remote.bundle,point=validatePoint(resumePoint,summary,bundle.manifest);validateManifest(bundle.manifest);checkAbort(signal);
 const canResume=kind==='directory'?browserFileSupport(scope).directoryWrite:kind==='file'&&browserFileSupport(scope).streamSave;
 if(!canResume){if(point.bytes!=='0'||point.fileIndex!==0)throw lanError('FT_RECOVERY_DESTINATION');return{result:kind==='zip'?await saveZip(bundle,{scope,signal}):kind==='file'?await saveSingle(bundle,bundle.manifest.entries[0],{scope,signal}):await saveDirectory(bundle,{scope,signal}),context:null};}
 if(!context){
  if(kind==='file'){const handle=await scope.showSaveFilePicker({suggestedName:bundle.manifest.entries.find(e=>e.kind==='file').relativePath.split('/').pop()});context={kind,handle,created:new Set(),fresh:point.fileIndex===0&&point.offset==='0'};}
  else{const root=await scope.showDirectoryPicker({mode:'readwrite'});if(point.fileIndex||point.offset!=='0')context={kind,handle:root,created:new Set(),fresh:false};else{const name='transfer-'+crypto.randomUUID();try{await root.getDirectoryHandle(name);throw lanError('FT_DESTINATION_EXISTS')}catch(e){if(e.name!=='NotFoundError')throw e}context={kind,handle:await root.getDirectoryHandle(name,{create:true}),created:new Set(),fresh:true};}}
  if(kind==='directory'&&expectedName&&(point.fileIndex||point.offset!=='0')&&context.handle.name!==expectedName)throw lanError('FT_RECOVERY_DESTINATION');
 }
 if(context.kind!==kind)throw lanError('FT_RECOVERY_DESTINATION');
 if(point.bytes!=='0'||point.fileIndex)await verifyDestination(context,bundle,summary,point,signal);
 onDestination(context);
 let since=0,writable=null,index=0;
 try{
  if(kind==='directory')for(const entry of bundle.manifest.entries.filter(e=>e.kind==='directory')){checkAbort(signal);const{parent,name}=await child(context.handle,entry.relativePath,true);await parent.getDirectoryHandle(name,{create:true});}
  for(const entry of bundle.manifest.entries.filter(e=>e.kind==='file')){
   const current=index++;if(current<point.fileIndex)continue;const interval=Math.max(checkpointBytes,Math.ceil(Number(entry.sizeBytes)/32));checkAbort(signal);const start=current===point.fileIndex?Number(point.offset):0;
   let handle;
   if(kind==='directory'){
    try{handle=await outputFile(context,entry.relativePath);if(!context.created.has(entry.relativePath)&&!(current===point.fileIndex&&(start>0||point.fileIndex>0))){const file=await handle.getFile();if(file.size!==0)throw lanError('FT_DESTINATION_EXISTS');}}
    catch(e){if(e.name!=='NotFoundError')throw e;handle=await outputFile(context,entry.relativePath,true);}context.created.add(entry.relativePath);
   }else handle=context.handle;
   writable=await handle.createWritable({keepExistingData:start>0});if(start){await writable.truncate(start);await writable.seek(start);}
   let position=start;
   for await(const bytes of bundle.sources.get(entry.relativePath)(signal)){
    checkAbort(signal);await writable.write(bytes);position+=bytes.length;since+=bytes.length;
    if(since>=interval&&position<Number(entry.sizeBytes)){
     await writable.close();writable=null;await onCheckpoint(remote.point());checkAbort(signal);since=0;
     writable=await handle.createWritable({keepExistingData:true});await writable.seek(position);
    }
   }
   if(position!==Number(entry.sizeBytes))throw lanError('FT_INTEGRITY');checkAbort(signal);await writable.close();writable=null;
   await onCheckpoint(remote.point());since=0;context.fresh=false;
  }
  return{result:{status:'saved',name:context.handle.name,files:summary.files,bytes:summary.totalBytes},context};
 }catch(error){try{await writable?.abort(error)}catch{}if(!error.code)error.code=error.name==='AbortError'?'FT_PAUSED':'FT_WRITE_FAILED';error.partialDirectory=kind==='directory'?context.handle.name:'';throw error;}
}
