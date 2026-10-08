// Real R2 binding calls, native streams, one storage operation per engine tick.
import {PeerError,releasePeerResponse,cleanupFailure} from './transport.mjs';
const missingUpload=e=>/\(10024\)\s*$/.test(String(e?.message||''))||e?.code==='NoSuchUpload';
const conflict=message=>new PeerError(message,'conflict');
export const PART_BYTES=5*1024*1024;
export class R2Media {
  constructor(bucket,peer){this.bucket=bucket;this.peer=peer;}
  verify(obj,f){
    if(!obj||obj.size!==f.total_bytes||obj.customMetadata?.sync_operation!==f.operation_id||obj.customMetadata?.sync_source!==f.source_version)throw conflict('Unowned completion');
    return {key:f.staging_key,size:obj.size};
  }
  async step(f,item,parts){
    try{return await this.transfer(f,item,parts);}catch(e){
      if(!f.upload_id||!missingUpload(e))throw e;
      // A lost completion may have succeeded; verify before resetting receipts.
      const done=await this.bucket.head(f.staging_key);
      if(done){this.verify(done,f);if(f.committed_bytes!==f.total_bytes)throw conflict('Unexpected complete state');return {kind:'uploaded'};}
      return {kind:'reset-upload'};
    }
  }
  async transfer(f,item,parts){
    if(f.part_bytes!==PART_BYTES||f.total_bytes<0||f.total_bytes>1024*1024*1024||f.staging_key!=='sync/'+f.operation_id||!/^[a-f0-9]{64}$/.test(f.operation_id))throw conflict('Invalid media intent');
    // Handles lost complete() response before trying an invalidated upload ID.
    const done=await this.bucket.head(f.staging_key);
    if(done){this.verify(done,f);if(f.committed_bytes!==f.total_bytes)throw conflict('Unexpected complete state');return {kind:'uploaded'};}
    if(f.total_bytes===0){await this.bucket.put(f.staging_key,new Uint8Array(0),{customMetadata:{sync_operation:f.operation_id,sync_source:f.source_version}});return {kind:'uploaded'};}
    if(!f.upload_id){
      const upload=await this.bucket.createMultipartUpload(f.staging_key,{customMetadata:{sync_operation:f.operation_id,sync_source:f.source_version}});
      return {kind:'upload',upload_id:upload.uploadId};
    }
    const upload=this.bucket.resumeMultipartUpload(f.staging_key,f.upload_id);
    if(f.committed_bytes<f.total_bytes){
      const offset=f.committed_bytes,length=Math.min(PART_BYTES,f.total_bytes-offset);
      if(offset%PART_BYTES!==0)throw conflict('Invalid part offset');
      const response=await this.peer.read({kind:'media',task:item.task_id||'',module:item.module,record:item.record_id,file:f.source_file_id,version:f.source_version,record_version:item.source_version,snapshot_hash:item.snapshot_hash,offset,length,total:f.total_bytes},{stream:true});
      let part;
      try{part=await upload.uploadPart(offset/PART_BYTES+1,response.body);}
      finally{releasePeerResponse(response);if(response.body&&!response.body.locked)try{await response.body.cancel();}catch(e){cleanupFailure(e,'r2_response_cancel');}}

      if(part.partNumber!==offset/PART_BYTES+1||typeof part.etag!=='string')throw conflict('Invalid R2 receipt');
      return {kind:'part',offset,length,etag:part.etag};
    }
    if(parts.length!==Math.ceil(f.total_bytes/PART_BYTES)||parts.some((p,i)=>p.partNumber!==i+1))throw conflict('Incomplete receipts');
    await upload.complete(parts);this.verify(await this.bucket.head(f.staging_key),f);return {kind:'uploaded'};
  }
  async discard(f){
    const done=await this.bucket.head(f.staging_key);
    if(done){this.verify(done,f);await this.bucket.delete(f.staging_key);return;}
    if(f.upload_id)try{await this.bucket.resumeMultipartUpload(f.staging_key,f.upload_id).abort();}catch(e){if(!missingUpload(e))throw e;}
  }
}
