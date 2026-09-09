import {RECOVERABLE,canRecover,samePoint} from '../shared/recovery.mjs';
import { randomUUID,createHash } from 'node:crypto';
import { WireChannel,decodeWire,wireBytes } from '../shared/wire.mjs';
import { lanError } from '../shared/lan.mjs';
import { CONTROL_MANIFEST_BYTES } from '../shared/network.mjs';
import { prepareTransfer,serveTransfer,receiveTransfer } from '../web/files/direct.mjs';
import { createTrafficGate } from './traffic-gate.mjs';
import { pullGuard } from './pull-guard.mjs';
export function createShareSessions(storage,{send,check,now=Date.now}) {
  const sessions=new Map(),jobs=new Set();let cleanupRunning=false,stopped=false,lastCleanup=0,cleanupJob=null;
  function close(p,reason='FT_CANCELLED'){
    const s=sessions.get(p);if(!s)return; sessions.delete(p);s.controller.abort();s.channel?.close();s.dispose?.();s.lease?.finish();s.lease=null;
    storage.usage.finish(s.task,reason,now());storage.recovery?.finish(s.task,reason,now());if(s.upload&&!s.done&&!canRecover(reason))storage.shares.fail(s.id);
    send(p,{type:reason==='FT_COMPLETE'?'share-complete':'ended',reason});
  }
  function start(p,info,upload,reservedTask=null,record=null,resumeToken=null){
    if(sessions.has(p))throw lanError('FT_BUSY');const rule=check(p,info.summary),task=reservedTask||'share:'+randomUUID(),controller=new AbortController();
    if(!reservedTask)storage.usage.reserve(task,upload?'send':'receive',p.auth.identity,info.summary.totalBytes,storage.readSettings().settings,p.auth.lease,now());
    try{storage.usage.authorizeSingle(task,upload?'send':'receive',p.auth.identity,storage.readSettings().settings,now())}catch(e){storage.usage.finish(task,e.code,now());throw e}
    if(storage.recovery&&!record){record=storage.recovery.create(task,'temporary-share',info.summary,info.note,{[p.auth.role]:p.auth.identity},rule.wanRateKbps,{shareId:info.id,upload,revision:p.auth.revision,expiresAt:info.expiresAt,rateKbps:rule.wanRateKbps},now());resumeToken=record.tokens[p.auth.role];}
    if(record)storage.recovery.activate(task,now());
    if(upload&&resumeToken){info={...info,token:createHash('sha256').update('share:'+resumeToken).digest('base64url')};storage.shares.setToken(info.id,info.token);}
    const s={id:info.id,task,controller,upload,done:false,lease:null,record,guard:pullGuard(info.summary,record?.point),busy:false,started:false};sessions.set(p,s);
    const verify=()=>{check(p,info.summary);if(record)storage.recovery.get(task,now());storage.shares.check(info.id,now());if(controller.signal.aborted)throw lanError('FT_CANCELLED');};
    const gate=createTrafficGate(storage,verify,{rateKbps:rule.wanRateKbps,signal:controller.signal,now});s.verify=verify;
    function fail(e){close(p,e.code||'FT_SERVER_STORAGE')}
    s.channel=new WireChannel(wire=>{
      const value=decodeWire(wire);
      if(!upload&&value==='{"type":"ready"}'){if(!s.started)send(p,{type:'share-data',wire});return;}
      if(s.busy){fail(lanError('FT_PROTOCOL'));return;}s.busy=true;
      const job=(async()=>{
        if(upload){const request=s.guard.request(value),response=request.request.type==='read'?Math.ceil(request.maxResponseBytes/3)*4+512:6656;await gate.pace(response);s.lease=gate.reserve(response,wireBytes(wire)+512);s.started=true;send(p,{type:'share-data',wire});}
        else{await gate.pace(wireBytes(wire));s.guard.response(value);const lease=gate.reserve(1024,wireBytes(wire)+512);try{lease.assert();send(p,{type:'share-data',wire})}finally{lease.finish()}}
      })().catch(fail).finally(()=>{s.busy=false;jobs.delete(job)});jobs.add(job);
    });
    send(p,{type:'share-authorized',summary:info.summary,rateKbps:rule.wanRateKbps,upload,info,...(record?{recovery:{task,token:resumeToken,transport:'temporary-share',point:record.point,summary:info.summary,expiresAt:record.expires_at,checkpointMiB:storage.readSettings().settings.checkpointMiB,automaticRetries:storage.readSettings().settings.automaticRetries}}:{})});
    const job=(async()=>{
      if(upload){if(record&&(record.point.bytes!=='0'||record.point.fileIndex))await storage.shares.verifyPartial(info.id,record.point,controller.signal);const remote=await receiveTransfer(s.channel,info.summary,{signal:controller.signal,verifyRoute:verify,rateKbps:rule.wanRateKbps,resumePoint:record?.point});s.dispose=remote.dispose;
        if(new TextEncoder().encode(JSON.stringify(remote.bundle.manifest)).length>CONTROL_MANIFEST_BYTES)throw lanError('FT_SHARE_TOO_LARGE');
        await storage.shares.store(info.id,remote.bundle,controller.signal,{point:record?.point,checkpointBytes:storage.readSettings().settings.checkpointMiB*1048576,getPoint:record?remote.point:null,onCheckpoint:async point=>{verify();storage.recovery.checkpoint(task,point,now());send(p,{type:'checkpoint',point});}});if(!remote.complete()||!s.guard.complete())throw lanError('FT_INTEGRITY');verify();s.done=true;
        send(p,{type:'share-ready',info});close(p,'FT_COMPLETE');
      }else{const prepared=await prepareTransfer(storage.shares.bundle(info.id));verify();s.dispose=serveTransfer(s.channel,prepared,{signal:controller.signal,verifyRoute:verify,rateKbps:rule.wanRateKbps,resumePoint:record?.point,onError:fail});}
    })().catch(fail).finally(()=>jobs.delete(job));jobs.add(job);
  }
  const timer=setInterval(()=>{for(const [p,s] of sessions){try{s.verify();s.lease?.assert();if(s.lease&&now()>=s.lease.expiresAt)throw lanError('FT_VPN_LEASE')}catch(e){close(p,e.code)}}
    if(!cleanupRunning&&now()-lastCleanup>=storage.readSettings().settings.temporaryCleanupMinutes*60000){cleanupRunning=true;lastCleanup=now();cleanupJob=storage.shares.cleanup(new Set([...sessions.values()].map(s=>s.id)),now()).catch(()=>({removed:0,failed:1})).finally(()=>{cleanupRunning=false})}
  },100);timer.unref?.();
  return{
    has:p=>sessions.has(p),
    resume(p,record,token){if([...sessions.values()].some(s=>s.task===record.id))throw lanError('FT_RECOVERY_BUSY');const row=storage.shares.check(record.extra.shareId,now());if(record.extra.upload&&row.state!=='uploading')throw lanError('FT_RECOVERY_UNAVAILABLE');const info={id:row.id,summary:record.summary,note:record.note,expiresAt:row.expires_at,maxDownloads:row.max_downloads,downloads:row.downloads};storage.usage.reopen(record.id,p.auth.role,p.auth.identity,storage.readSettings().settings,p.auth.lease,now());try{start(p,info,record.extra.upload,record.id,record,token)}catch(e){storage.usage.finish(record.id,e.code,now());throw e}},
    completed(p,record,token){const row=storage.shares.check(record.extra.shareId,now());send(p,{type:'share-ready',info:{id:row.id,token:createHash('sha256').update('share:'+token).digest('base64url'),summary:record.summary,note:record.note,expiresAt:row.expires_at,maxDownloads:row.max_downloads,downloads:row.downloads}});},
    renew(p){const s=sessions.get(p);if(s)storage.usage.touch(s.task,p.auth.lease,now());},
    async message(p,data){
      if(stopped)throw lanError('FT_SERVICE_STOPPED');
      if(data.type==='share-create'){
        if(p.auth.role!=='send'||sessions.has(p))throw lanError('FT_ACCESS_DENIED');check(p,data.summary);
        const info=storage.shares.create(p.auth.identity,data.summary,data.note,now());
        try{start(p,info,true)}catch(e){storage.shares.fail(info.id);throw e}return;
      }
      if(data.type==='share-info'){if(p.auth.role!=='receive'||sessions.has(p))throw lanError('FT_ACCESS_DENIED');const info=storage.shares.info(data.token,now());check(p,info.summary);send(p,{type:'share-info',info});return;}
      if(data.type==='share-claim'){if(p.auth.role!=='receive'||sessions.has(p))throw lanError('FT_ACCESS_DENIED');const preview=storage.shares.info(data.token,now());check(p,preview.summary);
        // Check personal capacity before consuming a retrieval. A concurrent quota
        // race may still conservatively consume a count, never create free use.
        const task='share:'+randomUUID();storage.usage.reserve(task,'receive',p.auth.identity,preview.summary.totalBytes,storage.readSettings().settings,p.auth.lease,now());let info;
        try{info=storage.shares.claim(data.token,now());start(p,info,false,task)}catch(e){storage.usage.finish(task,e.code,now());if(info)storage.shares.returnClaim(info.id);throw e}return;
      }
      const s=sessions.get(p);if(!s)throw lanError('FT_SHARE_UNAVAILABLE');
      if(data.type==='cancel'||data.type==='pause'){close(p,data.type==='pause'?'FT_PAUSED':'FT_CANCELLED');return;}
      if(data.type==='checkpoint'&&!s.upload&&s.record){if(!samePoint(data.point,s.guard.point()))throw lanError('FT_CHECKPOINT_INVALID');storage.recovery.checkpoint(s.task,data.point,now());send(p,{type:'checkpoint',point:data.point});return;}
      if(data.type==='complete'&&!s.upload&&s.guard.complete()){close(p,'FT_COMPLETE');return;}
      if(data.type!=='share-data')throw lanError('FT_PROTOCOL');s.verify();const value=decodeWire(data.wire);
      if(s.upload){if(value==='{"type":"ready"}'){if(!s.started)s.channel.receive(data.wire);return;}if(!s.lease)throw lanError('FT_PROTOCOL');s.lease.assert();s.guard.response(value);s.lease.finish();s.lease=null;s.channel.receive(data.wire);}
      else{if(s.busy)throw lanError('FT_PROTOCOL');s.guard.request(value);s.started=true;s.channel.receive(data.wire);}
    },
    closePeer:close,
    cleanup(){return storage.shares.cleanup(new Set([...sessions.values()].map(s=>s.id)),now());},
    async close(){stopped=true;clearInterval(timer);for(const p of sessions.keys())close(p,'FT_SERVICE_STOPPED');await Promise.allSettled([...jobs,cleanupJob]);},
  };
}
