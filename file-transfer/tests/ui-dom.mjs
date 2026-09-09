// Real Vue component interaction in happy-dom; no browser or layout engine is run.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { PROJECT_ROOT } from '../server/config.mjs';
import { defaultSettings, publicPolicy } from '../shared/settings.mjs';
const host = resolve(process.argv[2] || join(PROJECT_ROOT, '../academic-cms'));
const require = createRequire(join(host, 'package.json'));
const { Window } = require('happy-dom');
const window = new Window({ url: 'https://cms.example.invalid/transfer-admin/' });
for (const key of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Document', 'ShadowRoot', 'location', 'history', 'Event', 'MouseEvent', 'localStorage']) Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true });
const vue = require('vue'); const { parse, compileScript } = require('vue/compiler-sfc'); const ts = require('typescript');
const { ref, reactive, createApp, h, nextTick } = vue;
const report = join(PROJECT_ROOT, 'reports/step10'); await mkdir(report, { recursive: true });
const temp = await mkdtemp(join(report, 'dom-'));
const checks = []; const pass = value => checks.push(value);
let app;
const sessions = { session: ref(null), pending: ref(false), error: ref(''), refresh: async () => {}, auth: { session: ref({ authenticated: true, csrfToken: 'test-only' }), logout: async () => { sessions.session.value = { authenticated: false, user: null, permissions: [] }; } } };
const nuxtApp = {};
const route = reactive({ path: '/zh/transfer', fullPath: '/zh/transfer', query: {} }); const state = new Map();
globalThis.__ftVue = vue; globalThis.__ftSession = sessions;
globalThis.__ftImports = { ...vue, useRuntimeConfig: () => ({public:{fileTransfer:{}}}), useHead: () => {}, useRoute: () => route, useNuxtApp: () => nuxtApp, useRouter: () => ({ replace: value => { route.path = value.path; route.query = value.query; return Promise.resolve(); } }), useState: (key, factory) => { if (!state.has(key)) state.set(key, ref(factory())); return state.get(key); } };
async function compile(relative, name) {
  const source = await readFile(join(PROJECT_ROOT, relative), 'utf8');
  let code;
  if (relative.endsWith('.vue')) {
    const { descriptor } = parse(source, { filename: relative });
    code = compileScript(descriptor, { id: name, inlineTemplate: true, genDefaultAs: 'component' }).content + '\nexport default component;\n';
  } else code = source;
  code = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  code = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"](vue|#imports)['"];?/g, (_, names, mod) => `const {${names.replace(/\s+as\s+/g, ':')}} = globalThis.${mod === 'vue' ? '__ftVue' : '__ftImports'};`);
  code = code.replace(/import\s*\{\s*useTransferSession\s*\}\s*from\s*['"][^'"]+['"];?/, 'const useTransferSession = () => globalThis.__ftSession;');
  code = code.replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g, (_, quote, path) => {
    const target = path.endsWith('AccountsAdmin.vue') ? join(temp,'accounts-admin.mjs') : path.endsWith('ShareAdmin.vue') ? join(temp,'share-admin.mjs') : path.endsWith('VpnStatus.vue') ? join(temp, 'vpn-status.mjs') : path.endsWith('VpnAdmin.vue') ? join(temp, 'vpn-admin.mjs') : path.endsWith('SettingField.vue') ? join(temp, 'field.mjs') : path.endsWith('PairWorkspace.vue') ? join(temp, 'pair.mjs') : path.endsWith('useDirectTransfer') ? join(temp, 'direct-state.mjs') : path.endsWith('FileWorkspace.vue') ? join(temp, 'workspace.mjs') : path.endsWith('useTransferFiles') ? join(temp, 'files-state.mjs') : resolve(PROJECT_ROOT, relative, '..', path);
    return 'from ' + JSON.stringify(pathToFileURL(target).href);
  });
  await writeFile(join(temp, name + '.mjs'), code);
  const module = await import(pathToFileURL(join(temp, name + '.mjs')).href);
  return relative.endsWith('.vue') ? module.default : module;
}
async function settle() { await nextTick(); await new Promise(ok => setTimeout(ok, 0)); await nextTick(); }
async function mount(component) {
  app?.unmount(); document.body.innerHTML = '<div id="app"></div>';
  app = createApp(component); app.component('NuxtLink', { props: ['to'], setup: (_props, { slots }) => () => h('a', {}, slots.default?.()) }); app.mount('#app'); await settle();
}
async function input(id, value) { const el = document.getElementById(id); assert.ok(el, id); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); await settle(); }
async function clickText(text) { const el = [...document.querySelectorAll('button')].find(e => e.textContent.includes(text)); assert.ok(el, text); el.click(); await settle(); }
async function submit() { document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle(); }
const manager = { authenticated: true, user: { uid: 'manager:one', name: 'Demo Manager' }, permissions: ['transfer.manage'] };
let server = { revision: 1, settings: defaultSettings(), managers: ['manager:one'], updatedAt: '2026-09-07', updatedBy: 'initial', audit: [] };
let vpnState = null, vpnWrite = null, sharesServer=null, shareWrite=null;
let reads = 0; let writes = 0; let fail = ''; let lastBody;
globalThis.$fetch = async (_url, options = {}) => {
  if (_url==='/transfer-api/v1/admin/shares') return structuredClone(sharesServer);
  if (_url==='/transfer-api/v1/share-action'||_url==='/transfer-api/v1/admin/shares/action'){assert.equal(options.headers['x-csrf-token'],'test-only');shareWrite={url:_url,body:structuredClone(options.body)};if(options.body.action==='revoke')sharesServer.items[0].state='revoked';return {...structuredClone(sharesServer),removed:1,failed:0};}
  if (_url==='/transfer-api/v1/admin/vpn') return structuredClone(vpnState);
  if (_url.startsWith('/transfer-api/v1/admin/vpn/')) { assert.equal(options.headers['x-csrf-token'],'test-only'); vpnWrite={url:_url,body:structuredClone(options.body)}; return structuredClone(vpnState); }
  if (options.method !== 'PUT') { reads++; return structuredClone(server); }
  writes++; lastBody = options.body;
  if (fail) throw { data: { error: { code: fail }, fields: fail === 'FT_VALIDATION' ? { lanRateKbps: 'invalid' } : {} } };
  assert.equal(options.headers['x-csrf-token'], 'test-only');
  server = { ...server, ...structuredClone(options.body), revision: server.revision + 1 }; return structuredClone(server);
};
try {
  await compile('web/components/AccountsAdmin.vue','accounts-admin');
  await compile('web/components/ShareAdmin.vue','share-admin');
  await compile('web/components/VpnStatus.vue', 'vpn-status');
  await compile('web/components/VpnAdmin.vue', 'vpn-admin');
  await compile('web/components/SettingField.vue', 'field');
  const fileState = await compile('web/composables/useTransferFiles.ts', 'files-state');
  await compile('web/components/FileWorkspace.vue', 'workspace');
  const directState = await compile('web/composables/useDirectTransfer.ts', 'direct-state');
  await compile('web/components/PairWorkspace.vue', 'pair');
  const Admin = await compile('web/admin/index.vue', 'admin'); const Public = await compile('web/public/transfer.vue', 'public');
  await mount(Admin); sessions.session.value = structuredClone(manager); await settle();
  assert.ok(document.getElementById('ft-lanRateKbps'));assert.ok(document.getElementById('ft-lanNetworks'));assert.ok(document.getElementById('ft-lanVerified')); assert.equal(reads, 1); pass('admin renders all eight anchored sections and loads settings');
  assert.equal(document.querySelectorAll('section[id^="ft-section-"]').length, 8);
  assert.ok(document.getElementById('ft-personalTimeZone'));assert.ok(document.getElementById('ft-guestDailyBytes'));assert.ok(document.body.textContent.includes('清除 Cookie'));pass('single admin page includes personal reset timezone, shared guest caps and effective rate explanations');
  await input('ft-lanRateKbps', '4321');
  sessions.session.value = structuredClone(manager); await settle(); assert.equal(reads, 1); assert.equal(document.getElementById('ft-lanRateKbps').value, '4321'); pass('session polling does not overwrite an unsaved edit');
  sessions.session.value = null; sessions.error.value = 'offline'; await settle(); assert.equal(document.getElementById('ft-lanRateKbps').value, '4321');
  sessions.error.value = ''; sessions.session.value = structuredClone(manager); await settle(); assert.equal(reads, 1); pass('transient service failure retains draft and recovery does not reload it');
  fail = 'FT_SAVE_FAILED'; await submit(); assert.equal(writes, 1); assert.equal(document.getElementById('ft-lanRateKbps').value, '4321'); pass('failed save retains all draft values');
  fail = 'FT_CONFLICT'; await submit(); assert.equal(document.getElementById('ft-lanRateKbps').value, '4321'); assert.ok(document.body.textContent.includes('其他管理员')); pass('conflict is explicit and never replaces the draft automatically');
  fail = ''; await submit(); assert.equal(lastBody.settings.lanRateKbps, 4321); assert.ok(document.body.textContent.includes('已保存')); pass('valid form sends CSRF token and stores the normalized setting');
  await input('ft-vpnDailyBytes', '1.000000001'); await submit(); assert.equal(lastBody.settings.vpnDailyBytes, '1000000001'); pass('GB field submits exact byte counts without floating-point rounding');
  await input('ft-lanRateKbps', '-2'); const before = writes; await submit(); assert.equal(writes, before); assert.equal(document.activeElement.id, 'ft-lanRateKbps'); pass('invalid field is focused and never submitted');
  await clickText('恢复默认到草稿'); assert.equal(document.getElementById('ft-lanRateKbps').value, ''); assert.equal(writes, before); assert.equal(document.getElementById('ft-managers').value, 'manager:one'); pass('draft defaults preserve management grants and do not write until saved');
  sessions.session.value = { authenticated: true, user: { uid: 'ordinary', name: 'Other User' }, permissions: [] }; await settle(); assert.equal(document.querySelector('form'), null); assert.ok(!document.body.textContent.includes('manager:one')); pass('confirmed account change removes the previous manager draft');
  sessions.session.value = null; await mount(Public);
  await input('ft-send-note', '资料 folder');
  const field = document.querySelector('input[type=file]:not([webkitdirectory])');
  const selections = [new File(['alpha'], '中文.txt', { lastModified: 1700000000000 }), new File([], 'empty.bin', { lastModified: 1700000000000 })];
  Object.defineProperty(field, 'files', { value: selections, configurable: true }); field.dispatchEvent(new Event('change', { bubbles: true })); await settle();
  assert.equal(document.querySelectorAll('.ft-file-list li').length, 2); assert.ok(document.body.textContent.includes('中文.txt')); assert.ok(document.body.textContent.includes('5 B')); pass('file input builds a real manifest with names, byte sizes and zero-byte files');
  await clickText('预览接收与保存（本机）'); assert.equal(route.query.mode, 'receive'); assert.ok(document.body.textContent.includes('本机预览')); assert.equal(document.querySelectorAll('.ft-file-list li').length, 2); pass('local receive preview contains the actual selected files and is labelled as local');
  await input('ft-receive-code', 'abc-123'); await clickText('发送'); assert.equal(document.querySelectorAll('.ft-file-list li').length, 2); await clickText('接收'); assert.equal(document.getElementById('ft-receive-code').value, 'abc-123'); pass('send/receive switching retains files, notes, snapshot and receive code');
  route.path = '/en/transfer'; await mount(Public); assert.equal(document.getElementById('ft-receive-code').value, 'abc-123'); assert.equal(document.querySelectorAll('.ft-file-list li').length, 2); assert.ok(document.body.textContent.includes('Local preview')); pass('language remount retains file handles in the same Nuxt app without useState serialization');
  const workspace = fileState.useTransferFiles();
  const sourceBefore = workspace.collection.value;
  await workspace.addFiles([new File(['bad'], 'CON.txt')]); await settle(); assert.equal(workspace.collection.value, sourceBefore); assert.ok(document.body.textContent.includes('Rename this file')); pass('unsafe selection reports a useful error and preserves the previous collection');
  const idsBefore = [...state.keys()]; assert.ok(!JSON.stringify(idsBefore).includes('files')); assert.ok([...state.values()].every(v => !JSON.stringify(v.value).includes('中文.txt'))); pass('file objects and names are absent from Nuxt hydration state');
  let urls = []; const oldURL = URL.createObjectURL; const oldRevoke = URL.revokeObjectURL; const oldTimeout = globalThis.setTimeout;
  URL.createObjectURL = blob => { urls.push(blob); return 'blob:ft-local-test'; }; URL.revokeObjectURL = () => {};
  globalThis.setTimeout = (callback, delay, ...args) => delay === 60000 ? 0 : oldTimeout(callback, delay, ...args);
  const stopDownload = event => { if (event.target.tagName === 'A' && event.target.download) event.preventDefault(); }; document.addEventListener('click', stopDownload);
  try {
    await clickText('Download ZIP'); for (let i = 0; workspace.busy.value && i < 20; i++) await settle();
    assert.equal(urls.length, 1); assert.equal(urls[0].type, 'application/zip'); assert.ok(document.body.textContent.includes('Download requested')); assert.equal(document.querySelector('progress'), null); pass('ZIP button produces actual bytes and reports browser download request without claiming disk completion');
  } finally { URL.createObjectURL = oldURL; URL.revokeObjectURL = oldRevoke; globalThis.setTimeout = oldTimeout; document.removeEventListener('click', stopDownload); }
  assert.ok([...document.querySelectorAll('.ft-empty button')].filter(e => /Send ·|Connect to sender/.test(e.textContent)).every(e => e.disabled)); assert.ok(document.body.textContent.includes('Local preparation')); pass('unverified or unsupported network actions stay disabled while local preparation works');
  await clickText('Send'); await workspace.addFiles(Array.from({ length: 150 }, (_, i) => new File(['x'], `item-${i}.txt`))); await settle();
  assert.equal(document.querySelectorAll('.ft-file-list li').length, 100); await clickText('Show next 100'); assert.equal(document.querySelectorAll('.ft-file-list li').length, 152); pass('file list initially renders 100 entries and progressively reveals the remainder');
  workspace.clear(); assert.equal(workspace.collection.value.sources.size, 0); assert.equal(workspace.preview.value, null); pass('clearing the selection releases both file lists and preview references');
  const direct=directState.useDirectTransfer(async()=>{throw Error('No network expected')});
  route.query.mode='send';direct.peer.update({status:'waiting-peer',role:'send',code:'23456ABCDE',link:'https://cms.example.invalid/en/transfer?mode=receive#receive=23456ABCDE'});await settle();
  assert.ok(document.querySelector('.ft-pair-code img').src.startsWith('data:image/gif;base64,'));assert.ok(document.querySelector('.ft-share-link').value.includes('#receive='));pass('pairing view generates a local QR image and a manually copyable fragment link');
  const sent=[];direct.peer.socket={readyState:1,send:text=>sent.push(JSON.parse(text)),close(){}};direct.peer.update({status:'confirm',name:'Receiver <script>'});await settle();assert.ok(document.body.textContent.includes('Receiver <script>'));assert.equal(document.querySelector('.ft-confirm script'),null);await clickText('Confirm pairing');assert.equal(sent[0].type,'confirm');assert.equal(direct.state.value.status,'waiting-confirmation');pass('confirmation shows escaped peer text and sends an explicit confirmation');
  await clickText('Cancel and disconnect');assert.equal(sent.at(-1).type,'cancel');assert.equal(direct.state.value.status,'cancelled');pass('cancel action closes the current pairing and retains file preparation separately');
  let intersection;globalThis.IntersectionObserver=class{constructor(callback){intersection=callback}observe(){}disconnect(){}};
  const manifest={version:1,entries:Array.from({length:151},(_,i)=>({relativePath:'remote-'+i,kind:'file',sizeBytes:'1',modifiedAt:null}))};
  direct.peer.update({status:'ready-save',role:'receive',code:'',link:'',manifest,summary:{files:151,directories:0,totalBytes:'151',maxFileBytes:'1',manifestHash:'a'.repeat(64)}});route.query.mode='receive';await settle();assert.equal(document.querySelectorAll('.ft-remote-list li').length,100);intersection([{isIntersecting:true}]);await settle();assert.equal(document.querySelectorAll('.ft-remote-list li').length,151);assert.ok(document.body.textContent.includes('Receive as ZIP'));pass('incoming manifest reveals 100 entries at a time on intersection and offers streaming or bounded export');
  direct.peer.update({status:'error',error:'FT_LAN_ADDRESS_HIDDEN'});await settle();assert.ok(document.body.textContent.includes('did not expose an allowed LAN address'));pass('unknown LAN address displays a useful explanation instead of switching to a remote path');
  const configured={...defaultSettings(),enabled:true,lanVerified:true,lanNetworks:'192.168.1.0/24'};
  const who={kind:'user',uid:'ordinary',roleId:'staff',mustChangePassword:false};
  const period={limitBytes:'10',usedBytes:'7',reservedBytes:'3',remainingBytes:'0',resetAt:Date.parse('2026-09-08T16:00:00Z')};
  const usage={established:true,basis:'authorized-task-send-plus-receive',timeZone:'Asia/Shanghai',personal:{activeTasks:1,concurrency:2,daily:period,monthly:{...period,limitBytes:'20',remainingBytes:'10'}},guestPool:null};
  sessions.session.value={authenticated:true,user:{uid:'ordinary',name:'Ordinary'},permissions:[],policy:publicPolicy(configured,who,usage)};
  direct.peer.update({status:'idle',error:'',manifest:null});await settle();
  assert.ok(document.body.textContent.includes('daily allowance is insufficient'));assert.ok(document.querySelector('.ft-allowance').textContent.includes('Charged 7 B'));assert.ok(document.querySelector('.ft-allowance').textContent.includes('Reserved 3 B'));assert.ok(document.querySelector('.ft-allowance').textContent.includes('Asia/Shanghai'));pass('personal allowance shows charged, reserved, remaining and timezone reset, with a translated blocking reason');
  let refreshed=0;sessions.refresh=async()=>{refreshed++};await mount(Public);await clickText('Refresh allowance');assert.equal(refreshed,1);pass('explicit allowance refresh is wired to the existing session reader');
  const rate=document.querySelector('.ft-task-rate input');rate.value='0';rate.dispatchEvent(new Event('input',{bubbles:true}));await settle();assert.equal(rate.getAttribute('aria-invalid'),'true');rate.value='300';rate.dispatchEvent(new Event('input',{bubbles:true}));await settle();assert.equal(rate.getAttribute('aria-invalid'),'false');pass('per-task speed input rejects zero and accepts a lower positive rate');
  route.path='/zh/transfer';await settle();assert.ok(document.querySelector('.ft-allowance').textContent.includes('今日剩余'));assert.ok(document.body.textContent.includes('今日个人额度不足'));pass('quota cards and limits switch to Chinese without losing the current values');
  const vpnPeriod={usedBytes:'1000000001',limitBytes:'2000000000',safetyBytes:'100000000',reservedBytes:'0',pendingBytes:'0',remainingBytes:'899999999',resetAt:Date.parse('2026-09-08T16:00:00Z')};
  vpnState={mode:'strict',source:'interface',unit:'GB',timeZone:'Asia/Shanghai',billing:'both',observedAt:Date.now(),estimated:true,hardLimitAvailable:false,meterAvailable:true,activeReservations:0,pendingBytes:'0',reservedBytes:'0',warning:true,reason:'FT_VPN_DAILY',eligibleForControlledTransfer:false,daily:vpnPeriod,monthly:vpnPeriod,audit:[]};
  sessions.session.value.policy=publicPolicy(configured,who,usage,vpnState);await settle();
  assert.ok(document.querySelector('.ft-vpn-status').textContent.includes('1.000000001 GB'));assert.ok(document.querySelector('.ft-vpn-status').textContent.includes('今日 VPN 可用额度'));assert.ok(document.querySelector('.ft-vpn-status').textContent.includes('已核验不经过'));pass('public VPN card shows exact observed usage, translated quota reason and the separate verified LAN policy');
  sessions.session.value=structuredClone(manager);await mount(Admin);
  assert.ok(document.getElementById('ft-vpnProtectionMode'));assert.ok(document.getElementById('ft-vpnMeterSource'));assert.equal(document.querySelectorAll('form').length,1);
  const unit=document.getElementById('ft-vpnBudgetUnit');const exact=document.getElementById('ft-vpnDailyBytes').value;unit.value='GiB';unit.dispatchEvent(new Event('change',{bubbles:true}));await settle();unit.value='GB';unit.dispatchEvent(new Event('change',{bubbles:true}));await settle();assert.equal(document.getElementById('ft-vpnDailyBytes').value,exact);await submit();assert.equal(lastBody.settings.vpnDailyBytes,'1000000001');pass('same admin page exposes metering controls and GB/GiB round trip preserves the exact budget');
  await input('ft-vpn-day-used','1.000000001');await input('ft-vpn-month-used','2');await clickText('保存已用量并校准');assert.deepEqual(vpnWrite.body,{revision:server.revision,dailyBytes:'1000000001',monthlyBytes:'2000000000'});pass('usage calibration submits exact bytes and the current revision through CSRF-protected mutation');
  vpnState.pendingBytes='50';vpnState.activeReservations=1;await clickText('刷新出口数据');const reconcile=()=>[...document.querySelectorAll('button')].find(e=>e.textContent.includes('对账已结束预留'));assert.equal(reconcile().disabled,true);document.querySelector('.ft-vpn-reconcile input').click();await settle();assert.equal(reconcile().disabled,true);vpnState.activeReservations=0;await clickText('刷新出口数据');assert.equal(reconcile().disabled,false);await clickText('对账已结束预留');assert.deepEqual(vpnWrite.body,{revision:server.revision,observedAt:vpnState.observedAt,confirm:true});assert.equal(reconcile().disabled,true);pass('reconciliation requires confirmation and no active windows and clears confirmation after completion');
  await input('ft-lanRateKbps','999');assert.ok(document.body.textContent.includes('请先保存本页配置'));assert.equal(document.getElementById('ft-vpn-day-used').disabled,true);sessions.session.value={authenticated:false,user:null,permissions:[]};await settle();assert.equal(document.querySelector('.ft-vpn-admin'),null);pass('unsaved policy disables calibration and account loss removes private meter controls');
  Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});
  const networkSettings={...configured,relayEnabled:true,shareEnabled:true,serverVpnPath:'confirmed-outside-vpn',serverOutsideVerified:true};networkSettings.rules[1].links=['lan-direct','wan-direct','server-relay','temporary-share'];
  sessions.session.value={authenticated:true,user:{uid:'ordinary',name:'Ordinary'},permissions:[],policy:publicPolicy(networkSettings,who,null,vpnState)};
  route.path='/zh/transfer';route.query.mode='send';direct.peer.update({status:'idle',error:'',manifest:null,share:null});await mount(Public);await workspace.addFiles([new File(['one'],'one.txt')]);await settle();
  let transportSelect=document.getElementById('ft-transport');assert.equal(transportSelect.options.length,4);assert.equal(transportSelect.value,'lan-direct');transportSelect.value='server-relay';transportSelect.dispatchEvent(new Event('change',{bubbles:true}));await settle();let chosen;
  const createOriginal=direct.peer.create,joinOriginal=direct.peer.join,claimOriginal=direct.peer.claimShare;direct.peer.create=async(...args)=>{chosen=args};await clickText('生成接收码');assert.equal(chosen[3],'server-relay');assert.ok(document.body.textContent.includes('UDP 不可用'));pass('connection selector defaults to LAN and starts a permitted relay without requiring WebRTC');
  route.query.mode='receive';await settle();const temporaryLink='https://cms.example.invalid/zh/transfer?mode=receive#share='+'a'.repeat(43);await input('ft-receive-code',temporaryLink);assert.equal(document.getElementById('ft-transport').value,'temporary-share');direct.peer.join=async(...args)=>{chosen=args};await clickText('查看分享');assert.equal(chosen[0],temporaryLink);assert.equal(chosen[2],'temporary-share');pass('pasted temporary links select the matching receive mode and view the share before claiming');
  const shareInfo={id:'share-fixture',expiresAt:Date.now()+60000,maxDownloads:3,downloads:1};direct.peer.update({status:'share-preview',transport:'temporary-share',summary:{files:1,directories:0,totalBytes:'3',maxFileBytes:'3',manifestHash:'a'.repeat(64)},note:'<script>escaped</script>',share:shareInfo});await settle();assert.ok(document.body.textContent.includes('剩余领取次数：2'));assert.equal(document.querySelector('.ft-confirm script'),null);let claimed=0;direct.peer.claimShare=()=>{claimed++};await clickText('确认领取');assert.equal(claimed,1);pass('retrieval confirmation shows expiry, remaining count and escaped note before the explicit claim');
  direct.peer.update({status:'shared',share:shareInfo,link:temporaryLink});await settle();await clickText('撤销此分享');assert.equal(shareWrite.url,'/transfer-api/v1/share-action');assert.deepEqual(shareWrite.body,{id:'share-fixture'});assert.equal(document.querySelector('.ft-confirm .ft-share-link'),null);pass('uploader can revoke the completed share through a CSRF-protected ownership action');
  direct.peer.create=createOriginal;direct.peer.join=joinOriginal;direct.peer.claimShare=claimOriginal;direct.peer.stop();
  sharesServer={items:[{...shareInfo,note:'暂存 <script>',state:'ready',summary:{files:1,totalBytes:'3'}}],count:1,reservedBytes:'300000',limitBytes:'1000000'};
  sessions.session.value=structuredClone(manager);await mount(Admin);assert.ok(document.getElementById('ft-wanNetworks'));assert.ok(document.getElementById('ft-serverVpnPath'));assert.equal(document.querySelector('.ft-stored-list script'),null);document.querySelector('.ft-stored-list button').click();await settle();assert.deepEqual(shareWrite.body,{action:'revoke',id:'share-fixture'});await clickText('清理到期及已撤销内容');assert.deepEqual(shareWrite.body,{action:'cleanup'});assert.ok(document.body.textContent.includes('本次清理 1 项'));pass('same admin page manages stored shares, revocation and cleanup with CSRF and no private links');
  await input('ft-lanRateKbps','234');assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent.includes('清理到期及已撤销内容')).disabled,true);sessions.session.value={authenticated:false,user:null,permissions:[]};await settle();assert.equal(document.querySelector('.ft-share-admin'),null);pass('unsaved configuration prevents maintenance actions and account loss removes stored-share details');
  sessions.session.value=structuredClone(manager);await mount(Admin);assert.equal(document.getElementById('ft-recoveryHours').value,'24');assert.equal(document.getElementById('ft-checkpointMiB').value,'4');assert.equal(document.getElementById('ft-automaticRetries').value,'3');assert.equal(document.querySelectorAll('form').length,1);pass('recovery lifetime, checkpoint size and retry controls remain in the single settings form');
  route.path='/zh/transfer';route.query.mode='send';sessions.session.value={authenticated:true,user:{uid:'ordinary',name:'Ordinary'},permissions:[],policy:publicPolicy(networkSettings,who,null,vpnState)};direct.peer.recovery=null;direct.peer.update({status:'idle',recovery:null,history:[]});await mount(Public);assert.equal(document.getElementById('ft-remember-recovery').checked,false);assert.ok(document.body.textContent.includes('不保存文件正文'));pass('device recovery history is opt-in and explains what is retained');
  document.getElementById('ft-remember-recovery').click();await settle();const cp={fileIndex:0,offset:'0',bytes:'0',chain:'0'.repeat(64),root:'0'.repeat(64),chunkBytes:16336},info={task:'ui-recovery',token:'z'.repeat(43),transport:'server-relay',point:cp,summary:{files:1,directories:0,totalBytes:'3',maxFileBytes:'3',manifestHash:'a'.repeat(64)},expiresAt:Date.now()+60000,checkpointMiB:4,automaticRetries:3};direct.peer.update({role:'send',status:'transferring',transport:'server-relay'});direct.peer.setRecovery(info);await settle();assert.equal(direct.state.value.recoverySaved,true);assert.ok(localStorage.getItem('file-transfer:recovery:v1').includes('ui-recovery'));await clickText('暂停任务');assert.equal(direct.state.value.status,'paused');assert.ok(document.body.textContent.includes('不重复计入个人额度'));assert.equal(document.getElementById('ft-transport'),null);pass('pause retains a committed checkpoint and keeps the original task separate from new transfers');
  let resumed;const resumeOriginal=direct.peer.resume;direct.peer.resume=async(...args)=>{resumed=args};await clickText('恢复同一任务');assert.ok(resumed[0].manifest.entries.length);assert.equal(resumed[1],null);direct.peer.resume=resumeOriginal;pass('resume reuses the chosen source bundle without creating a new transfer');
  direct.peer.update({status:'retrying',retryCount:2});await settle();assert.ok(document.body.textContent.includes('2 / 3'));await clickText('停止自动重试');assert.equal(direct.state.value.status,'paused');pass('automatic retry shows its attempt limit and can be stopped');
  sessions.session.value={authenticated:true,user:{uid:'another',name:'Another'},permissions:[],policy:publicPolicy(networkSettings,{...who,uid:'another'},null,vpnState)};await settle();assert.equal(direct.state.value.recovery,null);assert.equal(document.querySelector('.ft-recovery-history'),null);assert.ok(localStorage.getItem('file-transfer:recovery:v1').includes('ui-recovery'));sessions.session.value={authenticated:true,user:{uid:'ordinary',name:'Ordinary'},permissions:[],policy:publicPolicy(networkSettings,who,null,vpnState)};await settle();assert.ok(document.querySelector('.ft-recovery-history'));await clickText('移除此机记录');assert.ok(!localStorage.getItem('file-transfer:recovery:v1').includes('ui-recovery'));pass('switching accounts hides the previous history and local removal does not expose another identity');
  direct.peer.update({status:'transferring',progress:{bytes:'2',totalBytes:'3',path:'one.txt'},speedBytes:200,etaSeconds:1});await settle();assert.ok(document.body.textContent.includes('200 B/s'));assert.ok(document.body.textContent.includes('预计剩余：1 s'));direct.peer.stop();direct.peer.update({status:'idle'});pass('progress shows measured speed and estimated remaining time without layout dependencies');
  delete globalThis.IntersectionObserver;direct.peer.stop();
  await writeFile(join(report, 'ui-dom.json'), JSON.stringify({ passed: checks.length, checks, realVueComponents: true, browserExecuted: false, layoutEngineExecuted: false }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, report: 'reports/step10/ui-dom.json' }));
} catch (error) { console.error('Completed checks:', checks); console.error(error); process.exitCode = 1; } finally { try { app?.unmount(); } catch {} await window.happyDOM.close(); await rm(temp, { recursive: true, force: true }); }
