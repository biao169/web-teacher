const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
async function core(origins){
 const context=vm.createContext({URL,document:{querySelector:selector=>({content:selector.includes('transfer-origins')?origins:'/transfer'})}});
 const m=new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../transfer/frontend/native/portal-core.js'),'utf8'),{context});
 await m.link(require('./helpers/transfer-modules.cjs').linker(context));await m.evaluate();return m.namespace;
}
test('configured aliases resolve to the current origin without forwarding cookies',async()=>{
 const c=await core(JSON.stringify(['https://a.example','https://b.example'])),token='a'.repeat(43);
 assert.equal(c.shareURL('https://a.example/transfer/s/'+token,'https://b.example'),'https://b.example/transfer/s/'+token);
 assert.equal(c.shareURL('/transfer/s/'+token,'https://b.example'),'https://b.example/transfer/s/'+token);
 for(const value of ['https://evil.example/transfer/s/'+token,'https://a.example.evil.test/transfer/s/'+token,'https://user@a.example/transfer/s/'+token,'https://a.example/transfer/s/'+token+'?x=1','https://a.example/transfer/s/'+token+'#x','http://a.example/transfer/s/'+token,'https://a.example/s/'+token])assert.throws(()=>c.shareURL(value,'https://b.example'));
});
test('missing or malformed allowlist preserves single origin behavior',async()=>{
 for(const value of ['', 'broken', '{}']){
  const c=await core(value),token='a'.repeat(43);
  assert.throws(()=>c.shareURL('https://a.example/transfer/s/'+token,'https://b.example'));
  assert.equal(c.shareURL('/transfer/s/'+token,'https://b.example'),'https://b.example/transfer/s/'+token);
 }
});
