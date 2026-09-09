import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { loadConfig, assertRuntime } from '../server/config.mjs';
import { openStorage } from '../server/storage.mjs';
import { acquireRuntimeLock } from '../server/runtime-lock.mjs';
import { createPairing } from '../server/pairing.mjs';
import { installAccounts, createAccounts } from '../server/accounts.mjs';
import { createPortableHttp } from '../server/portable-http.mjs';
import { createMeterMonitor } from '../server/meter-source.mjs';
assertRuntime();const config=loadConfig();const origin=process.env.FT_PUBLIC_ORIGIN||`http://${config.host}:${config.port}`;
if(!/^https:\/\//.test(origin)&&!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))throw new Error('FT_PUBLIC_ORIGIN must use HTTPS outside localhost');
const release=acquireRuntimeLock(config),storage=openStorage(config);installAccounts(storage.accountsDB);
const accounts=createAccounts(storage.accountsDB,storage,{setupToken:process.env.FT_SETUP_TOKEN||'',secure:origin.startsWith('https:')});
storage.recovery.recover();await storage.shares.recover();const pairing=createPairing(storage),meter=createMeterMonitor(storage,config),handle=createPortableHttp(storage,pairing,accounts,{origin});
const root=resolve(config.projectRoot,'dist');await stat(resolve(root,'index.html'));
const server=createServer({maxHeaderSize:8192},async(req,res)=>{try{
 if(!req.url?.startsWith('/')||req.url.startsWith('//')||/[\\%#]/.test(req.url.split('?')[0])||req.url.split('?')[0].split('/').some(p=>p==='..'||p==='.')){res.writeHead(400);return res.end()}
 if(req.url.startsWith('/transfer-api/')){const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);headers.set('x-ft-client-ip',req.socket.remoteAddress||'local');headers.delete('cf-connecting-ip');const request=new Request(origin+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});const response=await handle(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));return}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
 const path=new URL(origin+req.url).pathname;let file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))file=resolve(root,'index.html');let data;try{data=await readFile(file)}catch{if(extname(path)){res.writeHead(404);return res.end()}file=resolve(root,'index.html');data=await readFile(file)}
 const type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ico':'image/x-icon'}[extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':type,'x-content-type-options':'nosniff','cache-control':file.endsWith('.html')?'no-cache':'public, max-age=31536000, immutable','referrer-policy':'same-origin','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss: ws:; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; object-src 'none'"});res.end(req.method==='HEAD'?undefined:data);
 }catch{if(!res.headersSent)res.writeHead(500);res.end('Service unavailable')}});
server.requestTimeout=10000;server.headersTimeout=5000;
server.on('upgrade',(req,socket,head)=>{if(req.headers.origin!==origin)return socket.destroy();pairing.upgrade(req,socket,head)});
server.on('clientError',(_,socket)=>socket.destroy());server.listen(config.port,config.host,()=>{meter.start();console.log(`File transfer: ${origin}`);if(accounts.needsSetup())console.log('Initialize at /setup using FT_SETUP_TOKEN, or run pnpm admin:init.');});
let closing=false;async function close(){if(closing)return;closing=true;server.close();await pairing.close();await meter.close();server.closeAllConnections();storage.close();release()};process.on('SIGINT',close);process.on('SIGTERM',close);
