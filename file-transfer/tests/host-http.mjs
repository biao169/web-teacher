import {DirectPeer} from '../web/files/peer.mjs';
import {collectFiles} from '../web/files/collection.mjs';
import WebSocket from 'ws';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/service.mjs';
import { validateConfig, PROJECT_ROOT } from '../server/config.mjs';
import { readGuestCookie } from '../server/guest-cookie.mjs';
import { openStorage } from '../server/storage.mjs';
import { usagePeriods } from '../server/usage.mjs';

const root = resolve(process.argv[2] ?? join(PROJECT_ROOT, '../academic-cms'));
const require = createRequire(resolve(root, 'package.json'));
const Database = require('better-sqlite3');
const { Window } = require('happy-dom');
const moduleAt = p => import(pathToFileURL(resolve(root, p)).href);
const { loadMigrations, applyMigrations } = await moduleAt('scripts/db/migrations.mjs');
const { runProcess } = await moduleAt('scripts/release/process.mjs');
const { assertCurrentBuildSource } = await moduleAt('scripts/release/assert-current-source.mjs');
await assertCurrentBuildSource(root);
await mkdir(resolve(root, '.tmp'), { recursive: true });
const directory = await mkdtemp(resolve(root, '.tmp/production-e2e-transfer-'));
const toolRoot = join(directory, 'tool'); await mkdir(toolRoot);
const report = join(PROJECT_ROOT, 'reports/step10'); await mkdir(report, { recursive: true });
const databasePath = join(directory, 'demo.sqlite3');
const password = randomBytes(32).toString('hex');
const keyPair = generateKeyPairSync('ed25519');
const signingKey = keyPair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const checks = []; const passed = name => checks.push(name);
let teacherProcess; let exited; let service; let storage; let db;
let serverLog = '';
const window = new Window();
try {
  db = new Database(databasePath); applyMigrations(db, await loadMigrations(join(root, 'migrations'))); db.close();
  const seed = await runProcess(process.execPath, ['--import', 'tsx', 'scripts/release/seed-fixture.ts'], { cwd: root, env: { CMS_E2E_DATABASE: databasePath, CMS_E2E_PASSWORD: password }, redact: [password] });
  assert.ok(seed.passed, 'isolated fixture seed');
  db = new Database(databasePath);
  const config = { ...validateConfig({ bridgePublicKey: keyPair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64') }, toolRoot), port: 0 };
  service = createService(config); const serviceAddress = await service.listen(); storage = openStorage(config);
  const socket = createServer(); await new Promise(ok => socket.listen(0, '127.0.0.1', ok));
  const port = socket.address().port; await new Promise(ok => socket.close(ok));
  const origin = `http://127.0.0.1:${port}`;
  const trustedOrigin = 'https://cms.example.invalid';
  teacherProcess = spawn(process.execPath, [join(root, '.output/server/index.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, NODE_ENV: 'production', NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port), CMS_DATABASE_PATH: databasePath,
    NUXT_AUTH_SECRET: randomBytes(48).toString('hex'), NUXT_AUTH_BOOTSTRAP_TOKEN: '', NUXT_AUTH_TRUSTED_ORIGINS: trustedOrigin,
    NUXT_AUTH_SECURE_COOKIES: 'true', NUXT_MEDIA_GRANT_SECRET: randomBytes(48).toString('hex'),
    NUXT_MEDIA_ROOT: join(directory, 'media'), NUXT_STATIC_MEDIA_ROOT: join(root, '.output/public'),
    NUXT_PUBLIC_SITE_URL: origin, NUXT_CACHE_ORIGIN: origin, NUXT_LOCALE_GEO_IP_ENABLED: 'false',
    NUXT_FILE_TRANSFER_SIGNING_KEY: signingKey, NUXT_FILE_TRANSFER_SERVICE_ORIGIN: `http://127.0.0.1:${serviceAddress.port}`,
  } });
  exited = new Promise(ok => teacherProcess.once('exit', ok));
  for (const stream of [teacherProcess.stdout, teacherProcess.stderr]) stream.on('data', chunk => { if (serverLog.length < 1024 * 1024) serverLog += chunk.toString(); });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(origin + '/health', { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch {}
    if (teacherProcess.exitCode !== null) throw new Error('Teacher service exited');
    await new Promise(ok => setTimeout(ok, 100));
  }
  assert.ok(ready); passed('teacher and independent tool both start with isolated databases');
  async function call(path, options = {}, jar = new Map()) {
    const headers = new Headers(options.headers);
    if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const response = await fetch(origin + path, { ...options, headers, signal: AbortSignal.timeout(5000), redirect: 'manual' });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';', 1)[0]; const i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    return response;
  }
  async function json(path, jar, options = {}) {
    const response = await call(path, options, jar);
    return { response, body: await response.json() };
  }
  async function login(username) {
    const jar = new Map();
    const result = await json('/api/v1/auth/login', jar, { method: 'POST', headers: { 'content-type': 'application/json', origin: trustedOrigin }, body: JSON.stringify({ username, password }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    return { jar, session: result.body };
  }
  for (const locale of ['zh', 'en']) {
    if (locale === 'en') {
      const at = new Date().toISOString();
      db.prepare("INSERT INTO navigation_items(uid,created_at,updated_at,title,title_en,kind,path,location,style,visibility,enabled,sort_order) VALUES('ft-test-custom-nav',?,?,'自定义快传','Custom transfer','internal','/transfer','header','default','public',1,999)").run(at, at);
    }
    const response = await call(`/${locale}/transfer?mode=receive`); assert.equal(response.status, 200);
    const html = await response.text(); const doc = new window.DOMParser().parseFromString(html, 'text/html');
    assert.equal(doc.querySelectorAll('.public-header').length, 1);
    assert.equal(doc.querySelectorAll('.public-footer').length, 1);
    assert.equal(doc.querySelectorAll(`.public-nav a[href="/${locale}/transfer"]`).length, 1);
    assert.equal(doc.querySelector(`.public-nav a[href="/${locale}/transfer"]`)?.getAttribute('aria-current'), 'page');
    if (locale === 'en') assert.equal(doc.querySelector('.public-nav a[href="/en/transfer"]')?.textContent.trim(), 'Custom transfer');
    assert.ok(doc.querySelector('.public-language-switch')?.getAttribute('href')?.includes('/transfer?mode=receive'));
    assert.equal(doc.querySelector('.ft-tabs button[aria-pressed="true"]')?.textContent.trim(), locale === 'zh' ? '接收' : 'Receive');
    assert.ok(doc.querySelector('.ft-pairing button[disabled]'));
    assert.ok(doc.querySelector('.ft-pairing'));
    assert.match(response.headers.get('cache-control'), /private.*no-store/u);
    assert.ok(!html.includes(signingKey));
    assert.ok(!doc.querySelector('.public-nav a[href="/admin"]')?.hasAttribute('aria-current'));
    assert.equal(doc.querySelectorAll('input[type=file]').length, 2);
    assert.ok(doc.querySelector('.ft-drop-zone'));
    passed(`${locale}: real teacher layout, one active transfer navigation, locale/mode link, disabled transfer and no-store`);
  }
  const adminPage = await call('/transfer-admin/'); assert.equal(adminPage.status, 200);
  const adminHtml = await adminPage.text(); assert.ok(adminHtml.includes('ft-admin-header')); assert.ok(!adminHtml.includes('class="public-header"'));
  passed('independent administration page renders without duplicating teacher public layout');
  const anonymous = await json('/transfer-api/v1/session');
  assert.equal(anonymous.response.status, 200, JSON.stringify(anonymous.body)); assert.equal(anonymous.body.authenticated, false);
  assert.deepEqual(anonymous.body.permissions, []);assert.equal(anonymous.body.policy.usage.established,false);assert.equal(anonymous.response.headers.getSetCookie().length,0);
  assert.equal((await call('/transfer-api/v1/admin/overview')).status, 401);
  passed('guest identity is verified as guest and cannot read management API');
  const ordinary = await login('demo_user_08');
  let result = await json('/transfer-api/v1/session', ordinary.jar);
  assert.equal(result.response.status, 200); assert.equal(result.body.user.uid, ordinary.session.user.uid); assert.deepEqual(result.body.permissions, []);
  assert.equal((await call('/transfer-api/v1/admin/overview', {}, ordinary.jar)).status, 403);
  passed('ordinary website login is reused without granting tool administration');
  const manager = await login('demo_admin');
  assert.equal((await call('/transfer-api/v1/admin/overview', {}, manager.jar)).status, 403);
  storage.setManager(manager.session.user.uid, true);
  result = await json('/transfer-api/v1/admin/overview', manager.jar);
  assert.equal(result.response.status, 200, JSON.stringify(result.body)); assert.ok(result.body.session.permissions.includes('transfer.manage'));
  assert.ok(!JSON.stringify(result.body).includes('sessionVersion'));
  passed('teacher administrator requires an explicit tool grant; granted API is private and omits token/session internals');
  assert.equal((await call('/transfer-api/v1/admin/overview', { headers: { 'x-user-role': 'admin', authorization: 'Bearer forged' } })).status, 401);
  assert.equal((await call('/transfer-api/v1/session', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await call('/transfer-api/v1/admin/overview', { method: 'POST', body: '{}' }, manager.jar)).status, 405);
  passed('forged browser role, cross-site request and unsupported mutations are rejected');
  const settingsPath = '/transfer-api/v1/admin/settings';
  assert.equal((await call(settingsPath)).status, 401);
  assert.equal((await call(settingsPath, {}, ordinary.jar)).status, 403);
  const loaded = await json(settingsPath, manager.jar); assert.equal(loaded.response.status, 200);
  const submission = { revision: loaded.body.revision, settings: loaded.body.settings, managers: loaded.body.managers };
  submission.settings.lanRateKbps = 2468;
  const writeOptions = { method: 'PUT', headers: { 'content-type': 'application/json', origin: trustedOrigin, 'x-csrf-token': manager.session.csrfToken }, body: JSON.stringify(submission) };
  assert.equal((await call(settingsPath, { ...writeOptions, headers: { 'content-type': 'application/json', origin: trustedOrigin } }, manager.jar)).status, 403);
  assert.equal((await call(settingsPath, { ...writeOptions, headers: { ...writeOptions.headers, origin: 'https://other.invalid' } }, manager.jar)).status, 403);
  assert.equal((await call(settingsPath, { ...writeOptions, headers: { ...writeOptions.headers, 'x-csrf-token': 'forged' } }, manager.jar)).status, 403);
  assert.equal((await call(settingsPath, { ...writeOptions, headers: { ...writeOptions.headers, 'content-type': 'text/plain' } }, manager.jar)).status, 415);
  passed('settings writes reject missing/forged CSRF, cross-origin and non-JSON requests before mutation');
  const ordinaryWrite = { ...writeOptions, headers: { ...writeOptions.headers, 'x-csrf-token': ordinary.session.csrfToken } };
  assert.equal((await call(settingsPath, ordinaryWrite, ordinary.jar)).status, 403);
  assert.equal(storage.readSettings().revision, loaded.body.revision);
  passed('ordinary user cannot save settings even with a valid teacher session and CSRF');
  result = await json(settingsPath, manager.jar, writeOptions);
  assert.equal(result.response.status, 200, JSON.stringify(result.body)); assert.equal(result.body.settings.lanRateKbps, 2468);
  assert.equal((await json(settingsPath, manager.jar)).body.settings.lanRateKbps, 2468);
  assert.equal((await call(settingsPath, writeOptions, manager.jar)).status, 409);
  passed('real host bridge saves and reads settings and rejects a stale revision');
  const invalidSubmission = { ...submission, revision: result.body.revision, settings: { ...submission.settings, lanRateKbps: -1 } };
  const invalidResult = await json(settingsPath, manager.jar, { ...writeOptions, body: JSON.stringify(invalidSubmission) });
  assert.equal(invalidResult.response.status, 422); assert.equal(invalidResult.body.fields.lanRateKbps, 'invalid');
  const publicView = await json('/transfer-api/v1/session', ordinary.jar); assert.equal(publicView.body.policy.rule.lanRateKbps, 2468);
  assert.ok(publicView.body.policy.links.every(link => !link.available)); assert.equal(publicView.body.policy.transferAvailable, false);
  assert.equal(publicView.body.capabilities.fileHandlingAvailable, true);
  assert.ok(!JSON.stringify(publicView.body.policy).includes(manager.session.user.uid));
  passed('field errors survive the bridge; public policy shows current limits without manager or other-user rules');
  const enabledSnapshot = storage.readSettings();
  const enabledSubmission = { revision: enabledSnapshot.revision, settings: {...enabledSnapshot.settings, enabled:true, lanNetworks:'192.168.1.0/24', lanVerified:true}, managers:enabledSnapshot.managers };
  enabledSubmission.settings.rules[1].dailyBytes='1';enabledSubmission.settings.rules[1].monthlyBytes='2';
  assert.equal((await call(settingsPath, {...writeOptions,body:JSON.stringify(enabledSubmission)}, manager.jar)).status,200);
  const vpnPath='/transfer-api/v1/admin/vpn';
  assert.equal((await call(vpnPath)).status,401);assert.equal((await call(vpnPath,{},ordinary.jar)).status,403);
  assert.equal((await call(vpnPath,{},manager.jar)).status,200);
  const vpnWritePath=vpnPath+'/calibrate';
  assert.equal((await call(vpnWritePath,{method:'PUT',headers:{'content-type':'application/json',origin:trustedOrigin},body:'{}'},manager.jar)).status,403);
  assert.equal((await call(vpnWritePath,{...writeOptions,headers:{...writeOptions.headers,origin:'https://foreign.invalid'},body:'{}'},manager.jar)).status,403);
  passed('VPN administration reuses live manager authorization, CSRF and origin protection');
  const vpnSettings=storage.readSettings();Object.assign(vpnSettings.settings,{vpnMeterSource:'snapshot',vpnScopeVerified:true,vpnProtectionMode:'estimate',vpnDailyBytes:'1000',vpnMonthlyBytes:'2000',vpnReserveBytes:'100'});
  assert.equal((await call(settingsPath,{...writeOptions,body:JSON.stringify({revision:vpnSettings.revision,settings:vpnSettings.settings,managers:vpnSettings.managers})},manager.jar)).status,200);
  const snapshotAt=Date.now(),periods=usagePeriods(snapshotAt,vpnSettings.settings.vpnTimeZone);
  const meterSample={kind:'snapshot',sourceId:vpnSettings.settings.vpnSourceId,observedAt:snapshotAt,timeZone:vpnSettings.settings.vpnTimeZone,billing:vpnSettings.settings.vpnBilling,daily:{...periods.daily,usedBytes:'950'},monthly:{...periods.monthly,usedBytes:'1000'}};
  await writeFile(join(config.dataPath,'telemetry/vpn-snapshot.json'),JSON.stringify(meterSample),{mode:0o600});
  storage.vpn.observe(meterSample,storage.readSettings().revision);
  const vpnPublic=(await json('/transfer-api/v1/session',ordinary.jar)).body.policy;
  assert.equal(vpnPublic.vpn.reason,'FT_VPN_DAILY');assert.equal(vpnPublic.vpn.daily.remainingBytes,'0');assert.equal(vpnPublic.links.find(x=>x.id==='lan-direct').available,true);
  assert.ok(vpnPublic.links.filter(x=>x.id!=='lan-direct').every(x=>!x.available));
  for(const field of ['sourceId','interface','rawCounter','audit'])assert.equal(vpnPublic.vpn[field],undefined);
  const vpnPrivate=await json(vpnPath,manager.jar);assert.equal(vpnPrivate.body.sourceId,meterSample.sourceId);assert.match(vpnPrivate.response.headers.get('cache-control'),/no-store/);
  passed('real session exposes exhausted VPN totals without private counter details and leaves verified LAN available');
  assert.equal((await call(vpnWritePath,{...writeOptions,body:JSON.stringify({revision:0,dailyBytes:'0',monthlyBytes:'0'})},manager.jar)).status,409);
  assert.equal((await call(vpnWritePath,{...writeOptions,body:JSON.stringify({revision:storage.readSettings().revision,dailyBytes:'0',monthlyBytes:'0'})},manager.jar)).status,422);
  const reconcileBody={revision:storage.readSettings().revision,observedAt:snapshotAt,confirm:false};
  assert.equal((await call(vpnPath+'/reconcile',{...writeOptions,body:JSON.stringify(reconcileBody)},manager.jar)).status,409);
  assert.equal((await call(vpnPath+'/reconcile',{...writeOptions,body:JSON.stringify({...reconcileBody,confirm:true})},manager.jar)).status,200);
  assert.equal((await json(vpnPath,manager.jar)).body.daily.usedBytes,'950');
  passed('VPN mutations reject old revisions, incompatible calibration and missing reconciliation consent without clearing observed traffic');
  const ticketPath='/transfer-api/v1/pairing-ticket';
  const ticketOptions = {method:'PUT',headers:{'content-type':'application/json',origin:trustedOrigin,'x-csrf-token':ordinary.session.csrfToken},body:JSON.stringify({role:'send'})};
  assert.equal((await call(ticketPath,{...ticketOptions,headers:{'content-type':'application/json',origin:trustedOrigin}},ordinary.jar)).status,403);
  assert.equal((await call(ticketPath,{...ticketOptions,headers:{...ticketOptions.headers,origin:'https://foreign.invalid'}},ordinary.jar)).status,403);
  assert.equal((await call(ticketPath,{...ticketOptions,headers:{'content-type':'application/json',origin:trustedOrigin}})).status,403);
  const minted=await json(ticketPath,ordinary.jar,ticketOptions);assert.equal(minted.response.status,200,JSON.stringify(minted.body));
  passed('pairing ticket uses real live teacher identity and rejects guest access, missing CSRF and cross-origin writes');
  const ws=new WebSocket(origin.replace('http:','ws:')+'/transfer-api/v1/signal',{origin:trustedOrigin,headers:{host:new URL(trustedOrigin).host}});
  const wsMessages=[];let wsError;ws.on('message',data=>wsMessages.push(JSON.parse(data.toString())));ws.on('error',e=>{wsError=e});
  async function wsNext(){const deadline=Date.now()+5000;while(!wsMessages.length){if(wsError)throw wsError;if(Date.now()>deadline)throw Error('Host WebSocket response timeout; state='+ws.readyState);await new Promise(ok=>setTimeout(ok,10))}return wsMessages.shift()}
  try {
    await new Promise((ok,fail)=>{ws.once('open',ok);ws.once('error',fail)});ws.send(JSON.stringify({type:'auth',ticket:minted.body.ticket}));assert.equal((await wsNext()).type,'authenticated');
    ws.send(JSON.stringify({type:'create',note:'Host bridge test',summary:{files:1,directories:0,totalBytes:'1',maxFileBytes:'1',manifestHash:'b'.repeat(64)}}));assert.equal((await wsNext()).type,'created');
    const reserved=await json('/transfer-api/v1/session',ordinary.jar);assert.equal(reserved.body.policy.usage.personal.daily.reservedBytes,'1');assert.equal(reserved.body.policy.accessReasons.send,'FT_QUOTA_DAILY');
    const otherLogin=await login('demo_user_08');const sameAccount=await json('/transfer-api/v1/session',otherLogin.jar);assert.equal(sameAccount.body.policy.usage.personal.daily.reservedBytes,'1');assert.equal(sameAccount.body.policy.usage.personal.daily.remainingBytes,'0');passed('personal reservation is visible through the real host and persists across a second login');
    const fresh=await json(ticketPath,ordinary.jar,ticketOptions);assert.equal(fresh.response.status,200);ws.send(JSON.stringify({type:'renew',ticket:fresh.body.ticket}));assert.equal((await wsNext()).type,'authenticated');
    ws.send(JSON.stringify({type:'cancel'}));assert.equal((await wsNext()).reason,'FT_CANCELLED');
  } finally {ws.terminate()}
  assert.equal((await json('/transfer-api/v1/session',ordinary.jar)).body.policy.usage.personal.daily.remainingBytes,'1');
  passed('production Nuxt WebSocket route forwards bounded signals to the independent service, supports renewal and cancels the pair');
  const guestSettings=storage.readSettings();guestSettings.settings.rules[0].send=true;guestSettings.settings.rules[0].dailyBytes='1';guestSettings.settings.guestDailyBytes='1';guestSettings.settings.guestMonthlyBytes='2';
  assert.equal((await call(settingsPath,{...writeOptions,body:JSON.stringify({revision:guestSettings.revision,settings:guestSettings.settings,managers:guestSettings.managers})},manager.jar)).status,200);
  const guestJar=new Map();const guestOptions={method:'PUT',headers:{'content-type':'application/json',origin:trustedOrigin,'x-forwarded-proto':'https'},body:JSON.stringify({role:'send'})};
  assert.equal((await call(ticketPath,{...guestOptions,headers:{...guestOptions.headers,origin:'https://foreign.invalid'}},guestJar)).status,403);
  assert.equal((await call(ticketPath,{...guestOptions,headers:{...guestOptions.headers,'sec-fetch-site':'cross-site'}},guestJar)).status,403);
  const guestTicket=await json(ticketPath,guestJar,guestOptions);assert.equal(guestTicket.response.status,200,JSON.stringify(guestTicket.body));const cookie=guestTicket.response.headers.getSetCookie().find(x=>x.startsWith('ft_guest_v1='));assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=Strict/i);assert.match(cookie,/Path=\/transfer-api/i);assert.ok(!cookie.includes('Domain='));
  const guestId=readGuestCookie(keyPair.publicKey,guestJar.get('ft_guest_v1'));assert.ok(guestId);assert.equal((await json('/transfer-api/v1/session',guestJar)).body.policy.usage.established,true);assert.equal((await call('/transfer-api/v1/admin/overview',{},guestJar)).status,401);passed('anonymous ticket creates a signed HttpOnly, Secure, same-site scoped cookie without granting account privileges');
  async function signalFor(ticket){const socket=new WebSocket(origin.replace('http:','ws:')+'/transfer-api/v1/signal',{origin:trustedOrigin,headers:{host:new URL(trustedOrigin).host}});const messages=[];let problem;socket.on('message',d=>messages.push(JSON.parse(d.toString())));socket.on('error',e=>{problem=e});const next=async()=>{const end=Date.now()+5000;while(!messages.length){if(problem)throw problem;if(Date.now()>end)throw Error('guest signal timeout');await new Promise(ok=>setTimeout(ok,10))}return messages.shift()};await new Promise((ok,fail)=>{socket.once('open',ok);socket.once('error',fail)});socket.send(JSON.stringify({type:'auth',ticket}));assert.equal((await next()).type,'authenticated');return{socket,next,send:value=>socket.send(JSON.stringify(value))}}
  const g=await signalFor(guestTicket.body.ticket);let otherGuest;
  try {
    g.send({type:'create',note:'',summary:{files:1,directories:0,totalBytes:'1',maxFileBytes:'1',manifestHash:'c'.repeat(64)}});assert.equal((await g.next()).type,'created');
    const guestView=await json('/transfer-api/v1/session',guestJar);assert.equal(guestView.body.policy.usage.personal.daily.reservedBytes,'1');assert.equal(guestView.body.policy.usage.guestPool.daily.remainingBytes,'0');assert.equal(guestView.body.user,null);
    const renewed=await json(ticketPath,guestJar,guestOptions);assert.equal(renewed.response.status,200);assert.equal(readGuestCookie(keyPair.publicKey,guestJar.get('ft_guest_v1')),guestId);g.send({type:'renew',ticket:renewed.body.ticket});assert.equal((await g.next()).type,'authenticated');
    assert.equal((await call(ticketPath,{...guestOptions,body:JSON.stringify({role:'receive'})},guestJar)).status,403);passed('guest direction policy is separate, reservations are private and cookie-based renewal retains the same identity');
    const otherJar=new Map();const other=await json(ticketPath,otherJar,guestOptions);assert.equal(other.response.status,200);assert.notEqual(readGuestCookie(keyPair.publicKey,otherJar.get('ft_guest_v1')),guestId);otherGuest=await signalFor(other.body.ticket);otherGuest.send({type:'create',note:'',summary:{files:1,directories:0,totalBytes:'1',maxFileBytes:'1',manifestHash:'d'.repeat(64)}});assert.equal((await otherGuest.next()).code,'FT_GUEST_POOL_DAILY');passed('another anonymous identity is blocked by the shared guest allowance before publishing a receive code');
    g.send({type:'cancel'});assert.equal((await g.next()).reason,'FT_CANCELLED');assert.equal((await json('/transfer-api/v1/session',otherJar)).body.policy.usage.guestPool.daily.remainingBytes,'1');
  } finally {g.socket.terminate();otherGuest?.socket.terminate()}
  const shareAdmin='/transfer-api/v1/admin/shares',shareAdminAction=shareAdmin+'/action';
  assert.equal((await call(shareAdmin)).status,401);assert.equal((await call(shareAdmin,{},ordinary.jar)).status,403);assert.equal((await call(shareAdmin,{},manager.jar)).status,200);
  assert.equal((await call(shareAdminAction,{method:'PUT',headers:{'content-type':'application/json',origin:trustedOrigin},body:'{"action":"cleanup"}'},manager.jar)).status,403);
  passed('new temporary-share management endpoints preserve live role, same-origin and CSRF boundaries');
  const networkSettings=storage.readSettings();Object.assign(networkSettings.settings,{relayEnabled:true,shareEnabled:true,serverVpnPath:'confirmed-vpn',serverOutsideVerified:false,vpnProtectionMode:'estimate',vpnDailyBytes:'50000000',vpnMonthlyBytes:'100000000',vpnReserveBytes:'1000',wanRateKbps:null,checkpointMiB:1,automaticRetries:0});Object.assign(networkSettings.settings.rules[1],{links:['lan-direct','wan-direct','server-relay','temporary-share'],dailyBytes:'100000000',monthlyBytes:'200000000'});
  assert.equal((await call(settingsPath,{...writeOptions,body:JSON.stringify({revision:networkSettings.revision,settings:networkSettings.settings,managers:networkSettings.managers})},manager.jar)).status,200);
  const liveAt=Date.now(),livePeriods=usagePeriods(liveAt,networkSettings.settings.vpnTimeZone),liveSample={...meterSample,observedAt:liveAt,daily:{...livePeriods.daily,usedBytes:'1000'},monthly:{...livePeriods.monthly,usedBytes:'2000'}};
  await writeFile(join(config.dataPath,'telemetry/vpn-snapshot.json'),JSON.stringify(liveSample),{mode:0o600});storage.vpn.observe(liveSample,storage.readSettings().revision);
  async function waitState(fn,details){const until=Date.now()+8000;while(!fn()){if(Date.now()>until)throw Error('Host transfer timeout: '+details());await new Promise(ok=>setTimeout(ok,10))}}
  const controlledPeers=[],controlledSockets=[];
  function controlledClient(account){const received=[];let saved=false;const scope={isSecureContext:true,crypto:globalThis.crypto,location:{href:trustedOrigin+'/zh/transfer'},WebSocket:class{constructor(){const ws=new WebSocket(origin.replace('http:','ws:')+'/transfer-api/v1/signal',{origin:trustedOrigin,headers:{host:new URL(trustedOrigin).host}});controlledSockets.push(ws);return ws}},showSaveFilePicker:async()=>({name:'host-received.bin',getFile:async()=>new File([Buffer.concat(received)],'host-received.bin'),createWritable:async({keepExistingData=false}={})=>{let data=keepExistingData?Buffer.concat(received):Buffer.alloc(0),position=0;return{seek:async n=>{position=n},truncate:async n=>{const next=Buffer.alloc(n);data.copy(next,0,0,n);data=next},write:async bytes=>{if(position+bytes.length>data.length){const next=Buffer.alloc(position+bytes.length);data.copy(next);data=next}Buffer.from(bytes).copy(data,position);position+=bytes.length},close:async()=>{received.length=0;received.push(Buffer.from(data));saved=true},abort:async()=>{}}}})};
    const peer=new DirectPeer({scope,ticket:async(role,transport)=>{const r=await json(ticketPath,account.jar,{method:'PUT',headers:{'content-type':'application/json',origin:trustedOrigin,'x-csrf-token':account.session.csrfToken},body:JSON.stringify({role,transport})});if(r.response.status!==200)throw {code:r.body.error?.code||'FT_PROTOCOL'};return r.body}});controlledPeers.push(peer);return{peer,received,saved:()=>saved};}
  try{
    const a=controlledClient(ordinary),b=controlledClient(manager),bytes=Buffer.from(Array.from({length:48001},(_,i)=>i%251));const details=()=>JSON.stringify({a:a.peer.state,b:b.peer.state});
    await a.peer.create(collectFiles([new File([bytes],'host.bin')]),'host relay',null,'server-relay');await waitState(()=>['waiting-peer','error'].includes(a.peer.state.status),details);assert.equal(a.peer.state.status,'waiting-peer',details());await b.peer.join(a.peer.state.link);await waitState(()=>a.peer.state.status==='confirm'&&b.peer.state.status==='confirm',details);a.peer.confirm();b.peer.confirm();await waitState(()=>b.peer.state.status==='ready-save'||a.peer.state.status==='error'||b.peer.state.status==='error',details);assert.equal(b.peer.state.status,'ready-save',details());await b.peer.save('file');await waitState(()=>a.peer.state.status==='complete'&&b.peer.state.status==='complete',details);assert.deepEqual(Buffer.concat(b.received),bytes);assert.ok(b.saved());assert.ok(BigInt(storage.vpn.view().pendingBytes)>0n);
    passed('actual production Nuxt WebSocket bridge carries bounded relay file bytes with VPN preallocation and receiver integrity checks');
    await a.peer.create(collectFiles([new File(['stored by host bridge'],'later.txt')]),'host stored',null,'temporary-share');await waitState(()=>['shared','error'].includes(a.peer.state.status),details);assert.equal(a.peer.state.status,'shared',details());const shareInfo=a.peer.state.share,link=a.peer.state.link;a.peer.stop();
    const c=controlledClient(manager);await c.peer.join(link);await waitState(()=>['share-preview','error'].includes(c.peer.state.status),()=>JSON.stringify(c.peer.state));assert.equal(c.peer.state.status,'share-preview');c.peer.claimShare();await waitState(()=>['ready-save','error'].includes(c.peer.state.status),()=>JSON.stringify(c.peer.state));assert.equal(c.peer.state.status,'ready-save',JSON.stringify(c.peer.state));await c.peer.save('file');await waitState(()=>c.peer.state.status==='complete',()=>JSON.stringify(c.peer.state));assert.equal(Buffer.concat(c.received).toString(),'stored by host bridge');assert.equal(storage.shares.list().items[0].downloads,1);
    passed('temporary files upload through the production bridge, survive the sender disconnecting and download later under a claim limit');
    const recoverSend=controlledClient(ordinary),recoverReceive=controlledClient(manager),recoverBytes=Buffer.from(Array.from({length:1400001},(_,i)=>i%251));const recoveryDetails=()=>JSON.stringify({a:recoverSend.peer.state,b:recoverReceive.peer.state});
    const beforeQuota=storage.usage.snapshot({kind:'user',uid:manager.session.user.uid,roleId:manager.session.user.roleId},storage.readSettings().settings).personal.daily.usedBytes;
    await recoverSend.peer.create(collectFiles([new File([recoverBytes],'recover.bin')]),'host recovery',null,'server-relay');await waitState(()=>recoverSend.peer.state.status==='waiting-peer',recoveryDetails);await recoverReceive.peer.join(recoverSend.peer.state.link);await waitState(()=>recoverSend.peer.state.status==='confirm'&&recoverReceive.peer.state.status==='confirm',recoveryDetails);recoverSend.peer.confirm();recoverReceive.peer.confirm();await waitState(()=>recoverReceive.peer.state.status==='ready-save',recoveryDetails);
    let once=true;const commit=recoverReceive.peer.checkpoint.bind(recoverReceive.peer);recoverReceive.peer.checkpoint=async point=>{await commit(point);if(once&&point.fileIndex===0&&point.bytes!=='0'){once=false;recoverReceive.peer.pause()}};await recoverReceive.peer.save('file');await waitState(()=>recoverSend.peer.state.status==='paused'&&recoverReceive.peer.state.status==='paused',recoveryDetails);assert.ok(BigInt(recoverReceive.peer.recovery.point.bytes)>=1048576n);await Promise.all([recoverSend.peer.resume(),recoverReceive.peer.resume()]);await waitState(()=>recoverReceive.peer.state.status==='complete'&&recoverSend.peer.state.status==='complete',recoveryDetails);assert.deepEqual(Buffer.concat(recoverReceive.received),recoverBytes);
    const afterQuota=storage.usage.snapshot({kind:'user',uid:manager.session.user.uid,roleId:manager.session.user.roleId},storage.readSettings().settings).personal.daily.usedBytes;assert.equal(BigInt(afterQuota)-BigInt(beforeQuota),BigInt(recoverBytes.length));passed('production teacher proxy resumes a committed file checkpoint under fresh identity tickets without charging the personal task twice');
    const overview=await json(shareAdmin,manager.jar);assert.equal(overview.body.count,1);assert.ok(!JSON.stringify(overview.body).includes(shareInfo.token));assert.match(overview.response.headers.get('cache-control'),/no-store/);
    const ownAction='/transfer-api/v1/share-action';assert.equal((await call(ownAction,{...writeOptions,body:JSON.stringify({id:shareInfo.id})},manager.jar)).status,403);
    const ownerOptions={method:'PUT',headers:{'content-type':'application/json',origin:trustedOrigin,'x-csrf-token':ordinary.session.csrfToken},body:JSON.stringify({id:shareInfo.id})};assert.equal((await call(ownAction,ownerOptions,ordinary.jar)).status,200);assert.equal((await call(ownAction,{...ownerOptions,body:'null'},ordinary.jar)).status,422);
    const cleaned=await json(shareAdminAction,manager.jar,{...writeOptions,body:'{"action":"cleanup"}'});assert.equal(cleaned.response.status,200);assert.equal(cleaned.body.removed,1);assert.equal(cleaned.body.count,0);
    passed('private share links stay out of management lists; only the owner can use owner revocation, and authorized cleanup removes revoked files');
  }finally{controlledPeers.forEach(p=>p.stop());controlledSockets.forEach(s=>s.terminate())}
  storage.setManager(manager.session.user.uid, false); assert.equal((await call('/transfer-api/v1/admin/overview', {}, manager.jar)).status, 403);
  storage.setManager(manager.session.user.uid, true);
  passed('tool grant revocation takes effect on the next live request');
  const savedCookies = new Map(manager.jar);
  const logout = await call('/api/v1/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', origin: trustedOrigin, 'x-csrf-token': manager.session.csrfToken }, body: '{}' }, manager.jar);
  assert.equal(logout.status, 200); assert.equal((await call('/transfer-api/v1/admin/overview', {}, savedCookies)).status, 401);
  passed('logout invalidates old browser cookies for tool management immediately');
  const again = await login('demo_admin');
  db.prepare("UPDATE auth_users SET status='disabled' WHERE uid=?").run(again.session.user.uid);
  assert.equal((await call('/transfer-api/v1/admin/overview', {}, again.jar)).status, 401);
  db.prepare("UPDATE auth_users SET status='active' WHERE uid=?").run(again.session.user.uid);
  passed('disabled teacher account cannot continue using its previously authorized tool session');
  db.prepare("UPDATE auth_users SET role_uid='role:demo-content-editor' WHERE uid=?").run(ordinary.session.user.uid);
  result = await json('/transfer-api/v1/session', ordinary.jar);
  assert.equal(result.body.user.roleId, 'role:demo-content-editor'); assert.deepEqual(result.body.permissions, []);
  passed('role changes are read afresh; role elevation alone does not grant tool management');
  const forced = await login('demo_user_02'); storage.setManager(forced.session.user.uid, true);
  assert.equal((await call('/transfer-api/v1/admin/overview', {}, forced.jar)).status, 403);
  passed('forced password replacement blocks tool management despite an explicit UID grant');
  await service.close();
  assert.equal((await call('/transfer-api/v1/session')).status, 503);
  assert.equal((await call('/zh/transfer')).status, 200); assert.equal((await call('/zh')).status, 200);
  passed('tool outage is contained: tool page and teacher homepage remain accessible');
  for (const locale of ['zh', 'en']) for (const route of ['team','research','publications','projects','patents','courses','students','news']) {
    const response = await call(`/${locale}/${route}`); assert.equal(response.status, 200);
    const doc = new window.DOMParser().parseFromString(await response.text(), 'text/html');
    assert.equal(doc.querySelectorAll('.public-header').length, 1);
    assert.equal(doc.querySelectorAll('.public-footer').length, 1);
  }
  passed('tool outage leaves all eight teacher content routes in both languages with one navigation and footer');
  service = createService({ ...config, port: serviceAddress.port }); await service.listen();
  const recoveredSession = await json('/transfer-api/v1/session', ordinary.jar);
  assert.equal(recoveredSession.response.status, 200); assert.equal(recoveredSession.body.user.uid, ordinary.session.user.uid);
  assert.equal((await call('/en/transfer')).status, 200);
  passed('restarting the independent tool restores the existing teacher proxy and live identity without restarting the teacher');

  assert.ok(!serverLog.includes('Failed to resolve component: FileTransfer'));
  assert.ok(!serverLog.includes(signingKey));
  const resultPath = join(report, 'host-http.json');
  await writeFile(resultPath, JSON.stringify({ passed: checks.length, checks, browserExecuted: false, windowsExecuted: false }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, report: 'reports/step10/host-http.json' }));
} catch (error) {
  await writeFile(join(report, 'host-http-failure.txt'), `${error.stack}\n${serverLog.replaceAll(signingKey, '[redacted]').replaceAll(password, '[redacted]')}`);
  throw error;
} finally {
  storage?.close(); await service?.close(); db?.close();
  if (teacherProcess && teacherProcess.exitCode === null && teacherProcess.signalCode === null) { teacherProcess.kill('SIGTERM'); await exited; }
  await window.happyDOM.close(); await rm(directory, { recursive: true, force: true });
}
