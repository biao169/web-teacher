/* Real server HTML/fragments plus the actual list scripts in one simulated page. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const root=path.join(__dirname,'..');
const fixture=JSON.parse(execFileSync(process.env.TEST_PYTHON||'python',['-B','-c',`import sys,tempfile,json
from pathlib import Path
sys.path.insert(0,'tests')
from list_fixture import client_at
from test_accounts_regression import run
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from test_public_home_step2 import add,DOM
from test_public_navigation_v88 import entry
from test_public_stream_v46 import H
with tempfile.TemporaryDirectory() as d:
 c,r=client_at(Path(d));r.auth=Auth(r.sql,r.passwords);r.content=Content(r.sql,r.auth);r.p=run(r.auth.principal(c.cookies.get('ts_session')))
 entry(r,'publications','title','限定',slug='papers')
 for i in range(14):
  uid=add(r,'publications','限定论文 '+str(i),year=2025,sort_order=i)
  run(r.sql.batch([('UPDATE publications SET citation_gbt=?,citation_apa=? WHERE uid=?',('GBT '+str(i),'APA '+str(i),uid))]))
 html=c.get('/en/n/papers').text
 stream=next(a for _,a in DOM(html).tags if 'data-public-stream' in a)
 fragment=c.get(stream['data-next'],headers=H).json()
 citations=run(r.sql.query("SELECT uid,citation_apa text FROM publications WHERE title LIKE '限定%' ORDER BY sort_order"))
 print(json.dumps({'html':html,'fragment':fragment,'citations':citations}))
 c.close()
`],{cwd:root,encoding:'utf8',maxBuffer:4e6}));
test('real fixed-entry page appends without losing selections, switches copy format and cancels on filtering',async t=>{
 const dom=new JSDOM(fixture.html,{url:'https://site.example/en/n/papers',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window,d=w.document,copied=[],requests=[];
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>copied.push(value)}});
 w.fetch=async(url,options)=>{requests.push({url,options});if(url.startsWith('/en/n/papers'))return {ok:true,headers:{get:()=> 'application/json'},json:async()=>fixture.fragment};
 const u=new URL(url,w.location.href);assert.equal(u.pathname,'/api/public/publications/citations');assert.equal(u.searchParams.get('nav'),'papers');assert(u.searchParams.get('nv'));assert.equal(u.searchParams.get('format'),'apa');
 return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({format:'apa',rows:fixture.citations.filter(row=>u.searchParams.getAll('uid').includes(row.uid))})};};
 for(const file of ['academic.js','public-stream.js','public-people.js','public-filters.js'])w.eval(fs.readFileSync(path.join(root,'frontend/public/static/js',file),'utf8'));
 const tick=()=>new Promise(r=>setTimeout(r,0));
 const all=d.querySelector('[data-person-all]');all.checked=true;all.dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('[data-person-select]:checked').length,10);
 d.querySelector('[data-load-more]').click();await tick();await tick();assert.equal(d.querySelectorAll('[data-record-id]').length,14);assert.equal(d.querySelectorAll('[data-person-select]:checked').length,10);
 const format=d.querySelector('[data-copy-format]');format.value='apa';format.dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('[data-person-select]:checked').length,10);
 d.querySelector('[data-person-copy]').click();await tick();await tick();assert.equal(copied[0],Array.from({length:10},(_,i)=>'APA '+i).join('\n\n'));assert.equal(requests.length,2);
 assert.equal(d.querySelector('[data-person-reset]').getAttribute('href'),'/en/n/papers');assert.match(d.querySelector('[data-public-language=zh]').href,/\/zh\/n\/papers$/);
 d.querySelector('[data-person-form]').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(d.querySelectorAll('[data-person-select]:checked').length,0);
});
