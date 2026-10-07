const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom'),{load}=require('./helpers/transfer-modules.cjs');
async function setup(fetch){
 const dom=new JSDOM('<html lang="en"><body><header class="academic-header"><a data-public-language="zh" href="?lang=zh">中文</a><a data-public-language="en" href="?lang=en">EN</a></header><main data-portal><input id="file" type="file"><input id="code" value="pair-secret"><progress value="42" max="100"></progress><span id="name"></span><p id="status"></p><button data-transfer-i18n="选择文件夹">Choose folder</button><input data-transfer-i18n-placeholder="粘贴发送方提供的配对码" placeholder="Paste the pairing code from the sender"></main><p id="transfer-language-status"></p></body></html>',{url:'https://teacher.test/transfer/?folder=share-secret&lang=en'});
 const d=dom.window.document,ctx=vm.createContext({document:d,URL,fetch:fetch||(()=>{throw Error('no network')})});const m=await load(ctx,'transfer-i18n.js');return {dom,d,ctx,i18n:m.namespace};
}
test('language changes retain workspace objects, raw names and nested dynamic status',async()=>{
 const {dom,d,i18n:i}=await setup();try{
 const main=d.querySelector('main'),input=d.querySelector('#file'),handle={name:'目录'},selection={handle};main.folderSelection=selection;
 i.setText(d.querySelector('#name'),'目录');i.setText(d.querySelector('#status'),i.joinText(i.t('任务编号：'),'目录'));
 assert.equal(d.querySelector('#status').textContent,'Task ID: 目录');
 await i.setLanguage('zh',{refreshHeader:false});assert.equal(d.querySelector('#status').textContent,'任务编号：目录');assert.equal(d.querySelector('[data-transfer-i18n]').textContent,'选择文件夹');
 await i.setLanguage('en',{refreshHeader:false});assert.equal(d.querySelector('#status').textContent,'Task ID: 目录');assert.equal(d.querySelector('#name').textContent,'目录');assert.equal(d.querySelector('#file'),input);assert.equal(main.folderSelection,selection);assert.equal(d.querySelector('progress').value,42);assert.equal(d.querySelector('#code').value,'pair-secret');assert.equal(new URL(dom.window.location).searchParams.get('folder'),'share-secret');assert.match(d.cookie,/public_language=en/);assert.equal(d.documentElement.lang,'en');
 }finally{dom.window.close()}
});
test('switch while an operation is pending retains its callback, handle and completion binding',async()=>{
 const {dom,d,i18n:i}=await setup();try{let finish;const handle={written:0},pending=new Promise(resolve=>finish=resolve).then(()=>{handle.written++;i.setText(d.querySelector('#status'),i.t('已保存 {0} 个文件 · {1}',[1,'raw.txt']))});
 await i.setLanguage('zh',{refreshHeader:false});await i.setLanguage('en',{refreshHeader:false});finish();await pending;assert.equal(handle.written,1);assert.equal(d.querySelector('#status').textContent,'Saved 1 files · raw.txt');
 }finally{dom.window.close()}
});
test('only latest header response wins and no workspace is replaced',async()=>{
 const replies=[];const {dom,d,i18n:i}=await setup(url=>new Promise(resolve=>replies.push({url,resolve})));try{const main=d.querySelector('main');const a=i.setLanguage('zh'),b=i.setLanguage('en');
 replies[1].resolve({ok:true,text:async()=>'<header class="academic-header"><a data-public-language="zh">中文</a><a data-public-language="en">EN</a>latest</header><main>must not replace</main>'});await b;
 replies[0].resolve({ok:true,text:async()=>'<header class="academic-header">stale</header>'});await a;assert.match(d.querySelector('header').textContent,/latest/);assert.equal(d.querySelector('main'),main);assert.equal(replies.length,2);assert(replies.every(r=>new URL(r.url).pathname==='/transfer/'));
 }finally{dom.window.close()}
});
test('failed header refresh reports error in selected language without navigation or data loss',async()=>{
 const {dom,d,i18n:i}=await setup();try{const main=d.querySelector('main');await i.setLanguage('zh');assert.match(d.querySelector('#transfer-language-status').textContent,/导航更新失败/);assert.equal(d.querySelector('main'),main);await i.setLanguage('en');assert.match(d.querySelector('#transfer-language-status').textContent,/Navigation could not refresh/)}finally{dom.window.close()}
});
test('errors retain translatable tokens and server denials have English explanations',async()=>{
 const {dom,d,i18n:i}=await setup();try{const error=Error(i.t('请求失败（{0}）',[403]));i.setText(d.querySelector('#status'),i.errorText(error.message));await i.setLanguage('zh',{refreshHeader:false});assert.equal(d.querySelector('#status').textContent,'请求失败（403）');await i.setLanguage('en',{refreshHeader:false});assert.equal(d.querySelector('#status').textContent,'Request failed (403)');assert.equal(String(i.errorText('文件超过后台单文件大小限制')),'File exceeds the configured per-file limit');assert(!/[\u4e00-\u9fff]/.test(String(i.errorText('未来的未知错误'))))}finally{dom.window.close()}
});
test('catalog covers every literal frontend token and placeholders match',async()=>{
 const {dom,ctx}=await setup();try{const catalog=(await load(ctx,'transfer-i18n-catalog.js')).namespace.default;const root=path.join(__dirname,'../transfer/frontend/native');let count=0;
 for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.js')&&!n.startsWith('transfer-i18n'))){const source=fs.readFileSync(path.join(root,name),'utf8');for(const match of source.matchAll(/\btr\(("(?:[^"\\]|\\.)*")/g)){const key=JSON.parse(match[1]);assert(catalog[key],name+': '+key);count++}}
 assert(count>200);for(const [key,value] of Object.entries(catalog)){assert(!/[\u4e00-\u9fff]/.test(value),key);assert.deepEqual([...key.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),[...value.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),key)}
 }finally{dom.window.close()}
});
