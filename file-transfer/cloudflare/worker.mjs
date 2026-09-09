import { DurableObject } from 'cloudflare:workers';
import { EventEmitter } from 'node:events';
import { openCloudStorage } from './storage.mjs';
import { createAccounts } from '../server/accounts.mjs';
import { createPairingCore } from '../server/pairing-core.mjs';
import { createPortableHttp } from '../server/portable-http.mjs';
import { ROUTES } from '../shared/contracts.mjs';
class Socket extends EventEmitter{
 constructor(ws){super();this.ws=ws;ws.addEventListener('message',e=>{const binary=typeof e.data!=='string',data=Buffer.from(e.data);if(data.length>65536)return this.terminate();this.emit('message',data,binary)});ws.addEventListener('close',()=>this.emit('close'));ws.addEventListener('error',()=>this.emit('close'));}
 get readyState(){return this.ws.readyState}get bufferedAmount(){return 0}send(data){this.ws.send(data)}close(code=1000,reason=''){try{this.ws.close(code,reason)}catch{}}terminate(){this.close(1008,'Connection closed')}
}
export class TransferState extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;ctx.blockConcurrencyWhile(async()=>{const{storage,db,atomic}=openCloudStorage(ctx,env.FT_FILES);this.storage=storage;const accounts=createAccounts(db,storage,{setupToken:env.FT_SETUP_TOKEN||'',secure:!env.FT_LOCAL_TEST,atomic});storage.recovery.recover();await storage.shares.recover();this.sockets=new Set();this.socketServer=new EventEmitter();this.socketServer.close=()=>{};this.pairing=null;this.idleTimer=null;this.http=createPortableHttp(storage,{issue:(...args)=>this.ensurePairing().issue(...args),cleanupShares:()=>this.pairing?this.pairing.cleanupShares():storage.shares.cleanup()},accounts,{cloud:true});if(!await ctx.storage.getAlarm())await ctx.storage.setAlarm(Date.now()+3600000)})}
 ensurePairing(){clearTimeout(this.idleTimer);this.idleTimer=null;return this.pairing ||= createPairingCore(this.storage,{socketServer:this.socketServer})}
 idle(){if(this.sockets.size||!this.pairing||this.idleTimer)return;this.idleTimer=setTimeout(()=>{this.idleTimer=null;if(!this.sockets.size&&this.pairing){const pairing=this.pairing;this.pairing=null;this.socketServer.removeAllListeners('connection');this.ctx.waitUntil(pairing.close())}},60000)}
 async fetch(req){const u=new URL(req.url);if(req.headers.get('upgrade')?.toLowerCase()==='websocket'){
 if(u.pathname!==ROUTES.signal||u.search||req.headers.get('origin')!==u.origin)return new Response('Forbidden',{status:403});if(this.sockets.size>=16)return new Response('Busy',{status:503});this.ensurePairing();const pair=new WebSocketPair();pair[1].accept();const socket=new Socket(pair[1]);this.sockets.add(socket);socket.on('close',()=>{this.sockets.delete(socket);this.idle()});this.socketServer.emit('connection',socket,req);return new Response(null,{status:101,webSocket:pair[0]});}
 const response=await this.http(req);this.idle();return response;}
 async alarm(){try{await (this.pairing?this.pairing.cleanupShares():this.storage.shares.cleanup());this.storage.recovery.prune(Date.now())}finally{await this.ctx.storage.setAlarm(Date.now()+3600000)}}
}
export default{async fetch(req,env){const path=new URL(req.url).pathname;if(path.startsWith('/transfer-api/'))return env.FT_STATE.get(env.FT_STATE.idFromName('primary')).fetch(req);const response=await env.ASSETS.fetch(req);const result=new Response(response.body,response);result.headers.set('X-Content-Type-Options','nosniff');result.headers.set('Referrer-Policy','same-origin');result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss: ws:; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; object-src 'none'");return result}};
