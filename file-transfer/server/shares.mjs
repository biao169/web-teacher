import {createRecovery} from './recovery.mjs';
import {verifyPrefix} from '../web/files/checkpoint.mjs';
import {validatePoint,initialPoint} from '../shared/recovery.mjs';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { mkdirSync,lstatSync,constants } from 'node:fs';
import { open,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { validateSummary,lanError } from '../shared/lan.mjs';
import { CONTROL_MANIFEST_BYTES } from '../shared/network.mjs';
import { validateManifest } from '../shared/manifest.mjs';
import { usageKey } from './usage.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function installShares(db){db.exec(`CREATE TABLE temporary_shares(id TEXT PRIMARY KEY,owner TEXT NOT NULL,secret_hash TEXT UNIQUE NOT NULL,summary TEXT NOT NULL,manifest TEXT,reserved_bytes TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,max_downloads INTEGER NOT NULL,downloads INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL) STRICT; CREATE INDEX share_expiry ON temporary_shares(expires_at);`);}
export function createShares(db,config,getSettings){
  const root=join(config.dataPath,'temporary');const recovery=createRecovery(db,getSettings);let cleaning=null;
  const atomic=fn=>{db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}};
  function folder(id,create=false){if(!/^[0-9a-f-]{36}$/u.test(id))throw lanError('FT_SHARE_UNAVAILABLE');const base=lstatSync(root);if(!base.isDirectory()||base.isSymbolicLink())throw lanError('FT_SERVER_STORAGE');const path=join(root,id);if(create)mkdirSync(path,{mode:0o700});const stat=lstatSync(path);if(!stat.isDirectory()||stat.isSymbolicLink())throw lanError('FT_SERVER_STORAGE');return path;}
  function byId(id){const row=db.prepare('SELECT * FROM temporary_shares WHERE id=?').get(id);if(!row)throw lanError('FT_SHARE_UNAVAILABLE');return row;}
  function publicInfo(row){return{id:row.id,summary:JSON.parse(row.summary),note:row.note,expiresAt:row.expires_at,maxDownloads:row.max_downloads,downloads:row.downloads};}
  const usable=(row,now)=>row&&row.state==='ready'&&row.expires_at>now&&row.downloads<row.max_downloads;
  function fromToken(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/u.test(token))throw lanError('FT_SHARE_UNAVAILABLE');return db.prepare('SELECT * FROM temporary_shares WHERE secret_hash=?').get(hash(token));}
  async function remove(row){db.prepare("UPDATE temporary_shares SET state='deleting' WHERE id=?").run(row.id);
    try{const path=join(root,row.id);try{folder(row.id);await rm(path,{recursive:true,force:true})}catch(e){if(e.code!=='ENOENT')throw e}db.prepare('DELETE FROM temporary_shares WHERE id=?').run(row.id);return true}catch{return false}}
  return{
    create(identity,summary,note,now=Date.now()){
      validateSummary(summary);if(typeof note!=='string'||note.length>120||/[\u0000-\u001f]/u.test(note))throw lanError('FT_PROTOCOL');
      const row=atomic(()=>{const s=getSettings().settings,reserved=BigInt(summary.totalBytes)+BigInt(summary.files)*4096n+BigInt(CONTROL_MANIFEST_BYTES),all=db.prepare('SELECT reserved_bytes FROM temporary_shares').all();
        if(all.length>=1000||all.reduce((n,x)=>n+BigInt(x.reserved_bytes),reserved)>BigInt(s.temporaryStorageBytes))throw lanError('FT_STORAGE_FULL',429);
        const id=randomUUID(),token=randomBytes(32).toString('base64url');db.prepare("INSERT INTO temporary_shares VALUES(?,?,?,?,NULL,?,'uploading',?,?,?,0,?)").run(id,usageKey(identity),hash(token),JSON.stringify(summary),reserved.toString(),now,now+s.temporaryHours*3600000,s.temporaryMaxDownloads,note);return{id,token};});
      try{folder(row.id,true)}catch(e){db.prepare("UPDATE temporary_shares SET state='failed' WHERE id=?").run(row.id);throw lanError('FT_SERVER_STORAGE')}
      return{...row,...publicInfo(byId(row.id))};
    },
    info(token,now=Date.now()){const row=fromToken(token);if(!usable(row,now))throw lanError('FT_SHARE_UNAVAILABLE');return publicInfo(row);},
    claim(token,now=Date.now()){return atomic(()=>{const row=fromToken(token);if(!usable(row,now))throw lanError('FT_SHARE_UNAVAILABLE');db.prepare('UPDATE temporary_shares SET downloads=downloads+1 WHERE id=?').run(row.id);return publicInfo({...row,downloads:row.downloads+1});});},
    returnClaim(id){db.prepare('UPDATE temporary_shares SET downloads=MAX(0,downloads-1) WHERE id=?').run(id);},
    check(id,now=Date.now()){const row=byId(id);if(!['ready','uploading'].includes(row.state)||row.expires_at<=now)throw lanError('FT_SHARE_UNAVAILABLE');return row;},
    async store(id,bundle,signal,{point=initialPoint(),checkpointBytes=4194304,getPoint,onCheckpoint=async()=>{}}={}){const row=byId(id),summary=JSON.parse(row.summary),json=JSON.stringify(bundle.manifest),stats=validateManifest(bundle.manifest);
      if(Buffer.byteLength(json)>CONTROL_MANIFEST_BYTES)throw lanError('FT_SHARE_TOO_LARGE');if(stats.totalBytes!==summary.totalBytes)throw lanError('FT_INTEGRITY');
      validatePoint(point,summary,bundle.manifest);db.prepare('UPDATE temporary_shares SET manifest=? WHERE id=?').run(json,id);
      let index=0,since=0;for(const entry of bundle.manifest.entries.filter(e=>e.kind==='file')){if(signal.aborted)throw lanError('FT_CANCELLED');const current=index++;if(current<point.fileIndex)continue;const path=join(folder(id),String(current)),start=current===point.fileIndex?Number(point.offset):0;let file;try{file=await open(path,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL,0o600)}catch(e){if(e.code!=='EEXIST')throw e;const before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1)throw lanError('FT_SERVER_STORAGE');file=await open(path,constants.O_RDWR|(constants.O_NOFOLLOW||0));const stat=await file.stat();if(stat.ino!==before.ino||stat.dev!==before.dev){await file.close();throw lanError('FT_SERVER_STORAGE');}}let total=BigInt(start);
        try{await file.truncate(start);for await(const chunk of bundle.sources.get(entry.relativePath)(signal)){if(signal.aborted)throw lanError('FT_CANCELLED');this.check(id);total+=BigInt(chunk.byteLength);if(total>BigInt(entry.sizeBytes))throw lanError('FT_INTEGRITY');let offset=0;while(offset<chunk.length){const result=await file.write(chunk,offset,chunk.length-offset,Number(total)-chunk.length+offset);if(!result.bytesWritten)throw lanError('FT_SERVER_STORAGE');offset+=result.bytesWritten;}since+=chunk.length;if(getPoint&&since>=checkpointBytes){await file.sync();await onCheckpoint(getPoint());since=0;}}if(total!==BigInt(entry.sizeBytes))throw lanError('FT_INTEGRITY');await file.sync();if(getPoint)await onCheckpoint(getPoint());since=0;}finally{await file.close();}}
      this.check(id);if(signal.aborted)throw lanError('FT_CANCELLED');db.prepare("UPDATE temporary_shares SET manifest=?,state='ready' WHERE id=? AND state='uploading'").run(json,id);
    },
    bundle(id,{partial=false}={}){const row=byId(id);if(row.state!=='ready'&&!(partial&&row.state==='uploading'&&row.manifest))throw lanError('FT_SHARE_UNAVAILABLE');const manifest=JSON.parse(row.manifest);validateManifest(manifest);const files=manifest.entries.filter(e=>e.kind==='file');
      const sources=new Map(files.map((entry,index)=>[entry.relativePath,Object.assign(async function*(signal,start=0){if(signal?.aborted)throw lanError('FT_CANCELLED');const path=join(folder(id),String(index)),before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||!partial&&BigInt(before.size)!==BigInt(entry.sizeBytes))throw lanError('FT_SERVER_STORAGE');const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
        try{const stat=await file.stat();if(stat.ino!==before.ino||stat.dev!==before.dev)throw lanError('FT_SERVER_STORAGE');const buffer=Buffer.alloc(65536);let position=start;while(true){if(signal?.aborted)throw lanError('FT_CANCELLED');const {bytesRead}=await file.read(buffer,0,buffer.length,position);if(!bytesRead)break;position+=bytesRead;yield new Uint8Array(buffer.subarray(0,bytesRead));}}finally{await file.close();}},{supportsRange:true})]));
      return{manifest,sources,renamed:[],warnings:[]};
    },
    async verifyPartial(id,point,signal){const bundle=this.bundle(id,{partial:true}),files=bundle.manifest.entries.filter(e=>e.kind==='file');for(let i=0;i<point.fileIndex;i++){const stat=lstatSync(join(folder(id),String(i)));if(BigInt(stat.size)!==BigInt(files[i].sizeBytes))throw lanError('FT_CHECKPOINT_INVALID');}await verifyPrefix(bundle,JSON.parse(byId(id).summary),point,signal);},
    setToken(id,token){db.prepare('UPDATE temporary_shares SET secret_hash=? WHERE id=?').run(hash(token),id);},
    revoke(id,identity,manager=false){const row=byId(id);if(!manager&&row.owner!==usageKey(identity))throw lanError('FT_FORBIDDEN',403);db.prepare("UPDATE temporary_shares SET state='revoked' WHERE id=?").run(id);},
    fail(id){db.prepare("UPDATE temporary_shares SET state='failed' WHERE id=? AND state='uploading'").run(id);},
    async cleanup(activeIds=new Set(),now=Date.now()) {
      if(cleaning)return cleaning;
      cleaning=(async()=>{let removed=0,failed=0;for(const r of db.prepare("SELECT id FROM temporary_shares WHERE state='uploading'").all())if(!activeIds.has(r.id)&&!recovery.activeShare(r.id,now))this.fail(r.id);
      const rows=db.prepare("SELECT * FROM temporary_shares WHERE expires_at<=? OR state IN ('failed','revoked','deleting')").all(now);
        for(const row of rows)if(!activeIds.has(row.id)&&removed+failed<20){if(await remove(row))removed++;else failed++;}return{removed,failed};})().finally(()=>{cleaning=null});return cleaning;
    },
    recover(now=Date.now()){for(const r of db.prepare("SELECT id FROM temporary_shares WHERE state='uploading'").all())if(!recovery.activeShare(r.id,now))this.fail(r.id);db.prepare("UPDATE transfer_allowances SET finished_at=?,outcome='service-restart' WHERE task LIKE 'share:%' AND finished_at IS NULL").run(now);return this.cleanup(new Set(),now);},
    list(){const rows=db.prepare('SELECT * FROM temporary_shares ORDER BY created_at DESC LIMIT 100').all();const all=db.prepare('SELECT reserved_bytes,state FROM temporary_shares').all();return{items:rows.map(row=>({...publicInfo(row),state:row.state,createdAt:row.created_at,reservedBytes:row.reserved_bytes})),count:all.length,reservedBytes:all.reduce((n,r)=>n+BigInt(r.reserved_bytes),0n).toString(),limitBytes:getSettings().settings.temporaryStorageBytes};},
  };
}
