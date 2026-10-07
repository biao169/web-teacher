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
  await page.locator('[data-tasks]').getByText('展开进度 / 日志',{exact:true}).first().click();await page.locator('[data-items] input').waitFor();
  assert.equal(await page.locator('[data-items] img').count(),0);assert.match(await page.locator('[data-items]').textContent(),/<img src=x/);
  await page.locator('[data-items] input').check();assert.match(await page.locator('[data-selected]').textContent(),/已选 1/);
  await page.locator('[data-confirm]').click();await page.waitForFunction(()=>document.querySelector('[data-message]').textContent.includes('已批准')&&document.querySelector('#site-sync-panel').getAttribute('aria-busy')==='false');
  await page.locator('[data-tasks]').getByText('暂停',{exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('[data-tasks]').textContent.includes('已暂停')&&document.querySelector('#site-sync-panel').getAttribute('aria-busy')==='false');
  await page.waitForFunction(()=>document.querySelector('#site-sync-panel').getAttribute('aria-busy')==='false');await page.locator('[data-settings] [name=fast_retries]').fill('0');await page.locator('[data-settings] [name=slice_bytes]').fill('4m');await page.locator('[data-settings] button').click();await page.waitForFunction(()=>document.querySelector('[data-message]').textContent.includes('设置已保存')&&document.querySelector('#site-sync-panel').getAttribute('aria-busy')==='false');
  await page.locator('[data-schedule] [name=scope]').selectOption('news');await page.locator('[data-schedule] button').first().click();await page.waitForFunction(()=>document.querySelector('[data-schedules]').textContent.includes('已停用')&&document.querySelector('#site-sync-panel').getAttribute('aria-busy')==='false');
  await page.locator('[data-schedules]').getByText('启用',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-schedules]').textContent.includes('已启用'));
  fs.mkdirSync('site_sync/docs',{recursive:true});await page.screenshot({path:'site_sync/docs/v0.16.004-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'site_sync/docs/v0.16.004-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
  await page.goto(origin+'/admin/runtime-maintenance');await page.waitForFunction(()=>document.querySelector('[data-notice]').textContent==='操作完成');
  assert.equal(await page.locator('[data-menu-key="site-sync"]').count(),1);assert.equal(await page.locator('[data-menu-key="log-maintenance"]').count(),0);
  await page.locator('[data-preview]').click();await page.waitForFunction(()=>document.querySelector('[data-preview-result]').textContent.includes('候选数量'));
  assert.deepEqual(errors,[]);
  await page.goto(origin+'/admin/site-sync');await page.waitForFunction(()=>document.querySelector('#site-sync-panel').getAttribute('aria-busy')==='false');
  await page.locator('details').filter({has:page.locator('[data-defaults]')}).locator('summary').first().click();
  await page.locator('[data-defaults] [name=slice_bytes]').fill('4m');await page.locator('[data-defaults] [name=min_slice_bytes]').fill('4KiB');await page.locator('[data-defaults] button').click();
  await page.waitForFunction(()=>document.querySelector('[data-message]').textContent.includes('站点默认参数已保存')&&document.querySelector('#site-sync-panel').getAttribute('aria-busy')==='false');
  await page.locator('details').filter({has:page.locator('[data-create]')}).locator('summary').first().click();await page.locator('[data-create] [name=scope]').selectOption('news');
  const created=page.waitForResponse(r=>r.url().endsWith('/api/tasks')&&r.request().method()==='POST');await page.locator('[data-create] button').first().click();const createdData=await (await created).json();
  assert.ok(createdData.task_id);const current=await (await page.request.get(origin+'/admin/site-sync/api/tasks/'+createdData.task_id)).json();assert.equal(current.task.initial_slice_bytes,4194304);assert.equal(current.task.min_slice_bytes,4096);
  console.log('PASS 4MiB defaults and task inheritance, maintenance page, preview, sidebar and real website browser: login, shared admin layout, CSRF, approval, pause, settings, schedule toggle, XSS text, mobile overflow; browser zone differs from UI zone');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
