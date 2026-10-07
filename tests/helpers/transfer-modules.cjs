// Node VM links the dependency graph itself; cache module objects, not link promises.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../../transfer/frontend/native');
const caches=new WeakMap();
function linker(context,overrides={}){
 let cache=caches.get(context);if(!cache){cache=new Map();caches.set(context,cache)}
 return spec=>{const name=spec.split('?')[0].replace('./','');if(overrides[name])return overrides[name];if(!cache.has(name))cache.set(name,new vm.SourceTextModule(fs.readFileSync(path.join(root,name),'utf8'),{context,identifier:name}));return cache.get(name)};
}
async function load(context,name){const get=linker(context),m=get(name);if(m.status==='unlinked')await m.link(get);if(m.status==='linked')await m.evaluate();return m}
module.exports={linker,load};
