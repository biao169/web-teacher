import {randomBytes,createHash} from 'node:crypto';
import {usageKey} from './usage.mjs';
import {initialPoint,validatePoint,RECOVERABLE,canRecover} from '../shared/recovery.mjs';
import {lanError,validateSummary} from '../shared/lan.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function installRecovery(db){db.exec(`CREATE TABLE recovery_tasks(id TEXT PRIMARY KEY,transport TEXT NOT NULL,summary TEXT NOT NULL,note TEXT NOT NULL,point TEXT NOT NULL,extra TEXT NOT NULL,state TEXT NOT NULL,expires_at INTEGER NOT NULL,updated_at INTEGER NOT NULL) STRICT; CREATE TABLE recovery_members(task TEXT NOT NULL REFERENCES recovery_tasks(id) ON DELETE CASCADE,member TEXT NOT NULL,identity_key TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,PRIMARY KEY(task,member)) STRICT; CREATE INDEX recovery_expiry ON recovery_tasks(expires_at);`);}
export function createRecovery(db,getSettings){
  const row=id=>{const r=db.prepare('SELECT * FROM recovery_tasks WHERE id=?').get(id);if(!r)throw lanError('FT_RECOVERY_UNAVAILABLE');return{...r,summary:JSON.parse(r.summary),point:JSON.parse(r.point),extra:JSON.parse(r.extra)};};
  return{
    create(id,transport,summary,note,members,rateKbps,extra={},now=Date.now()){
      validateSummary(summary);this.prune(now);if(db.prepare('SELECT count(*) AS n FROM recovery_tasks').get().n>=1000)throw lanError('FT_BUSY');
      const expires=Math.min(now+getSettings().settings.recoveryHours*3600000,extra.expiresAt||Infinity),tokens={};
      db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO recovery_tasks VALUES(?,?,?,?,?,?,'active',?,?)").run(id,transport,JSON.stringify(summary),note,JSON.stringify(initialPoint(rateKbps)),JSON.stringify(extra),expires,now);
        for(const [member,identity] of Object.entries(members)){const token=randomBytes(32).toString('base64url');db.prepare('INSERT INTO recovery_members VALUES(?,?,?,?)').run(id,member,usageKey(identity),hash(token));tokens[member]=token;}db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e}return{...row(id),tokens};
    },
    get(id,now=Date.now()){const r=row(id);if(r.expires_at<=now||r.state==='cancelled')throw lanError('FT_RECOVERY_UNAVAILABLE');return r;},
    lookup(token,identity,member,transport,now=Date.now()){
      if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/u.test(token))throw lanError('FT_RECOVERY_UNAVAILABLE');const m=db.prepare('SELECT * FROM recovery_members WHERE token_hash=?').get(hash(token));
      if(!m||m.member!==member||m.identity_key!==usageKey(identity))throw lanError('FT_RECOVERY_UNAVAILABLE');const r=this.get(m.task,now);if(r.transport!==transport)throw lanError('FT_RECOVERY_UNAVAILABLE');return r;
    },
    checkpoint(id,point,now=Date.now()){
      db.exec('BEGIN IMMEDIATE');try{
      const r=this.get(id,now);if(r.state!=='active')throw lanError('FT_RECOVERY_UNAVAILABLE');validatePoint(point,r.summary);
      if(point.chunkBytes!==r.point.chunkBytes||BigInt(point.bytes)<BigInt(r.point.bytes)||point.fileIndex<r.point.fileIndex||point.fileIndex===r.point.fileIndex&&BigInt(point.offset)<BigInt(r.point.offset))throw lanError('FT_CHECKPOINT_INVALID');
      db.prepare('UPDATE recovery_tasks SET point=?,updated_at=? WHERE id=?').run(JSON.stringify(point),now,id);db.exec('COMMIT');return point;
      }catch(e){db.exec('ROLLBACK');throw e}
    },
    activate(id,now=Date.now()){this.get(id,now);db.prepare("UPDATE recovery_tasks SET state='active',updated_at=? WHERE id=? AND state!='complete'").run(now,id);},
    finish(id,reason,now=Date.now()){const state=reason==='FT_COMPLETE'?'complete':canRecover(reason)?'paused':'cancelled';db.prepare("UPDATE recovery_tasks SET state=?,updated_at=? WHERE id=? AND state NOT IN ('complete','cancelled')").run(state,now,id);},
    activeShare(id,now=Date.now()){return db.prepare("SELECT extra FROM recovery_tasks WHERE transport='temporary-share' AND state IN ('active','paused') AND expires_at>?").all(now).some(r=>JSON.parse(r.extra).shareId===id);},
    recover(now=Date.now()){db.prepare("UPDATE recovery_tasks SET state='paused',updated_at=? WHERE state='active'").run(now);db.prepare("UPDATE transfer_allowances SET finished_at=?,outcome='FT_SERVICE_STOPPED' WHERE finished_at IS NULL AND task IN (SELECT id FROM recovery_tasks)").run(now);this.prune(now);},
    prune(now=Date.now()){db.prepare('DELETE FROM recovery_tasks WHERE expires_at<=?').run(now);},
  };
}
