const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync(path.join(__dirname,'../frontend/shared/static/js/reading.js'),'utf8');
const controls='<div data-reading-controls><button data-reading-choice="standard">A</button><button data-reading-choice="large">A+</button></div>';
function fixture(t,{saved=null,publicPage=true,denied=false}={}){
 const dom=new JSDOM(`<html lang="en" ${publicPage?'data-public-reading':''} data-reading="standard"><body>${controls}<input id="keep" value="AB1234"><progress value="42" max="100"></progress></body></html>`,{url:'https://teacher.test/transfer/',runScripts:'outside-only'}),w=dom.window;
 t.after(()=>w.close());if(saved!==null)w.localStorage.setItem('teacher-reading',saved);if(denied)Object.defineProperty(w,'localStorage',{get(){throw Error('blocked')}});w.eval(script);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));return {w,d:w.document};
}
test('restores saved size, changes only typography and persists new choice',t=>{
 const {w,d}=fixture(t,{saved:'large'}),input=d.querySelector('#keep'),progress=d.querySelector('progress');
 assert.equal(d.documentElement.dataset.reading,'large');assert.equal(d.querySelector('[data-reading-choice=large]').getAttribute('aria-pressed'),'true');
 d.querySelector('[data-reading-choice=standard]').click();assert.equal(w.localStorage.getItem('teacher-reading'),'standard');assert.equal(d.querySelector('#keep'),input);assert.equal(input.value,'AB1234');assert.equal(progress.value,42);
 d.querySelector('[data-reading-choice=large]').click();assert.equal(d.documentElement.dataset.reading,'large');
});
test('header replacement and language change retain preference and keyboard-native buttons',t=>{
 const {w,d}=fixture(t,{saved:'large'});d.querySelector('[data-reading-controls]').outerHTML=controls;d.documentElement.lang='zh';d.dispatchEvent(new w.Event('public-header-updated'));
 const large=d.querySelector('[data-reading-choice=large]');assert.equal(large.getAttribute('aria-pressed'),'true');assert.equal(large.getAttribute('aria-label'),'大字体');
 d.documentElement.lang='en';d.dispatchEvent(new w.Event('transfer-language-change'));assert.equal(large.getAttribute('aria-label'),'Large text');d.querySelector('[data-reading-choice=standard]').click();assert.equal(d.documentElement.dataset.reading,'standard');
});
test('denied storage still allows changes; invalid saved value is ignored',t=>{
 const {d}=fixture(t,{denied:true});d.querySelector('[data-reading-choice=large]').click();assert.equal(d.documentElement.dataset.reading,'large');assert.equal(fixture(t,{saved:'bad'}).d.documentElement.dataset.reading,'standard');assert.equal(fixture(t,{saved:'comfortable'}).d.documentElement.dataset.reading,'large');
});
test('storage changes sync tabs; public preference does not affect admin',t=>{
 const {w,d}=fixture(t);w.dispatchEvent(new w.StorageEvent('storage',{key:'teacher-reading',newValue:'large'}));assert.equal(d.documentElement.dataset.reading,'large');w.dispatchEvent(new w.StorageEvent('storage',{key:null,newValue:null}));assert.equal(d.documentElement.dataset.reading,'standard');
 const admin=fixture(t,{saved:'large',publicPage:false});admin.d.querySelector('[data-reading-choice=large]').click();assert.equal(admin.d.documentElement.dataset.reading,'standard');
});

test('cross-tab font changes notify already-open layout controls once',t=>{
 const {w,d}=fixture(t);let count=0;d.addEventListener('public-reading-change',()=>count++);w.dispatchEvent(new w.StorageEvent('storage',{key:'teacher-reading',newValue:'large'}));assert.equal(count,1);assert.equal(d.documentElement.dataset.reading,'large');
});
