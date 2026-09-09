import {randomUUID} from 'node:crypto';
import {defaultSettings} from '../shared/settings.mjs';
import {installUsage} from '../server/usage.mjs';
import {installVpn} from '../server/vpn-budget.mjs';
import {installRecovery} from '../server/recovery.mjs';
import {installShares,createR2Shares} from './r2-shares.mjs';
import {createStorageCore} from '../server/storage-core.mjs';
import {installAccounts} from '../server/accounts.mjs';
export function openCloudStorage(ctx,bucket){
 let depth=0;
 const atomic=fn=>{if(depth)return fn();return ctx.storage.transactionSync(()=>{depth++;try{return fn()}finally{depth--}})};
 const db={exec(sql){if(/^(BEGIN IMMEDIATE|BEGIN|COMMIT|ROLLBACK)$/i.test(sql.trim())){if(!depth)throw new Error('FT_TRANSACTION_REQUIRED');return}ctx.storage.sql.exec(sql)},prepare(sql){return{all:(...args)=>[...ctx.storage.sql.exec(sql,...args)],get:(...args)=>[...ctx.storage.sql.exec(sql,...args)][0],run(...args){const cursor=ctx.storage.sql.exec(sql,...args);[...cursor];return{changes:[...ctx.storage.sql.exec('SELECT changes() n')][0].n}}}},close(){}};
 const wrap=obj=>new Proxy(obj,{get(target,key){const v=target[key];if(typeof v!=='function')return v;if(v.constructor.name==='AsyncFunction'||key==='recover'&&target.store)return v.bind(target);return(...args)=>atomic(()=>v.apply(target,args))}});
 atomic(()=>{db.exec('CREATE TABLE IF NOT EXISTS service_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT');if(!db.prepare("SELECT value FROM service_meta WHERE key='owner'").get()){
 db.prepare('INSERT INTO service_meta VALUES(?,?)').run('owner','academic-file-transfer');db.prepare('INSERT INTO service_meta VALUES(?,?)').run('instance_id',randomUUID());
 db.exec(`CREATE TABLE admin_grants(user_uid TEXT PRIMARY KEY,granted_at TEXT NOT NULL,granted_by TEXT NOT NULL) STRICT; CREATE TABLE bridge_nonces(jti TEXT PRIMARY KEY,expires_at INTEGER NOT NULL) STRICT; CREATE INDEX bridge_nonce_expiry ON bridge_nonces(expires_at); CREATE TABLE tool_settings(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,document TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL) STRICT; CREATE TABLE settings_audit(revision INTEGER PRIMARY KEY,changed_at TEXT NOT NULL,changed_by TEXT NOT NULL,action TEXT NOT NULL) STRICT;`);
 db.prepare('INSERT INTO tool_settings VALUES(1,0,?,?,?)').run(JSON.stringify(defaultSettings()),new Date().toISOString(),'initial-defaults');installUsage(db);installVpn(db);installShares(db);installRecovery(db);
 db.exec('CREATE TABLE r2_parts(share TEXT NOT NULL,file INTEGER NOT NULL,start INTEGER NOT NULL,size INTEGER NOT NULL,key TEXT NOT NULL,PRIMARY KEY(share,file,start)) STRICT');
 }installAccounts(db);db.exec('CREATE TABLE IF NOT EXISTS cloud_usage(period TEXT PRIMARY KEY,bytes TEXT NOT NULL) STRICT');});
 const core=createStorageCore(db,{bucket,atomic,wrap},createR2Shares);for(const name of ['recovery','shares','usage','vpn'])core[name]=wrap(core[name]);
 core.cloudBudget={view(){const s=core.readSettings().settings,now=new Date().toISOString();const rows=[[now.slice(0,10),s.cloudDailyBytes],[now.slice(0,7),s.cloudMonthlyBytes]].map(([p,limit])=>{const used=db.prepare('SELECT bytes FROM cloud_usage WHERE period=?').get(p)?.bytes||'0';return{period:p,usedBytes:used,limitBytes:limit,remainingBytes:(BigInt(limit)>BigInt(used)?BigInt(limit)-BigInt(used):0n).toString()}});return{enabled:s.cloudBudgetEnabled,blocked:s.cloudBudgetEnabled&&rows.some(r=>BigInt(r.remainingBytes)<262144n),daily:rows[0],monthly:rows[1]}},consume(rx,tx){atomic(()=>{const s=core.readSettings().settings;if(!s.cloudBudgetEnabled)return;const now=new Date().toISOString(),periods=[[now.slice(0,10),s.cloudDailyBytes],[now.slice(0,7),s.cloudMonthlyBytes]],amount=BigInt(rx)+BigInt(tx);for(const[p,limit]of periods){const used=BigInt(db.prepare('SELECT bytes FROM cloud_usage WHERE period=?').get(p)?.bytes||0);if(used+amount>BigInt(limit)){const e=new Error('FT_CLOUD_BUDGET');e.code='FT_CLOUD_BUDGET';e.status=429;throw e}db.prepare('INSERT INTO cloud_usage VALUES(?,?) ON CONFLICT(period) DO UPDATE SET bytes=excluded.bytes').run(p,(used+amount).toString())}db.prepare('DELETE FROM cloud_usage WHERE period<?').run(new Date(Date.now()-100*86400000).toISOString().slice(0,7))})}};
 return{storage:wrap(core),db,atomic};
}
