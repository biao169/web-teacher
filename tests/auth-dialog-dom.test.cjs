const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const code=fs.readFileSync(path.join(__dirname,'../frontend/public/static/js/public-auth.js'),'utf8');
const content=(mode='login',message='')=>`<section data-auth-content data-lang="en" data-auth-mode="${mode}"><h1 id="auth-title">${mode}</h1><form data-auth-form action="/auth/${mode}"><input name="username" value="Ada"><input name="password" type="password" value="secret123"><input name="challenge" type="hidden" value="token"><button type="submit">Send</button></form><p data-auth-feedback tabindex="-1">${message}</p><a data-auth-switch href="/auth/${mode==='login'?'register':'login'}?lang=en">Switch</a></section>`;
function fixture(t,identity=false){const dom=new JSDOM('<html lang="en"><body><a data-auth-open href="/auth/login">Sign in</a><dialog data-auth-dialog aria-labelledby="auth-title"><button data-auth-close>Close</button><div data-auth-slot></div></dialog></body></html>',{url:'https://site.test/en/publications?q=test',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,requests=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.fetch=(url,opts)=>new Promise((resolve,reject)=>{requests.push({url:String(url),opts,resolve,reject});opts.signal.addEventListener('abort',()=>reject(new w.DOMException('Aborted','AbortError')))});if(identity){const link=w.document.querySelector('[data-auth-open]'),host=w.document.createElement('span');host.dataset.publicSession='';host.dataset.lang='en';link.replaceWith(host);host.append(link);w.eval(fs.readFileSync(path.join(__dirname,'../frontend/shared/static/js/identity-cache.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'../frontend/public/static/js/public-session.js'),'utf8'));}w.eval(code);
 return {w,requests,$:s=>w.document.querySelector(s),tick:()=>new Promise(r=>setTimeout(r,0)),respond:(i,html,ok=true)=>requests[i].resolve({ok,json:async()=>({ok:false,mode:'login',html})})};}
test('dialog requests fresh form with current return path and restores focus on close',async t=>{
 const f=fixture(t);f.$('[data-auth-open]').click();assert.equal(f.$('dialog').open,true);const url=new URL(f.requests[0].url);assert.equal(url.searchParams.get('next'),'/en/publications?q=test');assert.equal(url.searchParams.get('lang'),'en');
 f.respond(0,content());await f.tick();assert.equal(f.w.document.activeElement,f.$('[name=username]'));
 f.$('[data-auth-switch]').click();f.respond(1,content('register'));await f.tick();assert.equal(f.$('[data-auth-content]').dataset.authMode,'register');f.$('[data-auth-close]').click();assert.equal(f.$('dialog').open,false);assert.equal(f.$('[name=password]'),null);assert.equal(f.w.document.activeElement,f.$('[data-auth-open]'));
});
test('failed submission cannot double-submit, retains server account field and clears password',async t=>{
 const f=fixture(t);f.$('[data-auth-open]').click();f.respond(0,content());await f.tick();const form=f.$('form');form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(f.requests.length,2);assert.equal(f.$('[data-auth-close]').disabled,true);assert.equal(f.$('[name=username]').readOnly,true);
 const event=new f.w.Event('cancel',{cancelable:true});f.$('dialog').dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 f.respond(1,content('login','Incorrect password').replace('value="secret123"',''),false);await f.tick();assert.equal(f.$('[name=password]').value,'');assert.equal(f.$('[data-auth-close]').disabled,false);assert.equal(f.w.document.activeElement,f.$('[data-auth-feedback]'));
});
test('registration success switches to login inside the same dialog',async t=>{
 const f=fixture(t);f.$('[data-auth-open]').click();f.respond(0,content('register'));await f.tick();f.$('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));f.requests[1].resolve({ok:true,json:async()=>({ok:true,registered:true,redirect:'/auth/login?registered=1&lang=en'})});await f.tick();assert.equal(f.requests.length,3);f.respond(2,content('login','Registration complete'));await f.tick();assert.equal(f.$('dialog').open,true);assert.match(f.$('[data-auth-feedback]').textContent,/Registration complete/);
});
test('closing pending read aborts it and does not inject a late form',async t=>{
 const f=fixture(t);f.$('[data-auth-open]').click();f.$('[data-auth-close]').click();await f.tick();assert.equal(f.requests[0].opts.signal.aborted,true);assert.equal(f.$('[data-auth-slot]').children.length,0);
});

test('successful same-page login closes dialog, paints identity and defeats pending anonymous check',async t=>{
 const f=fixture(t,true);f.$('[data-auth-open]').click();f.respond(1,content());await f.tick();f.$('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
 f.requests[2].resolve({ok:true,json:async()=>({ok:true,registered:false,redirect:'/en/publications?q=test',identity:{authenticated:true,username:'Ada',display_name:'Ada Lovelace',can_enter_admin:true,checked_at:new Date().toISOString()}})});await f.tick();
 assert.equal(f.$('dialog').open,false);assert.equal(f.$('.academic-username').textContent,'Ada Lovelace');assert(f.$('a[href="/admin"]'));assert.equal(f.requests.length,3);assert(f.requests[0].opts.signal.aborted);
 f.requests[0].resolve({ok:true,json:async()=>({authenticated:false})});await f.tick();assert.equal(f.$('.academic-username').textContent,'Ada Lovelace');
 assert.equal(f.w.location.pathname,'/en/publications');assert.equal(f.$('[data-auth-feedback]'),null);assert.equal(f.w.document.activeElement,f.$('.academic-username'));
});
