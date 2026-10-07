(() => {
 'use strict'; let busy=false;
 async function upload(file,csrf,notify=()=>{}) {
  if(busy) throw new Error('本页正在上传，请等待完成。');
  if(!file.size || file.size>20*1048576) throw new Error('单文件须为1字节至20MiB。');
  busy=true; let task;
  try {
   notify('正在预留上传空间…',0);
   task=(await TeacherHTTP.request('/api/v1/admin/media/uploads',{method:'POST',csrf,data:{filename:file.name,size_bytes:file.size}})).data;
   if(!/^[a-f0-9]{32}$/.test(task.uid)||task.chunk_bytes!==1048576)throw new Error('任务响应无效，请到上传中列表核对。');
   const endpoint='/api/v1/admin/media/'+task.uid;
   for(let offset=0,i=0;offset<file.size;offset+=task.chunk_bytes,i++) {
    notify('正在逐块上传…',Math.round(offset/file.size*100),task);
    await TeacherHTTP.request(endpoint+'/parts/'+i,{method:'PUT',csrf,binary:file.slice(offset,offset+task.chunk_bytes),timeoutMs:45000});
   }
   notify('正在校验完整性…',100,task);
   const result=(await TeacherHTTP.request(endpoint+'/complete',{method:'POST',csrf,data:{},timeoutMs:75000})).data;
   if(result.status!=='ready')throw new Error('状态未确认，请核对任务。');
   return result;
  } catch(error) {error.task=task;throw error;} finally {busy=false;}
 }
 window.TeacherUpload=Object.freeze({upload});
})();
