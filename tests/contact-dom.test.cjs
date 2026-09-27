const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync(path.join(__dirname,'../frontend/public/static/js/contact.js'),'utf8');
function fixture(t){
 const dom=new JSDOM('<form data-contact-form data-lang="en" action="/en/contact"><input name="challenge" type="hidden" value="token"><input name="name" value="Ada"><input name="email"><input name="subject" value="Custom"><textarea name="content">Draft</textarea><div class="contact-actions"><button type="submit">Send</button></div><p data-contact-feedback tabindex="-1"></p></form>',{url:'https://site.test/en/contact',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,requests=[];
 w.fetch=(url,opts)=>new Promise((resolve,reject)=>requests.push({url,opts,resolve,reject}));w.eval(script);
 const $=s=>w.document.querySelector(s);return {w,$,requests,submit:()=>$('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),tick:()=>new Promise(r=>setTimeout(r,0))};
}
test('one pending submission preserves draft and supports error retry with refreshed token',async t=>{
 const f=fixture(t);f.submit();f.submit();assert.equal(f.requests.length,1);assert.equal(f.$('textarea').readOnly,true);assert.match(f.requests[0].opts.body.toString(),/subject=Custom/);
 f.requests[0].resolve({ok:false,headers:{get:()=> 'application/json'},json:async()=>({ok:false,message:'Invalid email',challenge:'new-token'})});await f.tick();
 assert.equal(f.$('textarea').value,'Draft');assert.equal(f.$('textarea').readOnly,false);assert.equal(f.$('[name=challenge]').value,'new-token');assert.equal(f.$('button').disabled,false);assert.equal(f.w.document.activeElement,f.$('[data-contact-feedback]'));
 f.submit();assert.equal(f.requests.length,2);f.requests[1].reject(Error('offline'));await f.tick();assert.match(f.$('[data-contact-feedback]').textContent,/could not be confirmed/);assert.equal(f.$('textarea').value,'Draft');
});
test('success stays in page and prevents repeated submission, offers new message link',async t=>{
 const f=fixture(t);f.submit();f.requests[0].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({ok:true,message:'Sent <b>literal</b>'})});await f.tick();f.submit();assert.equal(f.requests.length,1);assert.equal(f.$('textarea').readOnly,true);assert.equal(f.$('[data-contact-feedback] b'),null);assert.equal(f.$('.contact-actions a').href,'https://site.test/en/contact');
});
test('unexpected response does not clear draft or retry writes',async t=>{
 const f=fixture(t);f.submit();f.requests[0].resolve({ok:true,headers:{get:()=> 'text/html'}});await f.tick();assert.equal(f.$('textarea').value,'Draft');assert.equal(f.requests.length,1);assert.equal(f.$('form').hasAttribute('aria-busy'),false);
});
