const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const read=name=>fs.readFileSync(path.join(__dirname,'../frontend',name),'utf8');
function editor(t,{saved='',original='2026-09-29T07:30:00.123Z'}={}){
 const d=new JSDOM(`<form><div data-zoned-time data-original="${original}"><input type="datetime-local" step=".001" data-time-input value="2026-09-29T15:30:00.123"><input data-time-zone value="Asia/Shanghai"><label data-time-fold-label><select data-time-fold><option value=""></option><option value="0">First</option><option value="1">Second</option></select></label><small data-time-status></small></div></form>`,{url:'https://site.test',runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;if(saved)w.localStorage.setItem('teacher-admin-timezone-v1',saved);w.eval(read('admin/static/js/native-time.js'));const $=q=>w.document.querySelector(q);return {w,$,change:zone=>{ $('[data-time-zone]').value=zone;$('[data-time-zone]').dispatchEvent(new w.Event('change'));}};
}
test('zone switching preserves instant and milliseconds; preference survives reload',t=>{
 const f=editor(t);assert.equal(f.$('[data-time-input]').value,'2026-09-29T15:30:00.123');f.change('UTC');assert.equal(f.$('[data-time-input]').value,'2026-09-29T07:30:00.123');assert.equal(f.w.localStorage.getItem('teacher-admin-timezone-v1'),'UTC');f.change('America/New_York');assert.equal(f.$('[data-time-input]').value,'2026-09-29T03:30:00.123');
 const again=editor(t,{saved:'America/New_York'});assert.equal(again.$('[data-time-input]').value,'2026-09-29T03:30:00.123');
});
test('DST gap blocks save and repeated time needs a choice',t=>{
 const f=editor(t,{saved:'America/New_York'}),input=f.$('[data-time-input]');input.value='2026-03-08T02:30';input.dispatchEvent(new f.w.Event('input'));assert.equal(input.checkValidity(),false);
 input.value='2026-11-01T01:30';input.dispatchEvent(new f.w.Event('input'));assert.equal(f.$('[data-time-fold-label]').hidden,false);assert.equal(f.$('[data-time-fold]').checkValidity(),false);
 f.$('[data-time-fold]').value='1';f.$('[data-time-fold]').dispatchEvent(new f.w.Event('change'));f.change('UTC');assert.match(input.value,/2026-11-01T06:30/);
});
test('existing later repeated time round trips and invalid preference falls back',t=>{
 const f=editor(t,{saved:'America/New_York',original:'2026-11-01T06:30:00.000Z'});assert.equal(f.$('[data-time-fold]').value,'1');f.change('bad/zone');assert.equal(f.$('[data-time-zone]').value,'America/New_York');
 const other=editor(t,{saved:'bad/zone'});assert.equal(other.$('[data-time-zone]').value,'Asia/Shanghai');
});
test('public time uses browser zone on first paint and appended cards, leaves raw UTC and dates alone',t=>{
 const d=new JSDOM('<body class="section-public"><time data-local-time datetime="2026-01-01T00:30:00.000Z">fallback</time><time data-local-time datetime="2026-01-01">Date only</time><div id="more"></div></body>',{runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;
 w.Intl={DateTimeFormat:function(lang,opts){return new Intl.DateTimeFormat(lang,{...opts,timeZone:opts.timeZone||'America/New_York'});}};
 w.eval(read('shared/static/js/public-time.js'));const first=w.document.querySelector('time');assert.match(first.textContent,/2025/);assert.match(first.textContent,/19:30/);assert.equal(first.getAttribute('datetime'),'2026-01-01T00:30:00.000Z');assert.equal(first.title,'America/New_York');assert.equal(w.document.querySelectorAll('time')[1].textContent,'Date only');
 const more=w.document.querySelector('#more');more.innerHTML='<time data-local-time datetime="2026-07-01T00:30:00Z">fallback</time>';more.dispatchEvent(new w.CustomEvent('public:appended',{bubbles:true}));assert.match(more.textContent,/20:30/);
});
