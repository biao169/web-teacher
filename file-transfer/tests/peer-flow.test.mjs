import {rtcAdapters} from './rtc-fixture.mjs';
// Actual controller + WebSocket service, with inspectable RTC/disk adapters.
// This does not launch a browser or claim real ICE/network interoperability.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { DirectPeer } from '../web/files/peer.mjs';
import { collectFiles } from '../web/files/collection.mjs';
import { createPairing } from '../server/pairing.mjs';
import { openStorage } from '../server/storage.mjs';
import { fixture } from './helpers.mjs';
import { defaultSettings } from '../shared/settings.mjs';

async function waitFor(fn){const end=Date.now()+5000;while(!fn()){if(Date.now()>end)throw Error('flow timeout');await new Promise(ok=>setTimeout(ok,10));}}
test('two controllers pair over actual WebSockets, require both confirmations, stream to a writer and complete',async t=>{
 const settings={...defaultSettings(),enabled:true,lanVerified:true,lanNetworks:'192.168.1.0/24'};const cleanups=[];const {config}=fixture({after:fn=>cleanups.push(fn)});const store=openStorage(config);settings.rules[1].dailyBytes='80001';settings.rules[1].monthlyBytes='90000';const pairing=createPairing({readSettings:()=>({revision:1,settings}),usage:store.usage});const server=createServer();server.on('upgrade',pairing.upgrade);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const RTC=rtcAdapters();const chunks=[];let closed=false;const sockets=[];
 const scope={isSecureContext:true,crypto,location:{href:'https://teacher.example/zh/transfer'},RTCPeerConnection:RTC,WebSocket:class{constructor(){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/transfer-api/v1/signal`);sockets.push(ws);return ws}},showSaveFilePicker:async()=>({name:'received.bin',createWritable:async()=>({write:async b=>chunks.push(b.slice()),close:async()=>{closed=true},abort:async()=>{}})})};
 const identity=id=>({kind:'user',uid:id,name:id,roleId:'staff',roleName:'Staff',sessionVersion:'s-'+id,mustChangePassword:false});
 const a=new DirectPeer({scope,ticket:async role=>pairing.issue(identity('sender'),{role})}),b=new DirectPeer({scope,ticket:async role=>pairing.issue(identity('receiver'),{role})});
 t.after(async()=>{a.stop();b.stop();sockets.forEach(ws=>ws.terminate());pairing.close();await new Promise(ok=>server.close(ok));store.close();cleanups.forEach(fn=>fn())});
 const bytes=Uint8Array.from({length:80001},(_,i)=>i%256);await a.create(collectFiles([new File([bytes],'original.bin')]),'test');await waitFor(()=>a.state.status==='waiting-peer'||a.state.status==='error');assert.equal(a.state.status,'waiting-peer',JSON.stringify(a.state));await b.join(a.state.code);await waitFor(()=>a.state.status==='confirm'&&b.state.status==='confirm');assert.equal(chunks.length,0);
 a.confirm();await new Promise(ok=>setTimeout(ok,20));assert.equal(a.connection,null);b.confirm();await waitFor(()=>b.state.status==='ready-save'||b.state.status==='error'||a.state.status==='error');assert.equal(b.state.status,'ready-save',JSON.stringify({a:a.state,b:b.state}));assert.equal(chunks.length,0);assert.equal(b.state.manifest.entries[0].relativePath,'original.bin');await b.save('file');await waitFor(()=>(a.state.status==='complete'&&b.state.status==='complete')||a.state.status==='error'||b.state.status==='error');assert.equal(a.state.status,'complete',JSON.stringify(a.state));assert.equal(b.state.status,'complete');assert.equal(closed,true);assert.deepEqual(Buffer.concat(chunks),Buffer.from(bytes));for(const id of ['sender','receiver']){const u=store.usage.snapshot(identity(id),settings);assert.equal(u.personal.daily.usedBytes,'80001');assert.equal(u.personal.daily.reservedBytes,'0');assert.equal(u.personal.daily.remainingBytes,'0');assert.equal(u.personal.activeTasks,0)}
});
