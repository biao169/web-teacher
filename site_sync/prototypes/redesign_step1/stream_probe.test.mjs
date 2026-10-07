import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {forwardPart, completeFile, PART_BYTES} from './stream_probe.mjs';

function response(total, offset=0, {failAt=Infinity, etag='"version-1"'}={}) {
  let sent=0, pulls=0, cancelled=false;
  const length=Math.min(PART_BYTES,total-offset);
  const body=new ReadableStream({
    pull(controller) {
      pulls++;
      if(sent>=failAt) {controller.error(new Error('connection interrupted')); return;}
      if(sent===length) {controller.close();return;}
      const n=Math.min(4096,length-sent);
      controller.enqueue(new Uint8Array(n).fill(7));sent+=n;
    },
    cancel(){cancelled=true;}
  }, {highWaterMark:0});
  const res=new Response(body,{status:206,headers:{etag,
    'content-length':String(length),'content-range':`bytes ${offset}-${offset+length-1}/${total}`}});
  return {res, stats:()=>({sent,pulls,cancelled})};
}

function storage({pause=false}={}) {
  const parts=new Map(); let observed;
  return {parts, get observed(){return observed;},
    async uploadPart(number, body) {
      observed=body;
      if(pause) return {partNumber:number,etag:'unconsumed-test-stream'};
      const reader=body.getReader();let count=0;
      try {
        while(true) {
          const {done,value}=await reader.read(); if(done)break;
          assert.ok(value.byteLength<=4096);count+=value.byteLength;
        }
      } finally {reader.releaseLock();}
      // A simulated storage commit only after consuming the complete stream.
      parts.set(number,count);return {partNumber:number,etag:`fixture-${count}`};
    }
  };
}

test('minimal entry loads without a website or storage binding',async()=>{
  const res=await worker.fetch(new Request('https://probe.invalid/health'));
  assert.deepEqual(await res.json(),{prototype:true,productionSync:false});
  assert.equal((await worker.fetch(new Request('https://probe.invalid/write',{method:'POST'}))).status,404);
});

test('passes original stream to storage without eager reads',async()=>{
  const {res,stats}=response(PART_BYTES); const store=storage({pause:true});
  await forwardPart(store,res,{offset:0,total:PART_BYTES,etag:'"version-1"'});
  assert.equal(store.observed,res.body);assert.equal(stats().pulls,0);
  await res.body.cancel();
});

test('5 MiB part and final short part use bounded producer chunks',async()=>{
  const total=PART_BYTES+12345,store=storage();
  for(const offset of [0,PART_BYTES]) {
    const {res}=response(total,offset);
    await forwardPart(store,res,{offset,total,etag:'"version-1"'});
  }
  assert.deepEqual([...store.parts],[[1,PART_BYTES],[2,12345]]);
});

test('source failure does not commit a partial storage part; replay replaces same part',async()=>{
  const store=storage();
  const failed=response(PART_BYTES,0,{failAt:16384});
  await assert.rejects(forwardPart(store,failed.res,{offset:0,total:PART_BYTES,etag:'"version-1"'}));
  assert.equal(store.parts.size,0);
  for(let retry=0;retry<2;retry++)
    await forwardPart(store,response(PART_BYTES).res,{offset:0,total:PART_BYTES,etag:'"version-1"'});
  assert.equal(store.parts.size,1);
});

for(const kind of ['etag','range','encoding','length','alignment']) {
  test(`rejects ${kind} mismatch before storage and cancels body`,async()=>{
    const {res,stats}=response(PART_BYTES);let called=false;
    const options={offset:0,total:PART_BYTES,etag:'"version-1"'};
    if(kind==='etag')options.etag='"version-2"';
    if(kind==='range')res.headers.set('content-range','bytes 0-1/2');
    if(kind==='encoding')res.headers.set('content-encoding','gzip');
    if(kind==='length')res.headers.set('content-length','1');
    if(kind==='alignment')options.offset=4096;
    await assert.rejects(forwardPart({uploadPart(){called=true;}},res,options));
    assert.equal(called,false);assert.equal(stats().cancelled,true);
  });
}

test('lost completion response is reconciled without completing twice',async()=>{
  let obj=null,calls=0;
  const bucket={async head(){return obj;}};
  const upload={async complete(){calls++;obj={size:42,etag:'stored',customMetadata:
    {sync_operation:'op-1',sync_source:'v1'}};throw new Error('lost response');}};
  const intent={key:'isolated/op-1',total:42,operation:'op-1',source:'v1'};
  await assert.rejects(completeFile(bucket,upload,[],intent));
  assert.equal((await completeFile(bucket,upload,[],intent)).size,42);
  assert.equal(calls,1);
});

for(const kind of ['size','owner','source']) {
  test(`completion checks ${kind} before allowing publication`,async()=>{
    const obj={size:42,etag:'stored',customMetadata:{sync_operation:'op-1',sync_source:'v1'}};
    if(kind==='size')obj.size=41;
    if(kind==='owner')obj.customMetadata.sync_operation='someone-else';
    if(kind==='source')obj.customMetadata.sync_source='v2';
    await assert.rejects(completeFile({async head(){return obj;}},
      {async complete(){throw new Error('must not complete');}},[],
      {key:'isolated/op-1',total:42,operation:'op-1',source:'v1'}));
  });
}
