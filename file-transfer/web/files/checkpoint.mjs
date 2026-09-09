import { initialPoint,validatePoint,ZERO_HASH } from '../../shared/recovery.mjs';
import { checkAbort } from '../../shared/manifest.mjs';
import { lanError } from '../../shared/lan.mjs';
import { readEntry } from './collection.mjs';
export const hex=bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
export const unhex=value=>Uint8Array.from(value.match(/../gu),part=>parseInt(part,16));
export const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',value));
export async function appendHash(root,hash){const value=new Uint8Array(64);value.set(root);value.set(hash,32);return digest(value);}
export async function finishRoot(root,index,size){const text=new TextEncoder().encode(`finish:${index}:${size}`),value=new Uint8Array(root.length+text.length);value.set(root);value.set(text,root.length);return digest(value);}
// Re-read only the durable prefix, using bounded chunks. No prefix bytes cross
// the network. This also detects changed source/destination data after reload.
export async function verifyPrefix(bundle,summary,point,signal,onProgress=()=>{}) {
  validatePoint(point,summary,bundle.manifest);let root=unhex(ZERO_HASH),chain=unhex(ZERO_HASH),total=0n,frames=0;const files=bundle.manifest.entries.filter(e=>e.kind==='file');
  for(let index=0;index<=point.fileIndex&&index<files.length;index++){
    const entry=files[index],target=index<point.fileIndex?BigInt(entry.sizeBytes):BigInt(point.offset);chain=unhex(ZERO_HASH);
    if(target){const iterator=readEntry(bundle,entry,signal)[Symbol.asyncIterator]();let part=new Uint8Array(),at=0,offset=0n;
      try{while(offset<target){checkAbort(signal);const length=Number(target-offset<BigInt(point.chunkBytes)?target-offset:BigInt(point.chunkBytes)),bytes=new Uint8Array(length);let filled=0;
        while(filled<length){if(at===part.length){const next=await iterator.next();if(next.done)throw lanError('FT_CHECKPOINT_INVALID');part=next.value;at=0;}const count=Math.min(length-filled,part.length-at);bytes.set(part.subarray(at,at+count),filled);filled+=count;at+=count;}
        const hash=await digest(bytes);chain=await appendHash(chain,hash);root=await appendHash(root,hash);offset+=BigInt(length);total+=BigInt(length);
        if(++frames%128===0){onProgress(total.toString());await new Promise(ok=>setTimeout(ok,0));}
      }}finally{await iterator.return?.();}
    }
    if(index<point.fileIndex)root=await finishRoot(root,index,entry.sizeBytes);
  }
  if(point.fileIndex===files.length)chain=unhex(ZERO_HASH);
  if(hex(root)!==point.root||hex(chain)!==point.chain||total.toString()!==point.bytes)throw lanError('FT_CHECKPOINT_INVALID');
  checkAbort(signal);return point;
}
export {initialPoint};
