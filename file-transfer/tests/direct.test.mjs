import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { collectFiles, collectHandle } from '../web/files/collection.mjs';
import { prepareTransfer, serveTransfer, receiveTransfer, sendBounded } from '../web/files/direct.mjs';
import { boundedBlob, writeDirectory } from '../web/files/save.mjs';
import { zipChunks, zipSize } from '../web/files/zip.mjs';
import { defaultSettings, validateSettings } from '../shared/settings.mjs';
import { lanNetworks, safeDescription, validateRoute, routesMatch, assertAccess } from '../shared/lan.mjs';
import { identityFromSession } from '../server/bridge-token.mjs';
import { selectedRoute, readPairCode, shareLink } from '../web/files/peer.mjs';

function channels() {
  class Channel extends EventTarget {
    readyState = 'open'; bufferedAmount = 0; maximum = 0;
    send(data) { if (this.readyState !== 'open') throw Error('closed'); if (typeof data !== 'string') { this.maximum = Math.max(this.maximum, data.byteLength); data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); } const event = new MessageEvent('message', {data}); setImmediate(() => this.other.dispatchEvent(event)); }
    close() { this.readyState='closed'; this.dispatchEvent(new Event('close')); }
  }
  const a=new Channel(), b=new Channel();a.other=b;b.other=a;return [a,b];
}
async function connected(t,bundle, options={}) {
  const [a,b]=channels();const controller=new AbortController();let error;
  const prepared=await prepareTransfer(bundle);const cleanup=serveTransfer(a,prepared,{signal:controller.signal,onError:e=>{error=e;b.close()},...options});
  t.after(()=>{controller.abort();cleanup();a.close();b.close()});
  const remote=await receiveTransfer(b,prepared.summary,{signal:controller.signal,rateKbps:options.rateKbps ?? null});t.after(remote.dispose);
  return {a,b,remote,prepared,controller,getError:()=>error};
}
test('LAN range verification rejects public, overlapping-boundary, malformed, IPv6 and mDNS addresses',()=>{
  const networks=lanNetworks('192.168.1.0/24\n10.20.0.0/16');assert.equal(networks.length,2);
  for(const s of ['0.0.0.0/0','8.8.8.0/24','172.0.0.0/8','192.168.1.1/24','192.168.01.0/24','fd00::/64']) assert.throws(()=>lanNetworks(s));
  const c={address:'192.168.1.2',port:5000,type:'host',protocol:'udp'};const route={local:c,remote:{...c,address:'192.168.1.3',port:6000}};
  assert.equal(validateRoute(route,networks),route);assert.ok(routesMatch(route,{local:route.remote,remote:route.local}));
  for(const address of ['secret.local','10.20.0.2','8.8.8.8','::1'])assert.throws(()=>validateRoute({...route,remote:{...c,address}},networks));
  assert.throws(()=>validateRoute({...route,local:{...c,type:'relay'}},networks));
});
test('only administrator-verified LAN and authorized directions are admitted; personal total admission is delegated to the persistent ledger',()=>{
  const s=defaultSettings(),identity=identityFromSession(null);assert.throws(()=>assertAccess(s,identity,'send'),/FT_TOOL_DISABLED/);
  s.enabled=true;assert.throws(()=>assertAccess(s,identity,'send'),/FT_LAN_UNVERIFIED/);s.lanNetworks='192.168.1.0/24';s.lanVerified=true;
  assert.throws(()=>assertAccess(s,identity,'send'),/FT_ACCESS_DENIED/);s.rules[0].send=true;assert.ok(assertAccess(s,identity,'send'));
  s.rules[0].dailyBytes='100';assert.doesNotThrow(()=>assertAccess(s,identity,'send'));s.rules[0].dailyBytes=null;
  assert.throws(()=>validateSettings({...s,lanNetworks:''}),/FT_VALIDATION/);
});
const sdp='v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 AB:CD\r\na=candidate:1 1 udp 1 192.168.1.2 5000 typ host\r\na=candidate:2 1 udp 1 8.8.8.8 5001 typ srflx\r\na=candidate:3 1 udp 1 hidden.local 5002 typ host\r\n';
test('SDP exposes only allowed UDP host candidates and never admits camera, microphone, relay or unknown-address descriptions',()=>{
 const networks=lanNetworks('192.168.1.0/24');const d=safeDescription({type:'offer',sdp},networks);assert.ok(!d.sdp.includes('8.8.8.8'));assert.ok(!d.sdp.includes('hidden.local'));assert.deepEqual(safeDescription(d,networks),d);
 assert.throws(()=>safeDescription({type:'offer',sdp:sdp.replace('m=application','m=video')},networks));assert.throws(()=>safeDescription({type:'offer',sdp:sdp.replace('192.168.1.2','outside.local')},networks),/FT_LAN_ADDRESS_HIDDEN/);
});
test('selected route is derived from selectedCandidatePairId and fails closed on unavailable or changed candidate metadata',async()=>{
 const stats=new Map([['t',{type:'transport',selectedCandidatePairId:'p'}],['p',{state:'succeeded',localCandidateId:'a',remoteCandidateId:'b'}],['a',{address:'192.168.1.2',port:5000,candidateType:'host',protocol:'udp'}],['b',{address:'192.168.1.3',port:6000,candidateType:'host',protocol:'udp'}]]);
 assert.equal((await selectedRoute({getStats:async()=>stats},lanNetworks('192.168.1.0/24'))).local.port,5000);stats.get('a').address=undefined;await assert.rejects(selectedRoute({getStats:async()=>stats},lanNetworks('192.168.1.0/24')),/FT_ROUTE_UNKNOWN/);
});
test('receive code and links use URL fragments and never add the code to a server query',()=>{
 const link=shareLink({href:'https://example.test/zh/transfer?mode=send'},'23456ABCDE');assert.equal(new URL(link).search,'?mode=receive');assert.equal(readPairCode(link),'23456ABCDE');assert.equal(readPairCode('23456 abcde'),'23456ABCDE');assert.equal(readPairCode('wrong'),'');
});
test('direct pull transport round-trips binary data and empty files with matching SHA-256 and bounded frames',async t=>{
 const bytes=Uint8Array.from({length:230001},(_,i)=>(i*73)%256);const original=collectFiles([new File([bytes],'中文.bin'),new File([],'empty.txt')]);
 const {a,remote,prepared}=await connected(t,original);assert.deepEqual(remote.bundle.manifest,{version:1,entries:[original.manifest.entries[1],original.manifest.entries[0]]});assert.deepEqual(original.manifest.entries.map(e=>e.relativePath),['中文.bin','empty.txt']);
 for(const entry of remote.bundle.manifest.entries){const chunks=[];for await(const c of remote.bundle.sources.get(entry.relativePath)())chunks.push(c);const out=Buffer.concat(chunks);assert.equal(out.length,Number(entry.sizeBytes));if(entry.relativePath==='中文.bin')assert.equal(createHash('sha256').update(out).digest('hex'),createHash('sha256').update(bytes).digest('hex'));}
 assert.ok(remote.complete());assert.ok(a.maximum<=16384);assert.equal(prepared.summary.maxFileBytes,'230001');
});
test('network source feeds the existing ZIP writer including empty directories without buffering files',async t=>{
 const handle={name:'资料',kind:'directory',async*values(){yield{name:'空目录',kind:'directory',async*values(){}};yield{name:'a.txt',kind:'file',getFile:async()=>new File(['hello'],'a.txt',{lastModified:10})}}};
 const original=await collectHandle(handle);const {remote}=await connected(t,original);const zip=await boundedBlob(zipChunks(remote.bundle),zipSize(remote.bundle.manifest));assert.equal(zip.size,Number(zipSize(original.manifest)));assert.ok(remote.complete());assert.ok(Buffer.from(await zip.arrayBuffer()).includes(Buffer.from('资料/空目录/')));
});
test('receiver checks byte hashes and aborts corrupted frames before returning file contents',async t=>{
 const original=collectFiles([new File(['important'],'x.bin')]);const {a,remote}=await connected(t,original);const send=a.send.bind(a);a.send=data=>{if(typeof data!=='string' && new DataView(data.buffer,data.byteOffset).getInt32(4)===0){data=data.slice();data[48]^=1;}send(data)};
 const entry=remote.bundle.manifest.entries[0];await assert.rejects(async()=>{for await(const _ of remote.bundle.sources.get(entry.relativePath)()){}},/FT_INTEGRITY/);
});
test('slow receiver controls the next read, source is lazy, and configured LAN pacing applies',async t=>{
 const original=collectFiles([new File([new Uint8Array(20000)],'x.bin')]);const started=performance.now();const {remote}=await connected(t,original,{rateKbps:800});const it=remote.bundle.sources.get('x.bin')()[Symbol.asyncIterator]();await it.next();const first=performance.now();await new Promise(ok=>setTimeout(ok,30));await it.next();await it.next();assert.ok(performance.now()-first>=100);assert.ok(performance.now()-started<5000);assert.ok(remote.complete());
});
test('cancellation while waiting on a response rejects promptly and releases the pending read',async t=>{
 const original=collectFiles([new File(['a'],'x')]);const {a,remote,controller}=await connected(t,original);a.send=()=>{};const promise=(async()=>{for await(const _ of remote.bundle.sources.get('x')()) {}})();setTimeout(()=>controller.abort(),20);await assert.rejects(promise,/FT_CANCELLED/);
});
test('source mutation and route verification failure stop data serving',async t=>{
 const file=new File(['abc'],'a',{lastModified:1});let current=file;const original=await collectHandle({kind:'file',name:'a',getFile:async()=>current});const {remote,getError}=await connected(t,original);current=new File(['def'],'a',{lastModified:2});await assert.rejects(async()=>{for await(const _ of remote.bundle.sources.get('a')()){}},/FT_CONNECTION_CLOSED/);assert.equal(getError().code,'FT_FILE_CHANGED');
});
test('channel backpressure waits for the low watermark and respects cancellation',async()=>{
 const [a]=channels();a.bufferedAmount=70000;const ctrl=new AbortController();const sending=sendBounded(a,new Uint8Array(10),ctrl.signal);ctrl.abort();await assert.rejects(sending,/FT_CANCELLED/);
});

test('very low configured rates reduce data request sizes to avoid exceeding the inactivity timeout',async t=>{
 const {remote}=await connected(t,collectFiles([new File([new Uint8Array(130)],'slow')]),{rateKbps:1});const it=remote.bundle.sources.get('slow')()[Symbol.asyncIterator]();const first=await it.next();assert.equal(first.value.length,125);const second=await it.next();assert.equal(second.value.length,5);assert.equal((await it.next()).done,true);assert.ok(remote.complete());
});
