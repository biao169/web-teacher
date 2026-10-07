const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const server=spawn(process.env.PYTHON||'python3',['-m','site_sync.tests_website.browser_fixture'],{stdio:['ignore','pipe','pipe']});let browser;
 try{
  const info=await new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>reject(new Error('Fixture start timeout')),10000);server.stdout.on('data',d=>{buffer+=d;if(buffer.includes('\n')){clearTimeout(timer);resolve(JSON.parse(buffer.split('\n')[0]));}});server.once('exit',()=>{clearTimeout(timer);reject(new Error('Fixture exited'));});});
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'America/New_York'});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.status()>=400&&r.url().includes('site-sync'))console.error('API',r.status(),await r.text());});
  const origin='http://127.0.0.1:'+info.port;await page.goto(origin+'/auth/login');await page.locator('[name=username]').fill('admin');await page.locator('[name=password]').fill(info.password);await page.locator('[data-auth-form] button[type=submit]').click();await page.waitForURL(u=>!u.pathname.endsWith('/auth/login'));await page.goto(origin+'/admin/site-sync');await page.locator('#sync-connection').waitFor();await page.locator('[data-tasks] tr').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('#sync-credentials').getAttribute('aria-busy')==='false');
  const key=page.locator('[name=sync_key]'),notice=page.locator('[data-key-notice]');
  assert.equal(await key.inputValue(),'');assert.match(await page.locator('[data-key-status]').textContent(),/部署环境/);
  await page.locator('[data-key-generate]').click();const draft=await key.inputValue();assert.match(draft,/^[a-f0-9]{64}$/);
  assert.match(await notice.textContent(),/尚未保存/);
  assert.equal((await (await page.request.get(origin+'/api/admin/site-sync/credentials')).json()).source,'environment');
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedKey=text;}}}));
  await page.locator('[data-key-copy]').click();await page.waitForFunction(()=>document.querySelector('[data-key-notice]').textContent.includes('已复制草稿'));
  assert.equal(await page.evaluate(()=>window.copiedKey),draft);
  await page.locator('[data-key-show]').click();await page.waitForFunction(()=>document.querySelector('[name=sync_key]').type==='text');
  await page.locator('[data-key-show]').click();await page.waitForFunction(()=>document.querySelector('[name=sync_key]').type==='password');
  await page.locator('#sync-credentials [type=submit]').click();await page.waitForFunction(()=>document.querySelector('[data-key-notice]').textContent.includes('已保存并生效'));
  assert.equal(await key.inputValue(),'');assert.match(await page.locator('[data-key-status]').textContent(),/后台密钥/);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#sync-credentials').getAttribute('aria-busy')==='false');assert.equal(await key.inputValue(),'');
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedKey=text;}}}));
  await page.locator('[data-key-copy]').click();await page.waitForFunction(()=>document.querySelector('[data-key-notice]').textContent.includes('已复制当前'));
  assert.equal(await page.evaluate(()=>window.copiedKey),draft);
  await key.fill('invalid');await page.locator('#sync-credentials [type=submit]').click();await page.waitForFunction(()=>document.querySelector('[data-key-notice]').textContent.includes('64位'));
  await key.fill('AB'.repeat(32));await page.locator('#sync-credentials [type=submit]').click();await page.waitForFunction(()=>document.querySelector('[data-key-notice]').textContent.includes('已保存并生效'));
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));
  await page.locator('[data-key-copy]').click();await page.waitForFunction(()=>document.querySelector('[data-key-notice]').textContent.includes('手动复制'));assert.equal(await key.inputValue(),'ab'.repeat(32));
  await page.locator('[data-key-show]').click();await page.waitForFunction(()=>document.querySelector('[name=sync_key]').type==='password');
  const out=process.env.SYNC_SCREENSHOT_DIR||'/tmp';fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:out+'/credentials-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/credentials-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
  console.log('PASS credentials UI: draft, copy, reveal/hide, save, reload, paste, invalid input, clipboard denial, desktop/mobile; clipboard operations simulated');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
