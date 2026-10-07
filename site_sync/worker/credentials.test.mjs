import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSecret} from './credentials.mjs';
import {dispatch} from './native_dispatch.mjs';
const record=key=>JSON.stringify({version:1,key,revision:'r',updated_at:'now',updated_by:'admin'});
test('database overrides env, rotation is immediate and corrupt DB never falls back',async()=>{
 let value=null,calls=0;
 const env={TEACHER_SYNC_KEY:'ab'.repeat(32),DB:{prepare:()=>({bind:()=>({first:async()=>{calls++;return value===null?null:{value};}})})}};
 assert.equal((await resolveSecret(env))[0],0xab);
 value=record('cd'.repeat(32));assert.equal((await resolveSecret(env))[0],0xcd);
 value=record('ef'.repeat(32));assert.equal((await resolveSecret(env))[0],0xef);
 value='broken';await assert.rejects(resolveSecret(env),e=>e.kind==='credential');
 value=JSON.stringify({version:true,key:'cd'.repeat(32),revision:'r',updated_at:'now',updated_by:'admin'});
 await assert.rejects(resolveSecret(env),e=>e.kind==='credential');
 assert.equal(calls,5);
});
test('native RPC uses DB credential and reports retry without secret',async()=>{
 const env={DB:{prepare:()=>({bind:()=>({first:async()=>({value:record('cd'.repeat(32))})})})}};
 const old=globalThis.fetch;let signatures=[];
 globalThis.fetch=async(u,o)=>{signatures.push(o.headers['x-sync-signature']);return new Response('',{status:403});};
 try{
 const r=JSON.parse(await dispatch(env,'read',JSON.stringify({peer:{origin:'https://peer.invalid',secret_ref:'env:TEACHER_SYNC_KEY'},request:{kind:'candidates',version:'catalog-v1'}})));
 assert.equal(r.kind,'credential');assert.equal(r.http_status,403);assert.equal(signatures.length,1);
 assert.ok(!JSON.stringify(r).includes('cd'.repeat(32)));
 }finally{globalThis.fetch=old;}
});
