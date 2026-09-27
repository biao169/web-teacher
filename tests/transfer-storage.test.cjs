const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('storage status is on-demand, escaped, and distinguishes disabled maintenance',async()=>{
 const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');const dom=new JSDOM('<button id="refresh-storage">刷新</button><p id="storage-status"></p>');let calls=0,fail=false;
 const context=vm.createContext({document:dom.window.document,Error});
 const dep=new vm.SyntheticModule(['request','bytes'],function(){this.setExport('bytes',n=>n+' B');this.setExport('request',async()=>{calls++;if(fail)throw Error('无法检查');return {disk_free_bytes:10,pending_upload_bytes:2,disk_reserve_bytes:1,disk_available_bytes:7,cache_reserved_bytes:2,cache_limit_bytes:20,cleanup:{enabled:false,running:true,error:'<script>not markup</script>'}}})},{context});
 const module=new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/storage-status.js'),'utf8'),{context});await module.link(()=>dep);await module.evaluate();assert.equal(calls,0);
 const button=dom.window.document.getElementById('refresh-storage'),status=dom.window.document.getElementById('storage-status');button.click();assert.ok(button.disabled);await new Promise(r=>setImmediate(r));assert.equal(button.disabled,false);assert.match(status.textContent,/已关闭/);assert.match(status.textContent,/7 B/);assert.equal(status.querySelector('script'),null);
 fail=true;button.click();await new Promise(r=>setImmediate(r));assert.equal(status.textContent,'无法检查');assert.equal(button.disabled,false);dom.window.close();
});
