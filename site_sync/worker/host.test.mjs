import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from './native_dispatch.mjs';
test('native RPC rejects huge controls',async()=>{const r=JSON.parse(await dispatch({},'read','x'.repeat(17000)));assert.equal(r.ok,false);});
test('native cleanup cannot delete published objects',async()=>{let deleted=false;const r=JSON.parse(await dispatch({MEDIA:{async delete(){deleted=true;}}},'discard',JSON.stringify({file:{operation_id:'a'.repeat(64),staging_key:'sync/'+'a'.repeat(64),status:'published'}})));assert.equal(r.ok,false);assert.equal(deleted,false);});
test('native service rejects arbitrary RPC method',async()=>{const r=JSON.parse(await dispatch({},'sql','{}'));assert.equal(r.ok,false);});
test('native read rejects media into Python bridge',async()=>{const r=JSON.parse(await dispatch({},'read',JSON.stringify({request:{kind:'media'}})));assert.equal(r.ok,false);});
