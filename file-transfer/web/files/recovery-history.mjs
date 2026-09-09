import {validatePoint} from '../../shared/recovery.mjs';
const key='file-transfer:recovery:v1';
function valid(row,now){try{return row&&typeof row.owner==='string'&&row.owner.length<250&&['send','receive'].includes(row.role)&&['lan-direct','wan-direct','server-relay','temporary-share'].includes(row.transport)&&/^[A-Za-z0-9_-]{43}$/u.test(row.token)&&typeof row.task==='string'&&row.task.length<100&&Number.isFinite(row.expiresAt)&&row.expiresAt>now&&row.expiresAt<now+73*3600000&&!!validatePoint(row.point,row.summary)}catch{return false}}
export function recoveryHistory(scope=globalThis){
 const read=()=>{try{const raw=scope.localStorage?.getItem(key);if(!raw||raw.length>65536)return[];const rows=JSON.parse(raw);return Array.isArray(rows)?rows.filter(r=>valid(r,Date.now())).slice(0,10):[]}catch{return[]}};
 const write=rows=>{try{scope.localStorage?.setItem(key,JSON.stringify(rows));return Boolean(scope.localStorage)}catch{return false}};
 return{list:owner=>read().filter(r=>r.owner===owner),put(owner,role,info,kind='',destinationName=''){const row={owner,role,task:info.task,token:info.token,transport:info.transport,summary:info.summary,point:info.point,expiresAt:info.expiresAt,checkpointMiB:info.checkpointMiB,automaticRetries:info.automaticRetries,kind,destinationName:String(destinationName).slice(0,255)};if(!valid(row,Date.now()))return false;return write([row,...read().filter(r=>!(r.owner===owner&&r.task===info.task&&r.role===role))].slice(0,10));},remove(owner,task,role){return write(read().filter(r=>!(r.owner===owner&&r.task===task&&r.role===role)));}};
}
