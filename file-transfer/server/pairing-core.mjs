import {samePoint,RECOVERABLE} from '../shared/recovery.mjs';
import { publicNetworks, stunServers, safeWanDescription, validateWanRoute, wanCandidates } from '../shared/network.mjs';
import { createRelay } from './relay.mjs';
import { createShareSessions } from './share-sessions.mjs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { PAIR_LIMITS as L, lanError, lanNetworks, assertAccess, validateSummary, safeDescription, validateRoute, routesMatch } from '../shared/lan.mjs';
import { usageKey } from './usage.mjs';
import { ROUTES } from '../shared/contracts.mjs';

const identityKey = usageKey;
const hash = token => createHash('sha256').update(token).digest('hex');
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const receiveCode = () => [...randomBytes(10)].map(n => alphabet[n % alphabet.length]).join('');
const peerName = identity => identity.kind === 'user' ? identity.name : null;
export function createPairingCore(storage, { now = Date.now, socketServer } = {}) {
  const tickets = new Map(); const peers = new Set(); const rooms = new Map(); const limits = new Map();
  const wss = socketServer;
  const currentSettings = () => storage.readSettings().settings;
  function limit(key, count = 30, window = 60000) {
    let item = limits.get(key);
    if (!item || now() - item.at > window) { if (limits.size >= 1000 && !item) throw lanError('FT_BUSY', 429); item = { at: now(), count: 0 }; limits.set(key, item); }
    if (++item.count > count) throw lanError('FT_TOO_MANY_ATTEMPTS', 429);
  }
  function send(p, body) {
    if (p.ws.readyState !== 1) return;
    if (p.ws.bufferedAmount > 131072) { p.ws.terminate(); return; }
    p.ws.send(JSON.stringify(body));
  }
  function closeRoom(room, reason = 'FT_CANCELLED') {
    if (!room || !rooms.has(room.code)) return;
    room.relay?.close();
    storage.recovery?.finish(room.id,reason,now());
    try { storage.usage.finish(room.id, reason, now()); } catch { reason = 'FT_ACCOUNTING_UNAVAILABLE'; }
    rooms.delete(room.code);
    for (const p of [room.sender, room.receiver].filter(Boolean)) { p.room = null; send(p, { type: 'ended', reason }); }
  }
  function remove(p) { shares?.closePeer(p,'FT_PEER_LEFT'); clearTimeout(p.timeout); peers.delete(p); closeRoom(p.room, 'FT_PEER_LEFT'); }
  function consumeTicket(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value)) throw lanError('FT_AUTH_REQUIRED', 401);
    const key = hash(value); const ticket = tickets.get(key); tickets.delete(key);
    if (!ticket || ticket.expires <= now()) throw lanError('FT_AUTH_REQUIRED', 401);
    const current = storage.readSettings(); assertAccess(current.settings,ticket.identity,ticket.role,undefined,ticket.transport,storage.vpn?.view(now()));
    return { ...ticket, revision: current.revision, lease: now() + L.leaseMs };
  }
  function issue(identity, input) {
    if (!input || !['role','role,transport'].includes(Object.keys(input).sort().join(',')) || !['send', 'receive'].includes(input.role) || input.transport!==undefined && !['lan-direct','wan-direct','server-relay','temporary-share'].includes(input.transport)) throw lanError('FT_PROTOCOL', 422);
    const transport=input.transport||'lan-direct';if(['server-relay','temporary-share'].includes(transport)&&storage.cloudBudget?.view().blocked)throw lanError('FT_CLOUD_BUDGET',429);const current=storage.readSettings();assertAccess(current.settings,identity,input.role,undefined,transport,storage.vpn?.view(now()));
    limit('ticket:' + identityKey(identity), identity.kind === 'user' ? 30 : 180);
    if (tickets.size >= 400) throw lanError('FT_BUSY', 503);
    const token = randomBytes(32).toString('base64url');
    tickets.set(hash(token), { identity, role: input.role, transport, expires: now() + L.ticketMs });
    return { ticket: token, expiresIn: L.ticketMs / 1000, renewAfter: 15, networks: transport==='wan-direct'?current.settings.wanNetworks:transport==='lan-direct'?current.settings.lanNetworks:'', transport, iceServers:transport==='wan-direct'?stunServers(current.settings.stunUrls):[], signalPath: ROUTES.signal };
  }
  function check(p, summary = p.room?.summary) {
    if (!p.auth || p.auth.lease <= now()) throw lanError('FT_AUTH_EXPIRED', 401);
    if(storage.isIdentityActive && !storage.isIdentityActive(p.auth.identity))throw lanError('FT_AUTH_EXPIRED',401);
    const current = storage.readSettings();
    if (current.revision !== p.auth.revision) throw lanError('FT_POLICY_CHANGED', 403);
    const live=Boolean(p.room||shares?.has(p));const vpn=live&&['server-relay','temporary-share'].includes(p.auth.transport)?{reason:null,eligibleForControlledTransfer:true}:storage.vpn?.view(now());
    return assertAccess(current.settings,p.auth.identity,p.auth.role,summary,p.auth.transport,vpn);
  }
  function reserve(p, summary, targetRoom = null) {
    const rule = check(p, summary);
    const active = new Set([...peers].filter(x => x.room && x.room !== targetRoom && identityKey(x.auth.identity) === identityKey(p.auth.identity)).map(x => x.room)).size;
    if (active >= rule.concurrency) throw lanError('FT_CONCURRENCY', 429);
  }
  function taskRate(value) { if (value === undefined || value === null) return null; if (!Number.isSafeInteger(value) || value < 1 || value > 1000000000) throw lanError('FT_PROTOCOL', 422); return value; }
  function recoveryInfo(record,token){const settings=currentSettings();return{task:record.id,token,transport:record.transport,point:record.point,summary:record.summary,expiresAt:record.expires_at,checkpointMiB:settings.checkpointMiB,automaticRetries:settings.automaticRetries};}
  function grant(room,rateKbps,route){
    storage.usage.authorize(room.id,[room.receiver.auth.identity,room.sender.auth.identity],currentSettings(),now());room.authorized=true;
    if(storage.recovery&&!room.recovery){room.recovery=storage.recovery.create(room.id,room.sender.auth.transport,room.summary,room.note,{send:room.sender.auth.identity,receive:room.receiver.auth.identity},rateKbps,{rateKbps,revision:room.sender.auth.revision},now());for(const member of [room.sender,room.receiver])member.resumeToken=room.recovery.tokens[member.auth.role];}
    if(room.recovery){storage.recovery.activate(room.id,now());room.expires=Math.min(room.expires,room.recovery.expires_at);}
    if(route==='server-relay')room.relay=createRelay({storage,room,check:()=>{check(room.sender,room.summary);check(room.receiver,room.summary)},send,end:reason=>closeRoom(room,reason),rateKbps,resumePoint:room.recovery?.point,now});
    for(const member of [room.sender,room.receiver])send(member,{type:'authorized',rateKbps,route,summary:room.summary,...(room.recovery?{recovery:recoveryInfo(room.recovery,member.resumeToken)}:{})});
  }
  function resumeRecord(p,token){if(!storage.recovery)throw lanError('FT_RECOVERY_UNAVAILABLE');const r=storage.recovery.lookup(token,p.auth.identity,p.auth.role,p.auth.transport,now());if(r.extra.revision!==p.auth.revision)throw lanError('FT_POLICY_CHANGED');check(p,r.summary);return r;}
  function resumeMessage(p,data){
    const r=resumeRecord(p,data.token);
    if(data.type==='resume-discard'){const room=[...rooms.values()].find(x=>x.id===r.id);if(room)closeRoom(room,'FT_CANCELLED');storage.recovery.finish(r.id,'FT_CANCELLED',now());storage.usage.finish(r.id,'FT_CANCELLED',now());if(r.extra.upload)storage.shares.fail(r.extra.shareId);send(p,{type:'resume-discarded'});return;}
    if(r.state==='complete'){if(r.transport==='temporary-share'&&r.extra.upload)return shares.completed(p,r,data.token);send(p,{type:'resume-complete'});return;}
    if(data.type==='resume-info'){send(p,{type:'resume-info',info:recoveryInfo(r,data.token),note:r.note});return;}
    if(data.type!=='resume-attach'||p.room||!samePoint(data.point,r.point))throw lanError('FT_CHECKPOINT_INVALID');
    if(p.auth.transport==='temporary-share'){return shares.resume(p,r,data.token);}
    let room=[...rooms.values()].find(x=>x.id===r.id);const member=p.auth.role==='send'?'sender':'receiver';if(room?.[member])throw lanError('FT_RECOVERY_BUSY');
    storage.usage.reopen(r.id,p.auth.role,p.auth.identity,currentSettings(),p.auth.lease,now());
    if(!room){if(rooms.size>=L.rooms)throw lanError('FT_BUSY');let code;do{code=receiveCode()}while(rooms.has(code));room={id:r.id,code,sender:null,receiver:null,summary:r.summary,note:r.note,expires:Math.min(now()+L.taskMs,r.expires_at),paired:false,authorized:false,confirmations:new Set(),descriptions:new Set(),routes:new Map(),recovery:r};rooms.set(code,room);}
    p.resumeToken=data.token;p.requestedRate=r.extra.rateKbps;room[member]=p;p.room=room;
    send(p,{type:'resuming',info:recoveryInfo(r,data.token)});
    if(room.sender&&room.receiver){room.paired=true;if(p.auth.transport==='server-relay')grant(room,r.extra.rateKbps,'server-relay');else for(const peer of [room.sender,room.receiver])send(peer,{type:'paired',role:peer.auth.role});}
  }
  function message(p, data) {
    if (!data || typeof data.type !== 'string') throw lanError('FT_PROTOCOL');
    if (data.type === 'auth' || data.type === 'renew') {
      if (Object.keys(data).sort().join(',') !== 'ticket,type' || (data.type === 'auth') === Boolean(p.auth)) throw lanError('FT_PROTOCOL');
      const auth = consumeTicket(data.ticket);
      if (p.auth && (identityKey(auth.identity) !== identityKey(p.auth.identity) || auth.role !== p.auth.role || auth.transport !== p.auth.transport || auth.identity.sessionVersion !== p.auth.identity.sessionVersion || auth.identity.roleId !== p.auth.identity.roleId || auth.revision !== p.auth.revision)) throw lanError('FT_AUTH_CHANGED', 401);
      p.auth = auth; shares?.renew(p);
      if (p.room?.expires <= now()) throw lanError('FT_PAIRING_EXPIRED');
      if (p.room) storage.usage.touch(p.room.id, Math.min(p.room.expires, ...[p.room.sender, p.room.receiver].filter(Boolean).map(m => m.auth.lease)), now());
      clearTimeout(p.timeout); send(p, { type: 'authenticated', leaseMs: L.leaseMs }); return;
    }
    check(p);
    if(['resume-info','resume-attach','resume-discard'].includes(data.type)){limit('resume:'+identityKey(p.auth.identity),30);return resumeMessage(p,data);}
    if(p.auth.transport==='temporary-share'&&shares){if(!['share-data','checkpoint'].includes(data.type))limit('share:'+identityKey(p.auth.identity),30);if(data.type==='checkpoint')limit('checkpoint:'+p.id,2000,1000);return shares.message(p,data);}
    if(!['relay','checkpoint'].includes(data.type))limit('socket:' + p.id, 100, 60000);
    const room = p.room;
    if (data.type === 'create') {
      if (p.auth.role !== 'send' || room || rooms.size >= L.rooms) throw lanError('FT_BUSY');
      validateSummary(data.summary); if (typeof data.note !== 'string' || data.note.length > 120 || /[\u0000-\u001f]/u.test(data.note)) throw lanError('FT_PROTOCOL');
      p.requestedRate = taskRate(data.rateKbps);
      reserve(p, data.summary); let code; do { code = receiveCode(); } while (rooms.has(code));
      const created = { id: randomUUID(), code, sender: p, receiver: null, summary: data.summary, note: data.note, expires: now() + L.pairingMs, paired: false, authorized: false, confirmations: new Set(), descriptions: new Set(), routes: new Map() };
      storage.usage.reserve(created.id, 'send', p.auth.identity, data.summary.totalBytes, currentSettings(), p.auth.lease, now());
      p.room = created; rooms.set(code, created); send(p, { type: 'created', code, expiresAt: created.expires }); return;
    }
    if (data.type === 'join') {
      if (p.auth.role !== 'receive' || room) throw lanError('FT_PROTOCOL');
      limit('join:' + identityKey(p.auth.identity), p.auth.identity.kind === 'user' ? 10 : 30);
      if (typeof data.code !== 'string' || !/^[2-9A-HJ-NP-Z]{10}$/u.test(data.code)) throw lanError('FT_CODE_UNAVAILABLE');
      const found = rooms.get(data.code);
      if (!found || found.receiver || found.expires <= now() || found.sender.auth.transport!==p.auth.transport) throw lanError('FT_CODE_UNAVAILABLE');
      p.requestedRate = taskRate(data.rateKbps);
      check(found.sender, found.summary); reserve(p, found.summary, found);
      storage.usage.reserve(found.id, 'receive', p.auth.identity, found.summary.totalBytes, currentSettings(), Math.min(p.auth.lease, found.sender.auth.lease), now());
      found.receiver = p; p.room = found;
      send(p, { type: 'invitation', summary: found.summary, note: found.note, name: peerName(found.sender.auth.identity), expiresAt: found.expires });
      send(found.sender, { type: 'request', name: peerName(p.auth.identity) }); return;
    }
    if (!room || room.expires <= now()) throw lanError('FT_PAIRING_EXPIRED');
    if (data.type === 'cancel' || data.type==='pause') { closeRoom(room, data.type==='pause'?'FT_PAUSED':'FT_CANCELLED'); return; }
    if(data.type==='checkpoint'){if(!room.authorized||p!==room.receiver||!room.recovery)throw lanError('FT_PROTOCOL');limit('checkpoint:'+p.id,2000,1000);if(room.relay&&!samePoint(data.point,room.relay.point()))throw lanError('FT_CHECKPOINT_INVALID');const point=storage.recovery.checkpoint(room.id,data.point,now());room.recovery.point=point;for(const peer of [room.sender,room.receiver])send(peer,{type:'checkpoint',point});return;}
    if (data.type === 'confirm') {
      if (!room.receiver || room.paired) throw lanError('FT_PROTOCOL');
      room.confirmations.add(p);
      if (room.confirmations.size === 2) {
        for (const member of [room.sender, room.receiver]) check(member, room.summary);
        room.paired = true; room.expires = now() + L.taskMs;
        if(p.auth.transport==='server-relay'){
          const rules=[check(room.sender,room.summary),check(room.receiver,room.summary)];const rates=[...rules.map(r=>r.wanRateKbps),room.sender.requestedRate,room.receiver.requestedRate].filter(n=>n!==null);const rateKbps=rates.length?Math.min(...rates):null;
          grant(room,rateKbps,'server-relay');
        }else for (const member of [room.sender, room.receiver]) send(member, { type: 'paired', role: member.auth.role });
      } else send(p, { type: 'waiting-confirmation' });
      return;
    }
    if (!room.paired) throw lanError('FT_CONFIRM_REQUIRED');
    const other = p === room.sender ? room.receiver : room.sender;
    const wan=p.auth.transport==='wan-direct';const networks=wan?publicNetworks(currentSettings().wanNetworks):lanNetworks(currentSettings().lanNetworks);
    if(data.type==='relay'&&room.relay)return room.relay.wire(p,data.wire);
    if (data.type === 'description') {
      if (room.descriptions.has(p) || data.description?.type !== (p === room.sender ? 'offer' : 'answer')) throw lanError('FT_PROTOCOL');
      const description = (wan?safeWanDescription:safeDescription)(data.description, networks); room.descriptions.add(p); if(wan)p.wanCandidates=wanCandidates(description,networks); send(other, { type: 'description', description }); return;
    }
    if (data.type === 'route') {
      if (room.authorized || room.routes.has(p)) throw lanError('FT_PROTOCOL');
      const route=(wan?validateWanRoute:validateRoute)(data.route,networks);
      if(wan&&(!p.wanCandidates?.some(c=>c.address===route.local.address&&c.port===route.local.port)||!other.wanCandidates?.some(c=>c.address===route.remote.address&&c.port===route.remote.port)))throw lanError('FT_ROUTE_UNKNOWN');
      room.routes.set(p,route);
      if (room.routes.size === 2) {
        if (!routesMatch(room.routes.get(room.sender), room.routes.get(room.receiver))) throw lanError('FT_ROUTE_UNKNOWN');
        const rules = [check(room.sender, room.summary), check(room.receiver, room.summary)];
        const rates = [...rules.map(r => wan?r.wanRateKbps:r.lanRateKbps), room.sender.requestedRate, room.receiver.requestedRate].filter(n => n !== null);
        grant(room,rates.length?Math.min(...rates):null,wan?'verified-wan':'configured-lan');
      }
      return;
    }
    if (data.type === 'complete' && room.authorized && p === room.receiver) { if(room.relay&&!room.relay.complete())throw lanError('FT_INTEGRITY');closeRoom(room, 'FT_COMPLETE'); return; }
    throw lanError('FT_PROTOCOL');
  }
  const shares=storage.shares?createShareSessions(storage,{send,check,now}):null;
  wss.on('connection', ws => {
    const p = { ws, auth: null, room: null, id: randomBytes(12).toString('hex') }; peers.add(p);
    p.timeout = setTimeout(() => ws.terminate(), 5000); p.timeout.unref?.();
    ws.on('message', (bytes,binary)=>{
      const failed=e=>{const code=e.code?.startsWith('FT_')?e.code:'FT_PROTOCOL';send(p,{type:'error',code});if(p.room)closeRoom(p.room,code);shares?.closePeer(p,code);ws.close(1008,'Request rejected');};
      try{if(binary)throw lanError('FT_PROTOCOL');Promise.resolve(message(p,JSON.parse(bytes.toString('utf8')))).catch(failed);}catch(e){failed(e)}
    });
    ws.on('error', () => {}); ws.on('close', () => remove(p));
  });
  let lastPrune = now();
  const sweep = setInterval(() => {
    if (now() - lastPrune >= 60000) {
      lastPrune = now();
      try { storage.usage.prune(currentSettings(), now()); storage.recovery?.prune(now()); } catch { for (const room of rooms.values()) closeRoom(room, 'FT_ACCOUNTING_UNAVAILABLE'); }
    }
    for (const [key, ticket] of tickets) if (ticket.expires <= now()) tickets.delete(key);
    for (const [key, item] of limits) if (now() - item.at > 60000) limits.delete(key);
    for (const room of rooms.values()) if (room.expires <= now()) closeRoom(room, 'FT_PAIRING_EXPIRED');
    for (const p of peers) if (p.auth) { try { check(p); } catch (e) { closeRoom(p.room, e.code); send(p, { type: 'error', code: e.code }); p.ws.terminate(); } }
  }, 1000); sweep.unref?.();
  return {
    issue,
    cleanupShares:()=>shares?.cleanup(),
    upgrade(req, socket, head) {
      if (req.url !== ROUTES.signal || peers.size >= L.peers) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return; }
      // Ticket is sent in the first WS frame, never in a URL/log. A fresh host
      // same-origin + CSRF protected request is the only way to obtain it.
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    },
    async close() { clearInterval(sweep); for (const room of rooms.values()) closeRoom(room, 'FT_SERVICE_STOPPED'); for (const p of peers) p.ws.terminate(); tickets.clear(); rooms.clear(); limits.clear(); wss.close();await shares?.close(); },
  };
}
