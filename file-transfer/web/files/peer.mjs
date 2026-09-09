import {samePoint,RECOVERABLE,canRecover,RETRYABLE,recoveryReason} from '../../shared/recovery.mjs';
import {verifyPrefix} from './checkpoint.mjs';
import {saveResumable} from './resumable-save.mjs';
import {recoveryHistory} from './recovery-history.mjs';
import { publicNetworks, safeWanDescription, validateWanRoute, wanCandidates, CONTROL_MANIFEST_BYTES } from '../../shared/network.mjs';
import { WireChannel } from '../../shared/wire.mjs';
import { PAIR_LIMITS as L, lanError, lanNetworks, safeDescription, validateRoute } from '../../shared/lan.mjs';
import { prepareTransfer, serveTransfer, receiveTransfer } from './direct.mjs';
import { saveZip, saveDirectory, saveSingle } from './save.mjs';

export function readPairCode(value) {
  if (typeof value !== 'string') return '';
  let text = value.trim();
  if (/^https?:\/\//u.test(text)) { try { text = new URLSearchParams(new URL(text).hash.slice(1)).get('receive') || ''; } catch { return ''; } }
  text = text.replace(/[\s-]/gu, '').toUpperCase(); return /^[2-9A-HJ-NP-Z]{10}$/u.test(text) ? text : '';
}
export function shareLink(location, code, transport='lan-direct') { const url = new URL(location.href); url.search = '?mode=receive'; url.hash = new URLSearchParams({ receive: code, ...(transport==='lan-direct'?{}:{via:transport}) }).toString(); return url.href; }
export function readShareToken(value) {
  if(typeof value!=='string')return '';let text=value.trim();
  if(/^https?:\/\//u.test(text)){try{text=new URLSearchParams(new URL(text).hash.slice(1)).get('share')||''}catch{return ''}}
  return /^[A-Za-z0-9_-]{43}$/u.test(text)?text:'';
}
export function transferHint(value) {
  if(readShareToken(value))return 'temporary-share';
  try{const via=new URLSearchParams(new URL(value).hash.slice(1)).get('via');return ['wan-direct','server-relay'].includes(via)?via:null}catch{return null}
}
export async function selectedRoute(pc, networks, wan=false) {
  const stats = await pc.getStats(); let pair;
  for (const report of stats.values()) if (report.type === 'transport' && report.selectedCandidatePairId) pair = stats.get(report.selectedCandidatePairId);
  if (!pair || pair.state !== 'succeeded') throw lanError('FT_ROUTE_UNKNOWN');
  const take = id => { const c = stats.get(id); if (!c) throw lanError('FT_ROUTE_UNKNOWN'); return { address: c.address, port: c.port, type: c.candidateType, protocol: c.protocol }; };
  let local=take(pair.localCandidateId),remote=take(pair.remoteCandidateId);
  if(wan){const candidates=wanCandidates(pc.localDescription,networks);const mapped=candidates.find(c=>c.address===local.address&&c.port===local.port)||candidates.find(c=>c.relatedAddress===local.address&&c.relatedPort===local.port);if(!mapped)throw lanError('FT_WAN_ADDRESS_HIDDEN');local={address:mapped.address,port:mapped.port,type:mapped.type,protocol:mapped.protocol};}
  return (wan?validateWanRoute:validateRoute)({local,remote},networks);
}
async function gathered(pc, signal) {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise((resolve, reject) => {
    const done = error => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', change); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    const change = () => { if (pc.iceGatheringState === 'complete') done(); }; const abort = () => done(lanError('FT_CANCELLED'));
    const timer = setTimeout(() => done(lanError('FT_CONNECTION_TIMEOUT')), 15000);
    pc.addEventListener('icegatheringstatechange', change); signal.addEventListener('abort', abort, { once: true }); change();
  });
}
export class DirectPeer {
  constructor({ ticket, scope = globalThis, onState = () => {} }) {
    this.ticket = ticket; this.scope = scope; this.onState = onState;
    this.transport='lan-direct';this.recovery=null;this.sourceBundle=null;this.saveContext=null;this.saveKind='';this.history=recoveryHistory(scope);this.owner='';this.remember=false;this.retryCount=0;this.historyRows=[];
    this.state = { recovery:null,recoverySaved:false,retryCount:0,speedBytes:0,etaSeconds:null,history:[], transport:'lan-direct', share:null, status: 'idle', role: '', code: '', error: '', name: null, note: '', summary: null, manifest: null, progress: { bytes: '0', totalBytes: '0', path: '' }, result: null, rateKbps: null, link: '' };
    this.controller = null; this.connection = null; this.socket = null; this.channel = null; this.remote = null; this.cleanupSource = null; this.generation = 0;
  }
  update(value) { this.state = { ...this.state, ...value }; this.onState(this.state); }
  configureRecovery(owner,remember=this.remember){
    if(this.owner&&this.owner!==owner){if(this.recovery)this.pause();else this.stop();this.sourceBundle=null;this.saveContext=null;this.recovery=null;this.update({status:'idle',recovery:null,recoverySaved:false,manifest:null,summary:null,error:''});}
    if(this.owner===owner&&this.remember&&!remember&&this.recovery){this.history.remove(owner,this.recovery.task,this.state.role);this.update({recoverySaved:false});}
    this.owner=owner;this.remember=remember;this.historyRows=this.history.list(owner);this.update({history:this.historyRows});if(remember)this.persistRecovery();
  }
  persistRecovery(){if(!this.remember||!this.owner||!this.recovery)return;const saved=this.history.put(this.owner,this.state.role,this.recovery,this.saveKind,this.saveContext?.handle.name||this.state.destinationName||'');this.update({recoverySaved:saved,history:this.history.list(this.owner)});}
  forgetRecovery(task,role){this.history.remove(this.owner,task,role);this.update({history:this.history.list(this.owner)});}
  setRecovery(info){this.recovery=info;this.update({recovery:info,recoverySaved:false});this.persistRecovery();}
  progress(value){const time=Date.now();if(this.lastProgress&&time-this.lastProgress<100&&value.bytes!==value.totalBytes)return;const previous=this.progressSample;let speed=this.state.speedBytes;if(previous&&time>previous.at)speed=Math.max(0,Number(BigInt(value.bytes)-BigInt(previous.bytes))*1000/(time-previous.at));this.progressSample={at:time,bytes:value.bytes};this.lastProgress=time;this.update({status:'transferring',progress:value,speedBytes:speed,etaSeconds:speed>0?Math.ceil(Number(BigInt(value.totalBytes)-BigInt(value.bytes))/speed):null});}
  active() { return !['idle', 'complete', 'cancelled', 'error','shared','paused','retrying'].includes(this.state.status); }
  stop() {
    this.generation++;clearTimeout(this.retryTimer);this.checkpointWait?.reject(lanError('FT_CONNECTION_CLOSED'));this.checkpointWait=null; clearInterval(this.renewTimer); clearInterval(this.routeTimer); clearTimeout(this.connectTimer); clearTimeout(this.finishTimer);
    this.controller?.abort(); this.cleanupSource?.(); this.cleanupSource = null; this.remote?.dispose(); this.remote = null;
    this.channel?.close(); this.connection?.close(); this.socket?.close(); this.channel = null; this.connection = null; this.socket = null; this.prepared = null;
  }
  fail(error) {
    if (!this.active()) return;
    const code = error?.name === 'AbortError' || error?.code === 'FT_CANCELLED' ? 'FT_PAUSED' : error?.code || 'FT_CONNECTION_FAILED';
    const recoverable=this.recovery&&canRecover(code)&&this.recovery.expiresAt>Date.now();
    this.stop();this.update({status:code==='FT_PAUSED'?'paused':'error',error:code,partialDirectory:error?.partialDirectory||'',completedFiles:error?.completedFiles||0,speedBytes:0,etaSeconds:null});
    if(recoverable){this.persistRecovery();const canAuto=!this.discarding&&RETRYABLE.has(code)&&(this.state.role==='send'?!!this.sourceBundle:!!this.saveContext||this.state.transport==='temporary-share'&&!!this.saveKind);
      if(canAuto&&this.retryCount<(this.recovery.automaticRetries||0)){const delay=1000*2**this.retryCount;this.retryCount++;this.update({status:'retrying',retryCount:this.retryCount});this.retryTimer=setTimeout(()=>{void this.resume()},delay);}}
  }
  pause(){if(!this.recovery)return;try{this.send({type:'pause'})}catch{}this.stop();this.update({status:'paused',error:'FT_PAUSED',speedBytes:0,etaSeconds:null});this.persistRecovery();}
  finishCancel(){this.stop();if(this.recovery)this.forgetRecovery(this.recovery.task,this.state.role);this.recovery=null;this.discarding=false;this.update({status:'cancelled',error:'FT_CANCELLED',recovery:null});}
  cancel() {if(this.recovery&&!this.active()&&this.socket?.readyState!==1){this.discarding=true;void this.begin(this.state.role,{type:'resume-discard',token:this.recovery.token});return;}try{this.send({type:'cancel'})}catch{}this.finishCancel();}
  async resume(bundle=null,record=null){
    if(this.active())return;this.discarding=false;clearTimeout(this.retryTimer);if(record){this.recovery=record;this.transport=record.transport;this.saveKind=record.kind||'';this.saveContext=null;this.update({role:record.role,transport:record.transport,recovery:record,destinationName:record.destinationName||''});}
    if(!this.recovery||this.recovery.expiresAt<=Date.now()){this.update({status:'error',error:'FT_RECOVERY_UNAVAILABLE'});return;}
    if(bundle)this.sourceBundle=bundle;
    if(this.state.role==='send'&&!this.sourceBundle){this.update({status:'paused',error:'FT_RECOVERY_SOURCE'});return;}
    this.autoSave=!!this.saveContext;this.progressSample=null;
    await this.begin(this.state.role,{type:'resume-info',token:this.recovery.token});
  }
  async checkpoint(point){
    if(!this.recovery)return;const run=this.generation;
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(run===this.generation){this.checkpointWait=null;reject(lanError('FT_CONNECTION_TIMEOUT'))}},10000);this.checkpointWait={point,resolve:()=>{clearTimeout(timer);resolve()},reject:e=>{clearTimeout(timer);reject(e)}};try{this.send({type:'checkpoint',point})}catch(e){this.checkpointWait=null;clearTimeout(timer);reject(e)}});
  }
  send(message) { if (this.socket?.readyState !== 1) throw lanError('FT_CONNECTION_CLOSED'); this.socket.send(JSON.stringify(message)); }
  async begin(role, action) {
    if (this.active()) return;
    this.stop(); this.controller = new AbortController(); const run = this.generation;
    this.update({ status: 'connecting', role, transport:this.transport,share:null, code: '', error: '', manifest: null, summary: null, result: null, link: '', progress: { bytes: '0', totalBytes: '0', path: '' } });
    try {
      if (!this.scope.isSecureContext || (['lan-direct','wan-direct'].includes(this.transport)&&!this.scope.RTCPeerConnection) || !this.scope.WebSocket || !this.scope.crypto?.subtle) throw lanError('FT_BROWSER_UNSUPPORTED');
      const ticket = await this.ticket(role,this.transport); if (run !== this.generation) return;
      this.networks = this.transport==='wan-direct'?publicNetworks(ticket.networks):lanNetworks(this.transport==='lan-direct'?ticket.networks:'');this.iceServers=ticket.iceServers||[]; this.pendingAction = action;
      const url = new URL(ticket.signalPath, this.scope.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      this.socket = new this.scope.WebSocket(url); let queue = Promise.resolve();
      this.socket.addEventListener('open', () => { if (run === this.generation) this.send({ type: 'auth', ticket: ticket.ticket }); });
      this.socket.addEventListener('message', event => {
        queue = queue.then(async () => { if (run !== this.generation) return; if (typeof event.data !== 'string' || event.data.length > L.signalBytes) throw lanError('FT_PROTOCOL'); await this.message(JSON.parse(event.data)); }).catch(e => { if (run === this.generation) this.fail(e); });
      });
      this.socket.addEventListener('close', () => { if (run === this.generation && this.active()) this.fail(lanError('FT_CONNECTION_CLOSED')); });
      this.socket.addEventListener('error', () => { if (run === this.generation) this.fail(lanError('FT_SIGNAL_UNAVAILABLE')); });
      this.connectTimer = setTimeout(() => { if (run === this.generation) this.fail(lanError('FT_CONNECTION_TIMEOUT')); }, 15000);
      let renewing = false;
      this.renewTimer = setInterval(async () => {
        if (renewing || run !== this.generation) return; renewing = true;
        try { const fresh = await this.ticket(role,this.transport); if (run === this.generation) this.send({ type: 'renew', ticket: fresh.ticket }); }
        catch (e) { if (run === this.generation) this.fail(e); } finally { renewing = false; }
      }, 15000);
    } catch (e) { if (run === this.generation) this.fail(e); }
  }
  async create(bundle, note = '', rateKbps = null, transport='lan-direct') {
    if (this.active() || this.preparing) return;
    this.preparing = true; const before = this.generation; let prepared;
    try { prepared = await prepareTransfer(bundle); } catch (e) { this.update({ status: 'error', error: e.code || 'FT_READ_FAILED' }); return; } finally { this.preparing = false; }
    if (before !== this.generation || this.active()) return;
    this.transport=transport;this.sourceBundle=prepared.bundle;this.recovery=null;this.saveContext=null;this.saveKind='';this.retryCount=0;this.update({recovery:null,recoverySaved:false,retryCount:0});
    if(['server-relay','temporary-share'].includes(transport)&&prepared.manifest.length>CONTROL_MANIFEST_BYTES){this.update({status:'error',error:'FT_SHARE_TOO_LARGE'});return;}
    await this.begin('send', { type: transport==='temporary-share'?'share-create':'create', summary: prepared.summary, note, rateKbps });
    if (this.active()) { this.prepared = prepared; this.update({ summary: prepared.summary }); }
  }
  async join(value,rateKbps=null,transport='lan-direct') {
    if(this.active())return;this.recovery=null;this.sourceBundle=null;this.saveContext=null;this.saveKind='';this.retryCount=0;this.update({recovery:null,recoverySaved:false,retryCount:0});
    this.transport=transferHint(value)||transport;
    if(this.transport==='temporary-share'){const token=readShareToken(value);if(!token){this.update({status:'error',error:'FT_SHARE_UNAVAILABLE'});return;}this.shareToken=token;await this.begin('receive',{type:'share-info',token});return;}
    const code=readPairCode(value);if(!code){this.update({status:'error',error:'FT_CODE_UNAVAILABLE'});return;}await this.begin('receive',{type:'join',code,rateKbps});
  }
  claimShare(){try{this.send({type:'share-claim',token:this.shareToken});this.update({status:'reading-manifest'});}catch(e){this.fail(e)}}
  confirm() { try { this.send({ type: 'confirm' }); this.update({ status: 'waiting-confirmation' }); } catch (e) { this.fail(e); } }
  async message(data) {
    if(data.type==='resume-info'){
      this.setRecovery(data.info);this.update({status:'verifying',summary:data.info.summary,note:data.note});
      if(this.state.role==='send'){const run=this.generation,prepared=await prepareTransfer(this.sourceBundle);if(prepared.summary.manifestHash!==data.info.summary.manifestHash)throw lanError('FT_RECOVERY_SOURCE');await verifyPrefix(prepared.bundle,prepared.summary,data.info.point,this.controller.signal,value=>this.update({verifiedBytes:value}));if(run!==this.generation)return;this.prepared=prepared;}
      this.send({type:'resume-attach',token:this.recovery.token,point:this.recovery.point});return;
    }
    if(data.type==='resuming'){this.setRecovery(data.info);this.update({status:'waiting-resume'});return;}
    if(data.type==='checkpoint'){if(this.recovery){this.setRecovery({...this.recovery,point:data.point});if(this.checkpointWait&&samePoint(this.checkpointWait.point,data.point)){const pending=this.checkpointWait;this.checkpointWait=null;pending.resolve();}}return;}
    if(data.type==='resume-discarded'){this.finishCancel();return;}
    if(data.type==='resume-complete'){this.stop();if(this.recovery)this.forgetRecovery(this.recovery.task,this.state.role);this.recovery=null;this.update({status:data.type==='resume-complete'?'complete':'cancelled',recovery:null,error:''});return;}
    if(data.type==='relay'||data.type==='share-data'){if(!this.channel)throw lanError('FT_PROTOCOL');this.channel.receive(data.wire);return;}
    if(data.type==='share-info'){this.update({status:'share-preview',share:data.info,summary:data.info.summary,note:data.info.note,expiresAt:data.info.expiresAt});return;}
    if(data.type==='share-authorized'){this.installWire('share-data');await this.message({type:'authorized',summary:data.summary,rateKbps:data.rateKbps,route:'temporary-share',recovery:data.recovery});return;}
    if(data.type==='share-ready'){if(this.recovery)this.forgetRecovery(this.recovery.task,this.state.role);this.recovery=null;const url=new URL(this.scope.location.href);url.search='?mode=receive';url.hash=new URLSearchParams({share:data.info.token}).toString();this.stop();this.update({status:'shared',recovery:null,share:data.info,link:url.href,expiresAt:data.info.expiresAt,error:''});return;}
    if(data.type==='share-complete'){this.stop();if(this.recovery)this.forgetRecovery(this.recovery.task,this.state.role);this.recovery=null;this.update({status:'complete',recovery:null});return;}
    if (data.type === 'authenticated') {
      this.leaseUntil = Date.now() + data.leaseMs;
      if (this.pendingAction) { clearTimeout(this.connectTimer); this.send(this.pendingAction); this.pendingAction = null; } return;
    }
    if (data.type === 'created') { this.update({ status: 'waiting-peer', code: data.code, expiresAt: data.expiresAt, link: shareLink(this.scope.location, data.code,this.transport) }); return; }
    if (data.type === 'request' || data.type === 'invitation') { this.update({ status: 'confirm', name: data.name, ...(data.type === 'invitation' ? { summary: data.summary, note: data.note, expiresAt: data.expiresAt } : {}) }); return; }
    if (data.type === 'waiting-confirmation') return;
    if(data.type==='error'&&this.discarding&&data.code==='FT_RECOVERY_UNAVAILABLE'){this.finishCancel();return;}
    if (data.type === 'error') throw lanError(data.code);
    if (data.type === 'ended') {
      if (data.reason === 'FT_COMPLETE') {this.stop();if(this.recovery)this.forgetRecovery(this.recovery.task,this.state.role);this.recovery=null;this.update({status:'complete',recovery:null}); } else this.fail(lanError(data.reason)); return;
    }
    if (data.type === 'paired') { this.update({ status: 'checking-route' }); await this.connectRTC(); return; }
    if (data.type === 'description') {
      const description = (this.transport==='wan-direct'?safeWanDescription:safeDescription)(data.description, this.networks);
      if (description.sdp !== data.description.sdp) throw lanError('FT_ROUTE_UNKNOWN');
      await this.connection.setRemoteDescription(description);
      if (this.state.role === 'receive') {
        await this.connection.setLocalDescription(await this.connection.createAnswer()); await gathered(this.connection, this.controller.signal);
        this.send({ type: 'description', description: (this.transport==='wan-direct'?safeWanDescription:safeDescription)(this.connection.localDescription, this.networks) });
      }
      return;
    }
    if (data.type === 'authorized') {
      clearTimeout(this.connectTimer);if(data.recovery)this.setRecovery(data.recovery);
      if(data.route==='server-relay')this.installWire('relay');
      this.update({ status: this.state.role === 'send' ? 'waiting-save' : 'reading-manifest', rateKbps: data.rateKbps });
      const options = { signal: this.controller.signal, verifyRoute: () => this.verifyRoute(), rateKbps: data.rateKbps, resumePoint:this.recovery?.point,onProgress: value => this.progress(value), onError: error => this.fail(error) };
      if (this.state.role === 'send') this.cleanupSource = serveTransfer(this.channel, this.prepared, options);
      else {
        const run = this.generation;
        void receiveTransfer(this.channel, data.summary, options).then(remote => {
          if (run !== this.generation) { remote.dispose(); return; }
          this.remote = remote; this.update({ status: 'ready-save', manifest: remote.bundle.manifest, summary: data.summary });if(this.autoSave&&this.saveContext){this.autoSave=false;void this.save(this.saveKind);}
        }).catch(e => { if (run === this.generation) this.fail(e); });
      }
      return;
    }
    throw lanError('FT_PROTOCOL');
  }
  async connectRTC() {
    const pc = this.connection = new this.scope.RTCPeerConnection({ iceServers: this.iceServers||[], bundlePolicy: 'max-bundle' }); const run = this.generation;
    const install = channel => {
      if (this.channel || channel.label !== 'file-transfer-v1' || !channel.ordered || channel.maxRetransmits !== null || channel.maxPacketLifeTime !== null) { this.fail(lanError('FT_PROTOCOL')); return; }
      this.channel = channel; channel.binaryType = 'arraybuffer';
      channel.addEventListener('open', async () => {
        try {
          if (pc.sctp?.maxMessageSize && pc.sctp.maxMessageSize < L.frameBytes) throw lanError('FT_BROWSER_UNSUPPORTED');
          const route = await selectedRoute(pc, this.networks,this.transport==='wan-direct'); if (run !== this.generation) return;
          this.routeKey = JSON.stringify(route); this.routeCheckedAt = Date.now(); this.send({ type: 'route', route });
          this.routeTimer = setInterval(() => { this.verifyRoute(true).catch(e => { if (run === this.generation) this.fail(e); }); }, 1000);
        } catch (e) { if (run === this.generation) this.fail(e); }
      });
      channel.addEventListener('close', () => { if (run === this.generation && this.state.status !== 'finishing') this.fail(lanError('FT_CONNECTION_CLOSED')); });
      channel.addEventListener('error', () => { if (run === this.generation && this.state.status !== 'finishing') this.fail(lanError('FT_CONNECTION_FAILED')); });
    };
    pc.addEventListener('datachannel', event => install(event.channel));
    pc.addEventListener('connectionstatechange', () => { if (run === this.generation && this.state.status !== 'finishing' && ['failed', 'disconnected'].includes(pc.connectionState)) this.fail(lanError('FT_CONNECTION_CLOSED')); });
    this.connectTimer = setTimeout(() => { if (run === this.generation) this.fail(lanError('FT_CONNECTION_TIMEOUT')); }, 30000);
    if (this.state.role === 'send') {
      install(pc.createDataChannel('file-transfer-v1', { ordered: true }));
      await pc.setLocalDescription(await pc.createOffer()); await gathered(pc, this.controller.signal);
      this.send({ type: 'description', description: (this.transport==='wan-direct'?safeWanDescription:safeDescription)(pc.localDescription, this.networks) });
    }
  }
  installWire(type) {
    this.channel=new WireChannel(wire=>this.send({type,wire}));
  }
  async verifyRoute(force = false) {
    if (Date.now() >= this.leaseUntil) throw lanError('FT_AUTH_EXPIRED');
    if(['server-relay','temporary-share'].includes(this.transport)){if(this.controller.signal.aborted)throw lanError('FT_CANCELLED');if(this.socket?.readyState!==1)throw lanError('FT_CONNECTION_CLOSED');return;}
    if (!this.connection || this.controller.signal.aborted) throw lanError('FT_CANCELLED');
    if (!force && Date.now() - this.routeCheckedAt < 250) return;
    const route = await selectedRoute(this.connection, this.networks,this.transport==='wan-direct');
    if (JSON.stringify(route) !== this.routeKey) throw lanError('FT_ROUTE_CHANGED'); this.routeCheckedAt = Date.now();
  }
  async save(kind) {
    if (this.state.status !== 'ready-save' || !this.remote) return;
    const remote = this.remote; const run = this.generation; const signal = this.controller.signal;
    this.update({ status: 'transferring' }); clearTimeout(this.connectTimer);
    try {
      this.saveKind=kind;this.persistRecovery();
      let result;
      if(this.recovery){const output=await saveResumable(remote,this.state.summary,{kind,scope:this.scope,signal,resumePoint:this.recovery.point,context:this.saveContext,expectedName:this.state.destinationName,checkpointBytes:this.recovery.checkpointMiB*1048576,onCheckpoint:point=>this.checkpoint(point),onDestination:context=>{this.saveContext=context;this.persistRecovery();}});result=output.result;this.saveContext=output.context;}
      else{const options={scope:this.scope,signal};result=kind==='directory'?await saveDirectory(remote.bundle,options):kind==='file'?await saveSingle(remote.bundle,remote.bundle.manifest.entries[0],options):await saveZip(remote.bundle,options);}
      if (run !== this.generation) return;
      if (!remote.complete()) throw lanError('FT_INTEGRITY');
      this.update({ result, status: 'finishing' }); clearInterval(this.routeTimer);
      this.send({ type: 'complete' });
      this.finishTimer = setTimeout(() => { if (run === this.generation) this.fail(lanError('FT_COMPLETION_UNCONFIRMED')); }, 10000);
    } catch (e) {if(['FT_CHECKPOINT_INVALID','FT_RECOVERY_DESTINATION'].includes(e.code))this.saveContext=null;if (run === this.generation) this.fail(e); }
  }
}
