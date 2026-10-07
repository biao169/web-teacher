const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const server=spawn(process.env.PYTHON||'python3',['-m','site_sync.tests.ui_fixture'],{stdio:['ignore','pipe','pipe']});let browser;
 try{
  const info=await new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>reject(new Error('Fixture start timeout')),10000);server.stdout.on('data',d=>{buffer+=d;if(buffer.includes('\n')){clearTimeout(timer);resolve(JSON.parse(buffer.split('\n')[0]));}});server.once('exit',()=>{clearTimeout(timer);reject(new Error('Fixture exited'));});});
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'America/New_York'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+info.port);await page.locator('[data-tasks] tr').first().waitFor();
  await page.locator('[data-tasks]').getByText('展开进度 / 日志',{exact:true}).first().click();await page.locator('[data-items] input').waitFor();
  assert.equal(await page.locator('[data-items] img').count(),0);assert.match(await page.locator('[data-items]').textContent(),/<img src=x/);
  await page.locator('[data-items] input').check();assert.match(await page.locator('[data-selected]').textContent(),/已选 1/);
  await page.locator('[data-confirm]').click();await page.waitForFunction(()=>document.querySelector('[data-message]').textContent.includes('已批准'));
  await page.locator('[data-tasks]').getByText('暂停',{exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('[data-tasks]').textContent.includes('已暂停'));
  await page.locator('[data-settings] [name=fast_retries]').fill('0');await page.locator('[data-settings] [name=slice_bytes]').fill('4m');await page.locator('[data-settings] button').click();await page.waitForFunction(()=>document.querySelector('[data-message]').textContent.includes('设置已保存'));
  await page.locator('[data-schedule] [name=scope]').selectOption('news');await page.locator('[data-schedule] button').first().click();await page.waitForFunction(()=>document.querySelector('[data-schedules]').textContent.includes('已停用'));
  await page.locator('[data-schedules]').getByText('启用',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-schedules]').textContent.includes('已启用'));
  fs.mkdirSync('site_sync/docs',{recursive:true});await page.screenshot({path:'site_sync/docs/step7-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'site_sync/docs/step7-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
  console.log('PASS browser: approval, pause, settings, schedule toggle, XSS text, mobile overflow; browser zone differs from UI zone');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
