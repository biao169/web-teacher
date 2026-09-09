import {initialPoint,validatePoint} from '../shared/recovery.mjs';
import { createHash } from 'node:crypto';
import { PAIR_LIMITS as L, validateSummary, lanError } from '../shared/lan.mjs';
import { validateManifest } from '../shared/manifest.mjs';
import { CONTROL_MANIFEST_BYTES } from '../shared/network.mjs';
const hex=data=>createHash('sha256').update(data).digest('hex');
export function pullGuard(summary,point=null) {
  validateSummary(summary);const start=validatePoint(point||initialPoint(),summary);let root=Buffer.from(start.root,'hex'),total=BigInt(start.bytes);let lastId=0,manifestBytes=0,manifestOffset=0,parts=[],files=null,index=start.fileIndex,offset=BigInt(start.offset),chain=Buffer.from(start.chain,'hex'),pending=null;
  return{
    request(text){if(pending||typeof text!=='string'||text.length>1024)throw lanError('FT_PROTOCOL');let req;try{req=JSON.parse(text)}catch{throw lanError('FT_PROTOCOL')}
      if(!Number.isInteger(req.id)||req.id!==lastId+1||req.id>0xffffffff)throw lanError('FT_PROTOCOL');
      let max;
      if(req.type==='manifest-info'){if(req.id!==1||Object.keys(req).sort().join(',')!=='id,type')throw lanError('FT_PROTOCOL');max=1024;}
      else if(req.type==='read'){
        if(Object.keys(req).sort().join(',')!=='id,index,length,offset,type'||!Number.isInteger(req.length)||req.length<1||req.length>L.dataBytes||typeof req.offset!=='string'||!/^(0|[1-9]\d{0,18})$/u.test(req.offset))throw lanError('FT_PROTOCOL');
        if(req.index===-1){if(files||!manifestBytes||BigInt(req.offset)!==BigInt(manifestOffset)||req.length>manifestBytes-manifestOffset)throw lanError('FT_PROTOCOL');}
        else if(!files||req.index!==index||!files[index]||BigInt(req.offset)!==offset||BigInt(req.length)>BigInt(files[index].sizeBytes)-offset)throw lanError('FT_PROTOCOL');
        max=48+req.length;
      }else if(req.type==='finish'){if(Object.keys(req).sort().join(',')!=='id,index,type'||!files||req.index!==index||!files[index]||offset!==BigInt(files[index].sizeBytes))throw lanError('FT_PROTOCOL');max=1024;}
      else throw lanError('FT_PROTOCOL');
      lastId=req.id;pending=req;return{maxResponseBytes:max,request:req};
    },
    response(value){const req=pending;if(!req)throw lanError('FT_PROTOCOL');
      if(req.type==='read'){
        if(!(value instanceof ArrayBuffer)||value.byteLength!==48+req.length)throw lanError('FT_PROTOCOL');
        const v=new DataView(value),b=Buffer.from(value),data=b.subarray(48);
        if(v.getUint32(0)!==req.id||v.getInt32(4)!==req.index||v.getBigUint64(8)!==BigInt(req.offset)||hex(data)!==b.subarray(16,48).toString('hex'))throw lanError('FT_INTEGRITY');
        if(req.index===-1){parts.push(Buffer.from(data));manifestOffset+=data.length;if(manifestOffset===manifestBytes){const all=Buffer.concat(parts);if(hex(all)!==summary.manifestHash)throw lanError('FT_INTEGRITY');const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all)),stats=validateManifest(manifest);validatePoint(start,summary,manifest);files=manifest.entries.filter(e=>e.kind==='file');if(stats.files!==summary.files||stats.directories!==summary.directories||stats.totalBytes!==summary.totalBytes||files.reduce((n,e)=>BigInt(e.sizeBytes)>BigInt(n)?e.sizeBytes:n,'0')!==summary.maxFileBytes)throw lanError('FT_INTEGRITY');parts=[];}}
        else{offset+=BigInt(data.length);total+=BigInt(data.length);const hash=createHash('sha256').update(data).digest();chain=createHash('sha256').update(Buffer.concat([chain,hash])).digest();root=createHash('sha256').update(Buffer.concat([root,hash])).digest();}
      }else{if(typeof value!=='string'||value.length>1024)throw lanError('FT_PROTOCOL');const out=JSON.parse(value);if(out.id!==req.id||out.type!==req.type)throw lanError('FT_PROTOCOL');
        if(req.type==='manifest-info'){if(!Number.isInteger(out.bytes)||out.bytes<1||out.bytes>CONTROL_MANIFEST_BYTES)throw lanError('FT_SHARE_TOO_LARGE');manifestBytes=out.bytes;}
        else{if(out.index!==index||out.size!==offset.toString()||out.chain!==chain.toString('hex'))throw lanError('FT_INTEGRITY');root=createHash('sha256').update(Buffer.concat([root,Buffer.from(`finish:${index}:${offset}`)])).digest();index++;offset=0n;chain=Buffer.alloc(32);}}
      pending=null;
    },
    point(){return{fileIndex:index,offset:offset.toString(),bytes:total.toString(),chain:chain.toString('hex'),root:root.toString('hex'),chunkBytes:start.chunkBytes}},
    complete(){return Boolean(files)&&index===files.length&&!pending;},
  };
}
