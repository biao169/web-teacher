import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
/** Shared bounded binary response reader for cached and online receiving. */
export async function readBlock(response){
 if(!response.ok){let value;try{value=await response.json()}catch{}throw Error(value?.error||tr("接收失败，请核对后继续"))}
 const length=Number(response.headers.get('X-Chunk-Size'));
 if(!Number.isInteger(length)||length<1||length>1048576){await response.body?.cancel();throw Error(tr("接收分块大小异常"))}
 const reader=response.body.getReader(),data=new Uint8Array(length);let used=0;
 try{while(true){const part=await reader.read();if(part.done)break;if(used+part.value.length>length)throw Error(tr("接收正文超过分块上限"));data.set(part.value,used);used+=part.value.length}}finally{await reader.cancel()}
 if(used!==length)throw Error(tr("接收分块未完整返回"));
 return {offset:Number(response.headers.get('X-Chunk-Offset')),sha256:response.headers.get('X-Chunk-SHA256'),data,wait:Number(response.headers.get('X-Chunk-Wait-Ms')||0)};
}
