import {createRecovery} from '../server/recovery.mjs';
import {verifyPrefix} from '../web/files/checkpoint.mjs';
import {validatePoint,initialPoint} from '../shared/recovery.mjs';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { validateSummary,lanError } from '../shared/lan.mjs';
import { CONTROL_MANIFEST_BYTES } from '../shared/network.mjs';
import { validateManifest } from '../shared/manifest.mjs';
import { usageKey } from '../server/usage.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function installShares(db){db.exec(`CREATE TABLE temporary_shares(id TEXT PRIMARY KEY,owner TEXT NOT NULL,secret_hash TEXT UNIQUE NOT NULL,summary TEXT NOT NULL,manifest TEXT,reserved_bytes TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,max_downloads INTEGER NOT NULL,downloads INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL) STRICT; CREATE INDEX share_expiry ON temporary_shares(expires_at);`);}
export function createR2Shares(db,config,getSettings){
  const bucket=config.bucket;const recovery=config.wrap(createRecovery(db,getSettings));let cleaning=null;const inFlight=new Set();
  const atomic=config.atomic;
  function byId(id){const row=db.prepare('SELECT * FROM temporary_shares WHERE id=?').get(id);if(!row)throw lanError('FT_SHARE_UNAVAILABLE');return row;}
  function publicInfo(row){return{id:row.id,summary:JSON.parse(row.summary),note:row.note,expiresAt:row.expires_at,maxDownloads:row.max_downloads,downloads:row.downloads};}
  const usable=(row,now)=>row&&row.state==='ready'&&row.expires_at>now&&row.downloads<row.max_downloads;
  function fromToken(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/u.test(token))throw lanError('FT_SHARE_UNAVAILABLE');return db.prepare('SELECT * FROM temporary_shares WHERE secret_hash=?').get(hash(token));}
  async function remove(row){db.prepare("UPDATE temporary_shares SET state='deleting' WHERE id=?").run(row.id);try{let cursor;do{const batch=await bucket.list({prefix:`shares/${row.id}/`,cursor,limit:1000});if(batch.objects.length)await bucket.delete(batch.objects.map(o=>o.key));cursor=batch.truncated?batch.cursor:undefined}while(cursor);atomic(()=>{db.prepare('DELETE FROM r2_parts WHERE share=?').run(row.id);db.prepare('DELETE FROM temporary_shares WHERE id=?').run(row.id)});return true}catch{return false}}
  const api={
    create(identity,summary,note,now=Date.now()){
      validateSummary(summary);if(typeof note!=='string'||note.length>120||/[\u0000-\u001f]/u.test(note))throw lanError('FT_PROTOCOL');
      const row=atomic(()=>{const s=getSettings().settings,reserved=BigInt(summary.totalBytes)+BigInt(summary.files)*4096n+BigInt(CONTROL_MANIFEST_BYTES),all=db.prepare('SELECT reserved_bytes FROM temporary_shares').all();
        if(all.length>=1000||all.reduce((n,x)=>n+BigInt(x.reserved_bytes),reserved)>BigInt(s.temporaryStorageBytes))throw lanError('FT_STORAGE_FULL',429);
        const id=randomUUID(),token=randomBytes(32).toString('base64url');db.prepare("INSERT INTO temporary_shares VALUES(?,?,?,?,NULL,?,'uploading',?,?,?,0,?)").run(id,usageKey(identity),hash(token),JSON.stringify(summary),reserved.toString(),now,now+s.temporaryHours*3600000,s.temporaryMaxDownloads,note);return{id,token};});
      return{...row,...publicInfo(byId(row.id))};
    },
    info(token,now=Date.now()){const row=fromToken(token);if(!usable(row,now))throw lanError('FT_SHARE_UNAVAILABLE');return publicInfo(row);},
    claim(token,now=Date.now()){return atomic(()=>{const row=fromToken(token);if(!usable(row,now))throw lanError('FT_SHARE_UNAVAILABLE');db.prepare('UPDATE temporary_shares SET downloads=downloads+1 WHERE id=?').run(row.id);return publicInfo({...row,downloads:row.downloads+1});});},
    returnClaim(id){db.prepare('UPDATE temporary_shares SET downloads=MAX(0,downloads-1) WHERE id=?').run(id);},
    check(id,now=Date.now()){const row=byId(id);if(!['ready','uploading'].includes(row.state)||row.expires_at<=now)throw lanError('FT_SHARE_UNAVAILABLE');return row;},
    async store(id,bundle,signal,{point=initialPoint(),checkpointBytes=4194304,getPoint,onCheckpoint=async()=>{}}={}){
      const summary=JSON.parse(byId(id).summary),json=JSON.stringify(bundle.manifest),stats=validateManifest(bundle.manifest);
      if(Buffer.byteLength(json)>CONTROL_MANIFEST_BYTES)throw lanError('FT_SHARE_TOO_LARGE');if(stats.totalBytes!==summary.totalBytes)throw lanError('FT_INTEGRITY');
      validatePoint(point,summary,bundle.manifest);db.prepare('UPDATE temporary_shares SET manifest=? WHERE id=?').run(json,id);
      const files=bundle.manifest.entries.filter(e=>e.kind==='file');
      for(let index=point.fileIndex;index<files.length;index++){
        const entry=files[index],start=index===point.fileIndex?Number(point.offset):0;
        // Checkpoints always align with persisted R2 part boundaries.
        const overlap=db.prepare('SELECT 1 FROM r2_parts WHERE share=? AND file=? AND start<? AND start+size>?').get(id,index,start,start);if(overlap)throw lanError('FT_CHECKPOINT_INVALID');
        const stale=db.prepare('SELECT key FROM r2_parts WHERE share=? AND file=? AND start>=?').all(id,index,start);for(let at=0;at<stale.length;at+=1000)await bucket.delete(stale.slice(at,at+1000).map(p=>p.key));
        db.prepare('DELETE FROM r2_parts WHERE share=? AND file=? AND start>=?').run(id,index,start);
        let offset=start,pending=[],size=0;
        const flush=async()=>{if(!size)return;const bytes=Buffer.concat(pending,size),key=`shares/${id}/${index}/${offset}-${randomUUID()}`;await bucket.put(key,bytes);if(signal.aborted)throw lanError('FT_CANCELLED');this.check(id);db.prepare('INSERT INTO r2_parts VALUES(?,?,?,?,?)').run(id,index,offset,size,key);offset+=size;size=0;pending=[];if(getPoint)await onCheckpoint(getPoint());};
        for await(const chunk of bundle.sources.get(entry.relativePath)(signal)){if(signal.aborted)throw lanError('FT_CANCELLED');this.check(id);if(BigInt(offset+size+chunk.length)>BigInt(entry.sizeBytes))throw lanError('FT_INTEGRITY');pending.push(Buffer.from(chunk));size+=chunk.length;if(size>=Math.min(checkpointBytes,4194304))await flush();}
        await flush();if(BigInt(offset)!==BigInt(entry.sizeBytes))throw lanError('FT_INTEGRITY');if(getPoint)await onCheckpoint(getPoint());
      }
      this.check(id);if(signal.aborted)throw lanError('FT_CANCELLED');db.prepare("UPDATE temporary_shares SET state='ready' WHERE id=? AND state='uploading'").run(id);
    },
    bundle(id,{partial=false}={}){const row=byId(id);if(row.state!=='ready'&&!(partial&&row.state==='uploading'&&row.manifest))throw lanError('FT_SHARE_UNAVAILABLE');const manifest=JSON.parse(row.manifest);validateManifest(manifest);
      const sources=new Map(manifest.entries.filter(e=>e.kind==='file').map((entry,index)=>[entry.relativePath,Object.assign(async function*(signal,start=0){
        let position=start;const parts=db.prepare('SELECT * FROM r2_parts WHERE share=? AND file=? AND start+size>? ORDER BY start').all(id,index,start);
        for(const part of parts){if(signal?.aborted)throw lanError('FT_CANCELLED');if(part.start>position)throw lanError('FT_SERVER_STORAGE');const skip=position-part.start,object=await bucket.get(part.key,{range:{offset:skip,length:part.size-skip}});if(!object)throw lanError('FT_SERVER_STORAGE');const reader=object.body.getReader();let received=0;try{while(true){if(signal?.aborted)throw lanError('FT_CANCELLED');const{value,done}=await reader.read();if(done)break;received+=value.length;for(let n=0;n<value.length;n+=65536)yield value.subarray(n,n+65536)}}finally{await reader.cancel()}if(received!==part.size-skip)throw lanError('FT_SERVER_STORAGE');position+=received;}
        if(!partial&&BigInt(position)!==BigInt(entry.sizeBytes))throw lanError('FT_SERVER_STORAGE');
      },{supportsRange:true})]));return{manifest,sources,renamed:[],warnings:[]};
    },
    async verifyPartial(id,point,signal){await verifyPrefix(this.bundle(id,{partial:true}),JSON.parse(byId(id).summary),point,signal);},
    setToken(id,token){db.prepare('UPDATE temporary_shares SET secret_hash=? WHERE id=?').run(hash(token),id);},
    revoke(id,identity,manager=false){const row=byId(id);if(!manager&&row.owner!==usageKey(identity))throw lanError('FT_FORBIDDEN',403);db.prepare("UPDATE temporary_shares SET state='revoked' WHERE id=?").run(id);},
    fail(id){db.prepare("UPDATE temporary_shares SET state='failed' WHERE id=? AND state='uploading'").run(id);},
    async cleanup(activeIds=new Set(),now=Date.now()) {
      activeIds=new Set([...activeIds,...inFlight]);if(cleaning)return cleaning;
      cleaning=(async()=>{let removed=0,failed=0;for(const r of db.prepare("SELECT id FROM temporary_shares WHERE state='uploading'").all())if(!activeIds.has(r.id)&&!recovery.activeShare(r.id,now))this.fail(r.id);
      const rows=db.prepare("SELECT * FROM temporary_shares WHERE expires_at<=? OR state IN ('failed','revoked','deleting')").all(now);
        for(const row of rows)if(!activeIds.has(row.id)&&removed+failed<20){if(await remove(row))removed++;else failed++;}return{removed,failed};})().finally(()=>{cleaning=null});return cleaning;
    },
    recover(now=Date.now()){for(const r of db.prepare("SELECT id FROM temporary_shares WHERE state='uploading'").all())if(!recovery.activeShare(r.id,now))this.fail(r.id);db.prepare("UPDATE transfer_allowances SET finished_at=?,outcome='service-restart' WHERE task LIKE 'share:%' AND finished_at IS NULL").run(now);return this.cleanup(new Set(),now);},
    list(){const rows=db.prepare('SELECT * FROM temporary_shares ORDER BY created_at DESC LIMIT 100').all();const all=db.prepare('SELECT reserved_bytes,state FROM temporary_shares').all();return{items:rows.map(row=>({...publicInfo(row),state:row.state,createdAt:row.created_at,reservedBytes:row.reserved_bytes})),count:all.length,reservedBytes:all.reduce((n,r)=>n+BigInt(r.reserved_bytes),0n).toString(),limitBytes:getSettings().settings.temporaryStorageBytes};},
  };
  const store=api.store;api.store=async function(id,...args){if(inFlight.has(id))throw lanError('FT_BUSY');inFlight.add(id);try{return await store.call(api,id,...args)}finally{inFlight.delete(id)}};return api;
}
