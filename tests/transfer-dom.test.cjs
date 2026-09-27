/* Server-rendered transfer settings and the real controller in a simulated DOM. */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');const project=path.resolve(__dirname,'..');
const html=execFileSync(process.env.TEST_PYTHON||'python3',['-B','-c',`
import sys,tempfile
from pathlib import Path
sys.path.insert(0,'tests')
from test_transfer_step5 import setup
with tempfile.TemporaryDirectory() as directory:
    fixture=setup.__wrapped__(Path(directory));client,*_=next(fixture)
    print(client.get('/admin').text)
    try:next(fixture)
    except StopIteration:pass
`],{cwd:project,encoding:'utf8'});
async function runtime({fail=false,confirm=true}={}){
 const dom=new JSDOM(html),document=dom.window.document,writes=[];let release,reads=0;
 const pending=new Promise(resolve=>release=resolve);const context=vm.createContext({document,URLSearchParams,Intl,confirm:()=>confirm});
 const module=new vm.SourceTextModule(fs.readFileSync(path.join(project,'transfer/frontend/native/settings.js'),'utf8'),{context});await module.link(()=>{throw Error('Unexpected import')});await module.evaluate();
 const usage=Object.fromEntries(['daily','weekly','monthly'].map(k=>[k,{charged_and_reserved:5,limit:10,remaining:5}]));
 module.namespace.mountSettings({api:async(url,data)=>{writes.push({url,data});await pending;if(fail)throw Error('设置已变化');return {revision:1}},request:async()=>{reads++;return {total:usage,identity:usage,scope:'<img src=x>',timeZone:'UTC'}},loadUsage(){}});
 await new Promise(resolve=>setImmediate(resolve));
 return {dom,document,writes,release,get reads(){return reads},close(){dom.window.close()}};
}
test('settings saves weekly and custom rules; pending save locks inputs and updates revision',async t=>{
 const r=await runtime();t.after(()=>r.close());const d=r.document;d.querySelector('#totalWeeklyBytes').value='1024';d.querySelector('#add-rule').click();const row=d.querySelector('[data-rule]');row.querySelector('[data-rule-field=id]').value='user-1';row.querySelector('[data-rule-field=weeklyBytes]').value='512';d.querySelector('#save-settings').click();
 assert.equal(r.writes.length,1);assert.equal(r.writes[0].data.totalWeeklyBytes,'1024');assert.equal(r.writes[0].data.customRules[0].weeklyBytes,'512');assert.equal(d.querySelector('#totalWeeklyBytes').disabled,true);
 r.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(d.querySelector('#save-settings').dataset.revision,'1');assert.equal(d.querySelector('#totalWeeklyBytes').disabled,false);
 assert.equal(d.querySelectorAll('#admin-usage tr').length,6);assert.equal(d.querySelector('#admin-usage img'),null);
});
test('version conflict preserves draft and revision',async t=>{
 const r=await runtime({fail:true});t.after(()=>r.close());const d=r.document;d.querySelector('#totalWeeklyBytes').value='321';d.querySelector('#save-settings').click();r.release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(d.querySelector('#totalWeeklyBytes').value,'321');assert.equal(d.querySelector('#save-settings').dataset.revision,'0');assert.match(d.querySelector('#settings-feedback').textContent,/草稿已保留/);
});
test('invalid rules cannot save and cancellation keeps the rule',async t=>{
 const r=await runtime({confirm:false});t.after(()=>r.close());const d=r.document;d.querySelector('#add-rule').click();d.querySelector('#save-settings').click();assert.equal(r.writes.length,0);d.querySelector('[data-remove-rule]').click();assert.equal(d.querySelectorAll('[data-rule]').length,1);
});
test('rule removal stays local until explicit save',async t=>{
 const r=await runtime();t.after(()=>r.close());const d=r.document;d.querySelector('#add-rule').click();d.querySelector('[data-remove-rule]').click();assert.equal(d.querySelectorAll('[data-rule]').length,0);assert.equal(r.writes.length,0);
});
