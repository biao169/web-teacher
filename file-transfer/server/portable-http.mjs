import { ROUTES, SERVICE, TRANSPORTS, capabilities } from '../shared/contracts.mjs';
import { transportReadiness } from '../shared/network.mjs';
import { publicPolicy, settingsError } from '../shared/settings.mjs';
export function createPortableHttp(storage,pairing,accounts,{origin='',cloud=false}={}){
 const caps=()=>{const s=storage.readSettings().settings;const paths=TRANSPORTS.map(id=>{const reason=storage.cloudBudget?.view().blocked&&['server-relay','temporary-share'].includes(id)?'FT_CLOUD_BUDGET':transportReadiness(s,id,storage.vpn.view());return{id,available:!reason,reason}});return{...capabilities(true,paths[0].available,paths),deployment:cloud?'cloudflare':'standalone',vpnMeteringAvailable:!cloud};};
 const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff',...headers}});
 return async req=>{let extra={};try{
 const url=new URL(req.url),path=url.pathname,write=!['GET','HEAD'].includes(req.method);
 if(!path.startsWith('/transfer-api/'))return json({error:{code:'FT_NOT_FOUND'}},404);
 if(write&&req.headers.get('origin')!==(origin||url.origin))throw settingsError('FT_ORIGIN',403);
 let input; if(write){if(!['POST','PUT'].includes(req.method))throw settingsError('FT_METHOD_NOT_ALLOWED',405);if(!req.headers.get('content-type')?.startsWith('application/json')||req.headers.get('content-encoding'))throw settingsError('FT_CONTENT_TYPE',415);const reader=req.body?.getReader();let size=0,chunks=[];if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>131072){await reader.cancel();throw settingsError('FT_BODY_TOO_LARGE',413)}chunks.push(value)}try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw settingsError('FT_VALIDATION',422)}}
 if([ROUTES.health,ROUTES.ready,ROUTES.capabilities].includes(path)){if(write)throw settingsError('FT_METHOD_NOT_ALLOWED',405);return json(path===ROUTES.capabilities?caps():{...SERVICE,status:storage.health()?'ready':'not-ready'},storage.health()?200:503)}
 const current=accounts.state(req);extra=current.headers;const identity=current.identity,manager=identity.kind==='user'&&storage.isManager(identity.uid);
 if(write&&identity.kind==='user'&&req.headers.get('x-csrf-token')!==current.csrf)throw settingsError('FT_CSRF',403);
 if(path.startsWith('/transfer-api/v1/auth/')){const action=path.split('/').at(-1);if(!['status','setup','login','logout'].includes(action))throw settingsError('FT_NOT_FOUND',404);if((action==='status'?'GET':'POST')!==req.method)throw settingsError('FT_METHOD_NOT_ALLOWED',405);const result=await accounts.handle(req,path,input,current);return json(result.body,200,{...extra,...result.headers})}
 const methods=new Map([[ROUTES.session,['GET']],[ROUTES.ticket,['PUT']],[ROUTES.shareAction,['PUT']],[ROUTES.adminOverview,['GET']],[ROUTES.adminSettings,['GET','PUT']],[ROUTES.adminShares,['GET']],[ROUTES.adminSharesAction,['PUT']],[ROUTES.adminVpn,['GET']],[ROUTES.adminVpnCalibrate,['PUT']],[ROUTES.adminVpnReconcile,['PUT']],['/transfer-api/v1/admin/accounts',['GET','PUT']]]);
 if(!methods.has(path))throw settingsError('FT_NOT_FOUND',404);if(!methods.get(path).includes(req.method))throw settingsError('FT_METHOD_NOT_ALLOWED',405);
 const session={authenticated:identity.kind==='user',user:identity.kind==='user'?identity:null,permissions:manager?['transfer.manage']:[],capabilities:caps(),policy:publicPolicy(storage.readSettings().settings,identity,storage.usage.snapshot(identity,storage.readSettings().settings),storage.vpn.view())};
 session.policy.cloudBudget=storage.cloudBudget?.view()||null;if(session.policy.cloudBudget?.blocked){for(const link of session.policy.links)if(['server-relay','temporary-share'].includes(link.id)){link.available=false;link.reason='FT_CLOUD_BUDGET';link.accessReasons={send:'FT_CLOUD_BUDGET',receive:'FT_CLOUD_BUDGET'}}session.policy.transferAvailable=session.policy.links.some(l=>l.available)}
 let body;if(path===ROUTES.session)body=session;
 else if(path===ROUTES.ticket)body=pairing.issue(identity,input);
 else if(path===ROUTES.shareAction){if(typeof input?.id!=='string')throw settingsError('FT_VALIDATION',422);storage.shares.revoke(input.id,identity);body={revoked:true}}
 else {if(!manager)throw settingsError('FT_FORBIDDEN',403);
 if(path.endsWith('/accounts')){if(write)await accounts.update(input,identity.uid);body={items:accounts.list()}}
 else if(path===ROUTES.adminSettings)body=write?storage.saveSettings(input,identity.uid):storage.readSettings();
 else if(path===ROUTES.adminShares)body=storage.shares.list();
 else if(path===ROUTES.adminSharesAction){if(input?.action==='cleanup')body={...await pairing.cleanupShares(),...storage.shares.list()};else if(input?.action==='revoke'&&typeof input.id==='string'){storage.shares.revoke(input.id,identity,true);body=storage.shares.list()}else throw settingsError('FT_VALIDATION',422)}
 else if(path===ROUTES.adminVpn)body=storage.vpn.view(Date.now(),true);
 else if(path===ROUTES.adminVpnCalibrate||path===ROUTES.adminVpnReconcile){if(cloud)throw settingsError('FT_METER_UNAVAILABLE',409);body=path===ROUTES.adminVpnCalibrate?storage.vpn.calibrate(input,identity.uid):storage.vpn.reconcile(input,identity.uid)}
 else body={session,service:SERVICE,managers:storage.listManagers(),settingsAvailable:true,transferAvailable:session.policy.transferAvailable};}
 return json(body,200,extra);
 }catch(e){return json({error:{code:e.code?.startsWith('FT_')?e.code:'FT_INTERNAL'},fields:e.fields||{}},e.status||500,extra)}};
}
