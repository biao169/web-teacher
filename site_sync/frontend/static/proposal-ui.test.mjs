import test from 'node:test';
import assert from 'node:assert/strict';
import {installProposal} from './proposal-ui.mjs';
class Element{constructor(tag=''){this.tag=tag;this.children=[];this.textContent='';this.disabled=false;}append(...v){this.children.push(...v);}replaceChildren(){this.children=[];}addEventListener(k,v){this['on'+k]=v;}}
const flush=()=>new Promise(r=>setImmediate(r));
test('failed non-JSON push is visible and refresh retries same ID with receipt feedback',async()=>{
 const storage=new Map(),ids=[];let receipt=[],phase=0;
 globalThis.sessionStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 globalThis.fetch=async(url,options)=>{
  if(options.method==='GET')return Response.json({items:receipt});
  const q=JSON.parse(options.body);ids.push(q.request_id);
  if(phase++===0){receipt=[{...q,origin:'https://peer.test',status:'unknown',updated_at:1791000000}];return new Response('Error 1102',{status:503,headers:{'cf-ray':'abcdef1234567890-SIN','x-request-id':'b'.repeat(32)}});}
  const result={task_id:'a'.repeat(32),approval_required:true};receipt=[{...q,origin:'https://peer.test',status:'confirmed',updated_at:1791000000,result}];return Response.json(result);
 };
 function mount(){const button=new Element(),message=new Element(),history=new Element(),refresh=new Element();const form={querySelector:()=>message,querySelectorAll:()=>[{value:'profiles'}]};button.closest=()=>form;
  const map={'[data-proposal]':button,'[data-outgoing-proposals]':history,'[data-outgoing-refresh]':refresh,'#site-sync-panel':{dataset:{peerOrigin:'https://peer.test'}},'meta[name="csrf-token"]':{content:'test'}};
  globalThis.document={querySelector:k=>map[k],createElement:t=>new Element(t)};installProposal();return {button,message,history};
 }
 let ui=mount();await flush();await ui.button.onclick();assert.match(ui.message.textContent,/1102/);assert.match(ui.message.textContent,/bbbbbbbb/);assert.equal(ui.button.disabled,false);
 ui=mount();await flush();await ui.button.onclick();assert.equal(ids[0],ids[1]);assert.match(ui.message.textContent,/等待对端审核/);assert.match(ui.message.textContent,/aaaaaaaa/);assert.equal(storage.size,0);
 assert.ok(ui.history.children.length);
});
