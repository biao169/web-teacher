const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
test('public author rendering reuses real matcher, highlights only corresponding names, and never inserts markup',async t=>{
 const dom=new JSDOM('<html lang="en"><body><span data-public-authors data-authors="Ada; Bob; &lt;script&gt;X&lt;/script&gt;" data-corresponding="bob"></span></body></html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());
 const context=vm.createContext({document:dom.window.document}),modules=new Map();
 function moduleFor(name){if(modules.has(name))return modules.get(name);const folder=name==='public-authors.js'?'public':'admin';const module=new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../frontend',folder,'static/js',name),'utf8'),{context});modules.set(name,module);return module;}
 const main=moduleFor('public-authors.js');await main.link(spec=>moduleFor(path.basename(spec.split('?')[0])));await main.evaluate();
 const host=dom.window.document.querySelector('[data-public-authors]');assert.equal(host.querySelector('strong').textContent,'Bob*');assert.equal(host.querySelector('sup').title,'Corresponding author');assert.equal(host.querySelector('script'),null);assert.match(host.textContent,/<script>X<\/script>/);
 host.dataset.corresponding='Ada';dom.window.document.dispatchEvent(new dom.window.CustomEvent('public:appended',{bubbles:true}));assert.equal(host.querySelector('strong').textContent,'Ada*');assert.equal(host.dataset.authors,'Ada; Bob; <script>X</script>');
});

test('citation emphasis preserves every original character, escapes markup, and skips partial names',async t=>{
 const dom=new JSDOM('<html lang="zh"><body></body></html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());
 const host=dom.window.document.createElement('p');host.setAttribute('data-citation-highlight','Li;Wei Li;<script>');host.textContent='  Wei Li, Liu.\n<script>literal</script>  ';dom.window.document.body.append(host);const original=host.textContent;
 const context=vm.createContext({document:dom.window.document}),modules=new Map();
 function moduleFor(name){if(modules.has(name))return modules.get(name);const folder=name==='public-authors.js'?'public':'admin';const module=new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../frontend',folder,'static/js',name),'utf8'),{context});modules.set(name,module);return module;}
 const main=moduleFor('public-authors.js');await main.link(spec=>moduleFor(path.basename(spec.split('?')[0])));await main.evaluate();
 assert.equal(host.textContent,original);assert.equal(host.querySelector('script'),null);assert.equal(host.querySelector('strong').textContent,'Wei Li');assert.equal([...host.querySelectorAll('strong')].some(x=>x.textContent==='Liu'),false);
 dom.window.document.dispatchEvent(new dom.window.CustomEvent('public:appended',{bubbles:true}));assert.equal(host.textContent,original);assert.equal(host.querySelector('strong strong'),null);
});

for(const lang of ['zh','en'])test('corresponding names split at CRLF/semicolon and retain both commas: '+lang,async t=>{
 const dom=new JSDOM('<html lang="'+lang+'"><body><span data-public-authors></span></body></html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const host=dom.window.document.querySelector('span');host.dataset.authors='Smith, John\r\n王，明；Not marked';host.dataset.corresponding='Smith, John;王，明';
 const context=vm.createContext({document:dom.window.document}),modules=new Map();
 function moduleFor(name){if(modules.has(name))return modules.get(name);const folder=name==='public-authors.js'?'public':'admin';const module=new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../frontend',folder,'static/js',name),'utf8'),{context});modules.set(name,module);return module;}
 const main=moduleFor('public-authors.js');await main.link(spec=>moduleFor(path.basename(spec.split('?')[0])));await main.evaluate();
 assert.deepEqual([...host.querySelectorAll('strong')].map(n=>n.textContent),['Smith, John*','王，明*']);assert.equal(host.querySelectorAll('sup').length,2);assert.equal(host.querySelector('sup').title,lang==='en'?'Corresponding author':'通讯作者');assert.match(host.textContent,/Not marked/);
 dom.window.document.dispatchEvent(new dom.window.CustomEvent('public:appended',{bubbles:true}));assert.equal(host.querySelectorAll('sup').length,2);
});
