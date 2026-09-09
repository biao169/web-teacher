import { PAIR_LIMITS as L, lanError, validateSummary } from './lan.mjs';
import { byteCount } from './contracts.mjs';
export const ZERO_HASH = '0'.repeat(64);
export const RETRYABLE = new Set(['FT_CONNECTION_CLOSED','FT_CONNECTION_FAILED','FT_SIGNAL_UNAVAILABLE','FT_CONNECTION_TIMEOUT','FT_TIMEOUT','FT_PEER_LEFT','FT_ROUTE_CHANGED','FT_SERVICE_STOPPED']);
export const RECOVERABLE = new Set([...RETRYABLE,'FT_PAUSED','FT_AUTH_EXPIRED','FT_SERVER_STORAGE','FT_WRITE_FAILED','FT_READ_FAILED','FT_FILE_CHANGED','FT_COMPLETION_UNCONFIRMED']);
export const canRecover=code=>RECOVERABLE.has(code)||/^FT_(VPN|METER)_/u.test(code||'');
export function initialPoint(rateKbps=null) { return {fileIndex:0,offset:'0',bytes:'0',chain:ZERO_HASH,root:ZERO_HASH,chunkBytes:rateKbps===null?L.dataBytes:Math.max(1,Math.min(L.dataBytes,Math.floor(rateKbps*125)))}; }
export function validatePoint(point,summary,manifest=null) {
  validateSummary(summary);
  if(!point||Object.keys(point).sort().join(',')!=='bytes,chain,chunkBytes,fileIndex,offset,root'||!Number.isInteger(point.fileIndex)||point.fileIndex<0||point.fileIndex>summary.files||!Number.isInteger(point.chunkBytes)||point.chunkBytes<1||point.chunkBytes>L.dataBytes||![point.chain,point.root].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v)))throw lanError('FT_CHECKPOINT_INVALID');
  try{byteCount(point.offset);byteCount(point.bytes)}catch{throw lanError('FT_CHECKPOINT_INVALID')}
  if(BigInt(point.bytes)>BigInt(summary.totalBytes)||BigInt(point.offset)>BigInt(summary.maxFileBytes)||BigInt(point.offset)>BigInt(point.bytes)||point.fileIndex===summary.files&&point.offset!=='0')throw lanError('FT_CHECKPOINT_INVALID');
  if(point.offset==='0'&&point.chain!==ZERO_HASH)throw lanError('FT_CHECKPOINT_INVALID');
  if(manifest){const files=manifest.entries.filter(e=>e.kind==='file'),entry=files[point.fileIndex],offset=BigInt(point.offset);if(offset>BigInt(entry?.sizeBytes||'0')||offset%BigInt(point.chunkBytes)!==0n&&offset!==BigInt(entry?.sizeBytes||'0')||files.slice(0,point.fileIndex).reduce((sum,e)=>sum+BigInt(e.sizeBytes),offset)!==BigInt(point.bytes))throw lanError('FT_CHECKPOINT_INVALID');}
  return {...point};
}
export function samePoint(a,b){return a&&b&&['fileIndex','offset','bytes','chain','root','chunkBytes'].every(key=>a[key]===b[key]);}
export const recoveryReason=(code,zh)=>({FT_PAUSED:['任务已暂停，可以在有效期内恢复。','Paused. Resume within the recovery window.'],FT_RECOVERY_UNAVAILABLE:['恢复记录已到期、取消或不属于当前身份，请重新创建任务。','Recovery expired, was cancelled, or belongs to another identity. Start a new task.'],FT_CHECKPOINT_INVALID:['检查点与文件不一致，未继续写入。请选择原文件和原保存位置。','Checkpoint does not match. Select the original files and destination.'],FT_RECOVERY_SOURCE:['请先重新选择原来的发送文件或文件夹，恢复前会校验内容。','Reselect the original source files or folder. Contents are checked before resuming.'],FT_RECOVERY_DESTINATION:['请重新选择原保存文件或已创建的传输子文件夹。','Reselect the original output file or the created transfer subfolder.'],FT_RECOVERY_BUSY:['该任务已在另一连接中恢复，请先暂停那一连接。','This task is already attached elsewhere. Pause that connection first.'],FT_WRITE_FAILED:['写入未完成，请检查磁盘空间和权限后恢复。','Writing failed. Check free disk space and permissions, then resume.']}[code]||['无法恢复，请检查原文件、权限和网络。','Recovery failed. Check original files, access and network.'])[zh?0:1];
