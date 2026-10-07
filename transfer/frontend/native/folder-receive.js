import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
/** Validate paged metadata, then write one file at a time in a fresh child folder. */
import {validPath} from './folder-manifest.js?v=0.15.96';
const integer=(n,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
export async function readManifest(call,info,stopped=()=>false){
 validPath(info.name);if(info.name.includes('/')||!integer(info.size)||!integer(info.fileCount,10000)||!integer(info.directoryCount,2000)||info.directoryCount<1)throw Error(tr("目录分享信息无效"));
 const entries=[],seen=new Map();let files=0,dirs=1,size=0,after=0;
 do{
  if(stopped())return null;
  const page=await call('manifest',{after});
  if(page.name!==info.name||page.size!==info.size||page.fileCount!==info.fileCount||page.directoryCount!==info.directoryCount||page.total!==info.fileCount+info.directoryCount-1||!Array.isArray(page.entries)||page.entries.length>100)throw Error(tr("目录清单已变化或无效"));
  for(const e of page.entries){
   validPath(e.path);const key=e.path.normalize('NFC').toLowerCase();
   if(seen.has(key)||!['directory','file'].includes(e.kind)||e.offset!==size)throw Error(tr("目录路径冲突或字节位置无效"));
   const i=e.path.lastIndexOf('/');if(i>=0){const p=e.path.slice(0,i),old=seen.get(p.normalize('NFC').toLowerCase());if(!old||old.kind!=='directory'||old.path!==p)throw Error(tr("父目录缺失或名称不一致"))}
   if(e.kind==='file'){if(!integer(e.size)||!integer(size+e.size))throw Error(tr("文件大小无效"));size+=e.size;files++}else dirs++;
   seen.set(key,e);entries.push(e);
   if(files>info.fileCount||dirs>info.directoryCount||size>info.size)throw Error(tr("目录清单超出声明范围"));
  }
  after+=page.entries.length;
  if(page.next===null)break;
  if(page.next!==after||!page.entries.length)throw Error(tr("目录分页游标无效"));
 }while(true);
 if(files!==info.fileCount||dirs!==info.directoryCount||size!==info.size)throw Error(tr("目录清单不完整"));
 return {...info,entries};
}
async function absent(parent,name,kind){
 try{await parent[kind==='directory'?'getDirectoryHandle':'getFileHandle'](name);return false}catch(e){if(e.name==='NotFoundError')return true;if(e.name==='TypeMismatchError')return false;throw e}
}
export async function folderSink(parent,manifest,{progress=()=>{},touch=async()=>{}}={}){
 let root,name;
 for(let i=0;i<1000;i++){
  const suffix=i?' ('+i+')':'';name=manifest.name.slice(0,200-suffix.length)+suffix;
  if(await absent(parent,name,'directory')){root=await parent.getDirectoryHandle(name,{create:true});break}
 }
 if(!root)throw Error(tr("同名文件夹过多，请选择其他保存位置"));
 const directories=new Map([['',root]]);let index=0,stream=null,current=null,written=0,completed=0,lastTouch=Date.now(),broken=false;
 async function keepAlive(){if(Date.now()-lastTouch>30000){await touch();lastTouch=Date.now()}}
 async function advance(stopped=()=>false){
  while(index<manifest.entries.length&&!stream){
   if(stopped())return false;await keepAlive();const e=manifest.entries[index],slash=e.path.lastIndexOf('/'),dir=directories.get(slash<0?'':e.path.slice(0,slash)),leaf=e.path.slice(slash+1);
   if(!dir)throw Error(tr("父目录未创建"));
   if(!await absent(dir,leaf,e.kind))throw Error(joinText(tr("目标中出现同名条目，为避免覆盖已停止："),e.path));
   if(e.kind==='directory'){directories.set(e.path,await dir.getDirectoryHandle(leaf,{create:true}));index++;continue}
   const handle=await dir.getFileHandle(leaf,{create:true});stream=await handle.createWritable({mode:'exclusive'});current=e;
   if(!e.size){await stream.close();stream=null;current=null;index++;completed++;progress(completed,e.path)}
  }
  return true;
 }
 return {
  name,get broken(){return broken},get completed(){return completed},
  async write({position,data}){
   if(broken)throw Error(tr("本地写入失败，请取消后重新接收"));
   if(position!==written||data.byteLength>1048576)throw Error(tr("本地目录写入位置无效"));
   try{
    let consumed=0;const bytes=new Uint8Array(data.buffer||data,data.byteOffset||0,data.byteLength);
    while(consumed<bytes.byteLength){
     await advance();if(!stream||!current)throw Error(tr("目录数据超过清单"));
     const local=written-current.offset,n=Math.min(bytes.byteLength-consumed,current.size-local);
     if(n<=0)throw Error(tr("目录文件位置无效"));
     await stream.write({type:'write',position:local,data:bytes.subarray(consumed,consumed+n)});written+=n;consumed+=n;
     if(written===current.offset+current.size){const saved=current.path;await stream.close();stream=null;current=null;index++;completed++;progress(completed,saved)}
    }
   }catch(e){broken=true;throw e}
  },
  async finish(stopped=()=>false){
   if(broken)throw Error(tr("本地写入失败，请取消后重新接收"));
   // No data read for empty entries; process them even when total bytes is zero.
   try{if(!await advance(stopped))return false;if(written!==manifest.size||stream||index!==manifest.entries.length)throw Error(tr("目录尚未写入完整"));return true}catch(e){broken=true;throw e}
  },
  async abort(){if(stream){await stream.abort();stream=null}}
 };
}
