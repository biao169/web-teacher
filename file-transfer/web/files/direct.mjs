import {initialPoint,validatePoint,ZERO_HASH} from '../../shared/recovery.mjs';
import {unhex,appendHash,finishRoot} from './checkpoint.mjs';
import { PAIR_LIMITS as L, lanError, validateSummary } from '../../shared/lan.mjs';
import { validateManifest, checkAbort } from '../../shared/manifest.mjs';
import { readEntry, readFrom } from './collection.mjs';

const encoder = new TextEncoder();
const digest = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const hex = bytes => [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const nextChain = async (chain, partHash) => digest(new Uint8Array([...chain, ...partHash]));
export async function prepareTransfer(bundle) {
  bundle={...bundle,manifest:{version:bundle.manifest.version,entries:bundle.manifest.entries.map(e=>({...e})).sort((a,b)=>a.relativePath<b.relativePath?-1:a.relativePath>b.relativePath?1:0)},sources:new Map(bundle.sources)};
  const stats = validateManifest(bundle.manifest); const manifest = encoder.encode(JSON.stringify(bundle.manifest));
  if (manifest.length > L.manifestBytes || !stats.entries) throw lanError('FT_COLLECTION_LIMIT');
  const files = bundle.manifest.entries.filter(e => e.kind === 'file');
  const summary = { files: stats.files, directories: stats.directories, totalBytes: stats.totalBytes, maxFileBytes: files.reduce((n, e) => BigInt(e.sizeBytes) > BigInt(n) ? e.sizeBytes : n, '0'), manifestHash: hex(await digest(manifest)) };
  return { bundle, manifest, files, summary };
}
function abortableDelay(ms, signal) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); reject(lanError('FT_CANCELLED')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export async function sendBounded(channel, bytes, signal) {
  checkAbort(signal);
  if (channel.readyState !== 'open') throw lanError('FT_CONNECTION_CLOSED');
  if (channel.bufferedAmount > 65536) {
    channel.bufferedAmountLowThreshold = 32768;
    await new Promise((resolve, reject) => {
      const done = error => { clearTimeout(timer); channel.removeEventListener('bufferedamountlow', low); channel.removeEventListener('close', closed); signal?.removeEventListener('abort', cancelled); error ? reject(error) : resolve(); };
      const low = () => { if (channel.bufferedAmount <= 32768) done(); };
      const closed = () => done(lanError('FT_CONNECTION_CLOSED')); const cancelled = () => done(lanError('FT_CANCELLED'));
      const timer = setTimeout(() => done(lanError('FT_TIMEOUT')), L.idleMs);
      channel.addEventListener('bufferedamountlow', low); channel.addEventListener('close', closed); signal?.addEventListener('abort', cancelled, { once: true }); low();
    });
  }
  checkAbort(signal); channel.send(bytes);
}
// Pull protocol: one bounded response at a time. Receiver disk backpressure
// controls the next request; native files are never buffered in their entirety.
export function serveTransfer(channel, prepared, { signal, verifyRoute = async () => {}, rateKbps = null, onProgress = () => {}, onError = () => {}, resumePoint = null } = {}) {
  const start=validatePoint(resumePoint||initialPoint(rateKbps),prepared.summary,prepared.bundle.manifest);
  let processing = false; let lastId = 0; let manifestOffset = 0; let fileIndex = start.fileIndex; let offset = BigInt(start.offset); let total = BigInt(start.bytes);
  let iterator; let chunk = new Uint8Array(); let cursor = 0; let chain = unhex(start.chain); let nextAt = 0; let stopped = false;
  const clean = () => { clearInterval(readyTimer); stopped = true; channel.removeEventListener('message', message); Promise.resolve(iterator?.return?.()).catch(() => {}); };
  async function process(request) {
    checkAbort(signal); await verifyRoute();
    if (!request || !Number.isInteger(request.id) || request.id !== lastId + 1 || request.id > 0xffffffff) throw lanError('FT_PROTOCOL');
    lastId = request.id; clearInterval(readyTimer);
    if (request.type === 'manifest-info') { if (lastId !== 1) throw lanError('FT_PROTOCOL'); await sendBounded(channel, JSON.stringify({ type: 'manifest-info', id: request.id, bytes: prepared.manifest.length }), signal); return; }
    const meta = request.index === -1;
    const entry = prepared.files[fileIndex];
    if (request.type === 'finish') {
      if (meta || request.index !== fileIndex || !entry || offset !== BigInt(entry.sizeBytes) || manifestOffset !== prepared.manifest.length) throw lanError('FT_PROTOCOL');
      // Exhaust the source too, detecting length changes before the receiver closes its writer.
      if (!iterator) iterator = readFrom(prepared.bundle, entry, fileIndex===start.fileIndex?start.offset:'0', signal)[Symbol.asyncIterator]();
      if (!(await iterator.next()).done) throw lanError('FT_SIZE_MISMATCH');
      await sendBounded(channel, JSON.stringify({ type: 'finish', id: request.id, index: fileIndex, size: offset.toString(), chain: hex(chain) }), signal);
      iterator = null; chunk = new Uint8Array(); cursor = 0; offset = 0n; chain = new Uint8Array(32); fileIndex++; return;
    }
    if (request.type !== 'read' || !Number.isInteger(request.length) || request.length < 1 || request.length > L.dataBytes || typeof request.offset !== 'string' || !/^(0|[1-9]\d{0,18})$/u.test(request.offset)) throw lanError('FT_PROTOCOL');
    let data;
    if (meta) {
      if (BigInt(request.offset) !== BigInt(manifestOffset) || manifestOffset >= prepared.manifest.length || request.length > prepared.manifest.length - manifestOffset) throw lanError('FT_PROTOCOL');
      data = prepared.manifest.slice(manifestOffset, manifestOffset + request.length); manifestOffset += data.length;
    } else {
      if (manifestOffset !== prepared.manifest.length || request.index !== fileIndex || !entry || BigInt(request.offset) !== offset || BigInt(request.length) > BigInt(entry.sizeBytes) - offset) throw lanError('FT_PROTOCOL');
      if (!iterator) iterator = readFrom(prepared.bundle, entry, fileIndex===start.fileIndex?start.offset:'0', signal)[Symbol.asyncIterator]();
      data = new Uint8Array(request.length); let filled = 0;
      while (filled < data.length) {
        if (cursor === chunk.length) { const value = await iterator.next(); if (value.done) throw lanError('FT_SIZE_MISMATCH'); chunk = value.value; cursor = 0; }
        const count = Math.min(data.length - filled, chunk.length - cursor); data.set(chunk.subarray(cursor, cursor + count), filled); cursor += count; filled += count;
      }
      if (rateKbps !== null) { const time = performance.now(); nextAt = Math.max(nextAt, time); await abortableDelay(Math.max(0, nextAt - time), signal); nextAt += data.length * 8 / rateKbps; }
      offset += BigInt(data.length); total += BigInt(data.length);
    }
    const partHash = await digest(data); if (!meta) chain = await nextChain(chain, partHash);
    const frame = new Uint8Array(48 + data.length); const view = new DataView(frame.buffer);
    view.setUint32(0, request.id); view.setInt32(4, request.index); view.setBigUint64(8, BigInt(request.offset)); frame.set(partHash, 16); frame.set(data, 48);
    await verifyRoute(); await sendBounded(channel, frame, signal);
    if (!meta) onProgress({ bytes: total.toString(), totalBytes: prepared.summary.totalBytes, path: entry.relativePath });
  }
  const message = event => {
    if (stopped) return;
    if (processing || typeof event.data !== 'string' || event.data.length > 1024) { clean(); onError(lanError('FT_PROTOCOL')); return; }
    processing = true;
    Promise.resolve().then(() => process(JSON.parse(event.data))).catch(error => { clean(); onError(error); }).finally(() => { processing = false; });
  };
  const readyTimer = setInterval(() => { if (channel.readyState === 'open' && !stopped && !lastId) channel.send(JSON.stringify({ type: 'ready' })); }, 100);
  channel.addEventListener('message', message); signal?.addEventListener('abort', clean, { once: true });
  return () => { clean(); signal?.removeEventListener('abort', clean); };
}
export async function receiveTransfer(channel, summary, { signal, verifyRoute = async () => {}, rateKbps = null, onProgress = () => {}, resumePoint = null } = {}) {
  const start=validatePoint(resumePoint||initialPoint(rateKbps),summary);
  const chunkBytes = start.chunkBytes;
  validateSummary(summary); let id = 0; let pending = null; let total = BigInt(start.bytes); let nextFile = start.fileIndex; let position=BigInt(start.offset),fileChain=unhex(start.chain),root=unhex(start.root);
  channel.binaryType = 'arraybuffer';
  const rejectPending = error => { if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.reject(error); } };
  const closed = () => rejectPending(lanError('FT_CONNECTION_CLOSED')); const aborted = () => rejectPending(lanError('FT_CANCELLED'));
  function message(event) {
    if (!pending) return;
    const p = pending; pending = null; clearTimeout(p.timer);
    if (event.data instanceof ArrayBuffer && event.data.byteLength <= L.frameBytes || typeof event.data === 'string' && event.data.length <= 1024) p.resolve(event.data);
    else p.reject(lanError('FT_PROTOCOL'));
  }
  channel.addEventListener('message', message); channel.addEventListener('close', closed); signal?.addEventListener('abort', aborted, { once: true });
  function dispose() { rejectPending(lanError('FT_CANCELLED')); channel.removeEventListener('message', message); channel.removeEventListener('close', closed); signal?.removeEventListener('abort', aborted); }
  async function rpc(body) {
    checkAbort(signal); await verifyRoute(); if (pending) throw lanError('FT_PROTOCOL');
    const request = { ...body, id: ++id };
    const response = new Promise((resolve, reject) => { pending = { resolve, reject, timer: setTimeout(() => rejectPending(lanError('FT_TIMEOUT')), L.idleMs) }; });
    try { await sendBounded(channel, JSON.stringify(request), signal); } catch (e) { rejectPending(e); }
    const result = await response; checkAbort(signal);
    if (typeof result === 'string') { const parsed = JSON.parse(result); if (parsed.id !== request.id || parsed.type !== request.type) throw lanError('FT_PROTOCOL'); return parsed; }
    if (request.type !== 'read' || result.byteLength !== 48 + request.length) throw lanError('FT_PROTOCOL');
    const view = new DataView(result); const bytes = new Uint8Array(result);
    if (view.getUint32(0) !== request.id || view.getInt32(4) !== request.index || view.getBigUint64(8) !== BigInt(request.offset) || !equal(await digest(bytes.subarray(48)), bytes.subarray(16, 48))) throw lanError('FT_INTEGRITY');
    return bytes.subarray(48);
  }
  try {
    // The sender may process its signaling grant after the receiver does.
    // Wait for a ready beacon before making the first request.
    const ready = await new Promise((resolve, reject) => { pending = { resolve, reject, timer: setTimeout(() => rejectPending(lanError('FT_TIMEOUT')), L.idleMs) }; });
    if (typeof ready !== 'string' || JSON.parse(ready).type !== 'ready') throw lanError('FT_PROTOCOL');
    const info = await rpc({ type: 'manifest-info' });
    if (!Number.isInteger(info.bytes) || info.bytes < 1 || info.bytes > L.manifestBytes) throw lanError('FT_COLLECTION_LIMIT');
    const bytes = new Uint8Array(info.bytes);
    for (let offset = 0; offset < bytes.length;) { const data = await rpc({ type: 'read', index: -1, offset: String(offset), length: Math.min(L.dataBytes, bytes.length - offset) }); bytes.set(data, offset); offset += data.length; }
    if (hex(await digest(bytes)) !== summary.manifestHash) throw lanError('FT_INTEGRITY');
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); const stats = validateManifest(manifest);
    validatePoint(start,summary,manifest);
    const files = manifest.entries.filter(e => e.kind === 'file');
    if (stats.files !== summary.files || stats.directories !== summary.directories || stats.totalBytes !== summary.totalBytes || files.reduce((n, e) => BigInt(e.sizeBytes) > BigInt(n) ? e.sizeBytes : n, '0') !== summary.maxFileBytes) throw lanError('FT_INTEGRITY');
    const sources = new Map(files.map((entry, index) => [entry.relativePath, async function* (readSignal) {
      if (index !== nextFile) throw lanError('FT_PROTOCOL');
      let offset = index===start.fileIndex?BigInt(start.offset):0n; let chain = index===start.fileIndex?unhex(start.chain):new Uint8Array(32);
      while (offset < BigInt(entry.sizeBytes)) {
        checkAbort(readSignal); const left = BigInt(entry.sizeBytes) - offset;
        const data = await rpc({ type: 'read', index, offset: offset.toString(), length: Number(left < BigInt(chunkBytes) ? left : BigInt(chunkBytes)) });
        const hash=await digest(data);chain = await nextChain(chain,hash);root=await appendHash(root,hash);offset += BigInt(data.length); total += BigInt(data.length);position=offset;fileChain=chain;
        yield data; onProgress({ bytes: total.toString(), totalBytes: stats.totalBytes, path: entry.relativePath });
      }
      checkAbort(readSignal); const finish = await rpc({ type: 'finish', index });
      if (finish.index !== index || finish.size !== entry.sizeBytes || finish.chain !== hex(chain)) throw lanError('FT_INTEGRITY');root=await finishRoot(root,index,entry.sizeBytes);nextFile++;position=0n;fileChain=new Uint8Array(32);
    }]));
    return { bundle: { manifest, sources, renamed: [], warnings: [] }, dispose, point:()=>({fileIndex:nextFile,offset:position.toString(),bytes:total.toString(),chain:hex(fileChain),root:hex(root),chunkBytes}), complete: () => nextFile === files.length };
  } catch (error) { dispose(); throw error; }
}
