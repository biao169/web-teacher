import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
/** Frontend-only transport. Never retries a write automatically. */
export const transferBase=typeof document==='undefined'?'':document.querySelector('meta[name=transfer-base]')?.content||'';
export const transferPath=path=>transferBase+path;
export function shareURL(text,origin){const url=new URL(text,origin);if(url.origin!==origin||url.username||url.password||url.search||url.hash||!/^\/s\/(?:[A-Za-z0-9_-]{43}|tc\.[a-f0-9]{32}\.[a-f0-9]{64})$/.test(url.pathname.slice(transferBase.length))||!url.pathname.startsWith(transferBase+'/s/'))throw Error(tr("请粘贴当前快传站点的有效分享链接。"));return url.href}
export function bytes(n){return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`}
export async function request(path,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);try{const response=await fetch(transferPath(path),{...options,credentials:'same-origin',signal:controller.signal,headers:{Accept:'application/json',...options.headers}});let value;try{value=await response.json()}catch{throw Error(tr("响应无法确认，请核对任务后再操作。"))}if(!response.ok)throw Error(value.error||tr("请求失败（{0}）",[response.status]));return value}catch(error){if(error.name==='AbortError'||error instanceof TypeError)throw Error(tr("连接中断或超时，结果未知。不要重复创建任务；已有任务可点击继续核对进度。"));throw error}finally{clearTimeout(timer)}}
export async function upload({file,current,csrf,maxBytes,call=request,hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join(''),created=()=>{},progress=()=>{},stopped=()=>false,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||!file||file.size<1||file.size>maxBytes)throw Error(tr("文件为空或超过当前单文件上限。"));
 if(!file.name||file.name.length>200||/[\\/\x00\r\n]/.test(file.name))throw Error(tr("文件名不符合要求。"));
 let offset=0;
 async function wait(ms){while(ms>0&&!stopped()){const delay=Math.min(ms,1000);await sleep(delay);ms-=delay}}
 if(current){if(!/^[a-f0-9]{32}$/.test(current.id)||!/^[A-Za-z0-9_-]{43}$/.test(current.token))throw Error(tr("本地续传记录无效。"));const point=await call('/api/tasks/'+current.id);if(point.expired||!['uploading','ready'].includes(point.state))throw Error(tr("原任务已过期、暂停或结束，请在任务管理中核对。"));if(point.name!==file.name||point.size!==file.size)throw Error(tr("文件名称或大小与原任务不同。"));let batch=point;
 do{if(point.paged&&(batch.version!==point.version||batch.confirmed!==point.confirmed||batch.parts.length>64))throw Error(tr("任务在核对中发生变化，请重新核对。"));
 for(const part of batch.parts){if(!Number.isInteger(part.size)||part.size<1||part.size>1048576||offset+part.size>file.size||(point.paged&&part.offset!==offset))throw Error(tr("服务器分块记录异常。"));if(await hash(file.slice(offset,offset+part.size))!==part.sha256)throw Error(tr("已上传内容与所选文件不同，不能续传。"));offset+=part.size;progress(offset,file.size);if(stopped())return {current,complete:false}}
 if(!point.paged||batch.next_offset===null)break;
 if(batch.next_offset!==offset||batch.parts.length===0)throw Error(tr("分块分页游标异常。"));
 batch=await call('/api/tasks/'+current.id+'?after='+offset);
 }while(true);
 if(point.paged&&offset!==point.confirmed)throw Error(tr("服务器确认位置与分块记录不一致。"));
 if(point.state==='ready'&&offset!==file.size)throw Error(tr("服务器任务状态与分块记录不一致。"));if(offset<file.size&&point.wait_ms>0)await wait(point.wait_ms);
 }else{if(stopped())return {current:null,complete:false};current=await call('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_csrf:csrf,name:file.name,size:file.size})});if(!/^[a-f0-9]{32}$/.test(current.id)||!/^[A-Za-z0-9_-]{43}$/.test(current.token))throw Error(tr("创建响应异常，请先核对任务列表。"));created(current)}
 while(offset<file.size){if(stopped())return {current,complete:false};const end=Math.min(offset+1048576,file.size);const value=await call('/api/tasks/'+current.id+'/chunk',{method:'POST',headers:{'X-CSRF-Token':csrf,'X-Offset':String(offset)},body:file.slice(offset,end)});if(value.offset!==end)throw Error(tr("上传响应位置异常，请点击继续核对进度。"));offset=end;progress(offset,file.size);if(offset<file.size&&value.wait_ms>0)await wait(value.wait_ms)}
 return {current,complete:true};
}
