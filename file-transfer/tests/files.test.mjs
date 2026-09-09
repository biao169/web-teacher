import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FILE_LIMITS, safePath, validateManifest, policyWarnings } from '../shared/manifest.mjs';
import { defaultSettings } from '../shared/settings.mjs';
import { emptyBundle, collectFiles, collectFilesAsync, collectHandle, collectLegacy, captureDrop, collectDrop, mergeBundles, removePath, readEntry } from '../web/files/collection.mjs';
import { zipChunks, zipSize } from '../web/files/zip.mjs';
import { boundedBlob, writeChunks, writeDirectory, saveZip, saveSingle, offerBlob, browserFileSupport } from '../web/files/save.mjs';
const file = (name, contents = '', path) => { const f = new File([contents], name, { lastModified: 1700000000000 }); if (path) Object.defineProperty(f, 'webkitRelativePath', { value: path }); return f; };
const handleFile = f => ({ name: f.name, kind: 'file', getFile: async () => f });
const handleDir = (name, children = []) => ({ name, kind: 'directory', async *values() { yield* children; } });
async function bytes(iterable) { const parts = []; for await (const b of iterable) parts.push(Buffer.from(b)); return Buffer.concat(parts); }
function writer({ afterWrite } = {}) { const w = { parts: [], closed: false, aborted: false, async write(b) { w.parts.push(Buffer.from(b)); afterWrite?.(b); }, async close() { w.closed = true; }, async abort() { w.aborted = true; w.parts = []; } }; return w; }
const notFound = () => Object.assign(new Error('missing'), { name: 'NotFoundError' });
class Directory {
  constructor(name = '') { this.name = name; this.directories = new Map(); this.files = new Map(); this.calls = []; }
  async getDirectoryHandle(name, { create = false } = {}) { this.calls.push(['directory', name, create]); const key = name.toLowerCase(); if (this.files.has(key)) throw new Error('type mismatch'); if (!this.directories.has(key)) { if (!create) throw notFound(); this.directories.set(key, new Directory(name)); } return this.directories.get(key); }
  async getFileHandle(name, { create = false } = {}) { this.calls.push(['file', name, create]); const key = name.toLowerCase(); if (this.directories.has(key)) throw new Error('type mismatch'); if (!this.files.has(key)) { if (!create) throw notFound(); const entry = { name, committed: null, createWritable: async () => { const w = writer(); const close = w.close; w.close = async () => { await close(); entry.committed = Buffer.concat(w.parts); }; return w; } }; this.files.set(key, entry); } return this.files.get(key); }
}

test('portable paths reject traversal, absolute paths, device names, alternate streams and ambiguous Unicode', () => {
  for (const name of ['../a', '/a', 'a//b', 'a/./b', 'a/../b', 'C:/a', 'a\\b', 'a:stream', 'CON', 'lpt1.txt', 'NUL.foo', 'com¹', 'a.', 'a ', 'a\0b', 'a\u202eb', 'e\u0301', 'a'.repeat(256), '\ud800']) assert.throws(() => safePath(name), e => e.code === 'FT_UNSAFE_PATH', name);
  for (const name of ['科研资料/图片 1.png', 'emoji/📁.txt', '.config', 'file%20.txt']) assert.equal(safePath(name), name);
});
test('manifest validates parents, duplicate aliases, kind, exact byte counts and bounded metadata before any write', async () => {
  const good = collectFiles([file('a.txt', '123')]).manifest; assert.equal(validateManifest(good).totalBytes, '3');
  const entry = good.entries[0];
  for (const manifest of [{ ...good, entries: [entry, { ...entry, relativePath: 'A.txt' }] }, { ...good, entries: [{ ...entry, relativePath: 'parent/a.txt' }] }, { ...good, entries: [{ ...entry, sizeBytes: '03' }] }, { ...good, entries: [{ ...entry, kind: 'symlink' }] }, { ...good, entries: [{ ...entry, modifiedAt: -1 }] }, { ...good, extra: true }]) assert.throws(() => validateManifest(manifest));
  const root = new Directory(); await assert.rejects(writeDirectory({ ...emptyBundle(), manifest: { version: 1, entries: [{ ...entry, relativePath: '../escape' }] } }, root)); assert.equal(root.calls.length, 0);
});
test('file selection keeps zero-byte files, reconstructs parents, renames case-insensitive duplicates and uses matching sources', async () => {
  const bundle = collectFiles([file('A.txt', 'first'), file('a.txt', 'second'), file('empty', '')]);
  assert.deepEqual(bundle.manifest.entries.map(e => e.relativePath), ['A.txt', 'a (2).txt', 'empty']);
  assert.equal((await bytes(readEntry(bundle, bundle.manifest.entries[1]))).toString(), 'second');
  const folders = collectFiles([file('a.txt', 'x', '根目录/子目录/a.txt')], { directory: true });
  assert.deepEqual(validateManifest(folders.manifest), { files: 1, directories: 2, emptyDirectories: 0, totalBytes: '1', entries: 3 }); assert.ok(folders.warnings.includes('FT_EMPTY_DIRECTORIES_UNKNOWN'));
});
test('directory handles preserve all empty directories and selected root; overlapping roots are renamed with their children', async () => {
  const root = handleDir('资料', [handleDir('空目录'), handleDir('子目录', [handleFile(file('中文.txt', '正文'))])]);
  const bundle = await collectHandle(root); assert.equal(validateManifest(bundle.manifest).emptyDirectories, 1);
  const merged = mergeBundles(bundle, bundle);
  assert.ok(merged.manifest.entries.some(e => e.relativePath === '资料 (2)/子目录/中文.txt'));
  assert.equal((await bytes(readEntry(merged, merged.manifest.entries.find(e => e.relativePath === '资料 (2)/子目录/中文.txt')))).toString(), '正文');
  const removed = removePath(merged, '资料 (2)'); assert.equal(removed.manifest.entries.length, bundle.manifest.entries.length); assert.equal(removed.sources.size, 1);
});
test('legacy directory readers consume every batch and preserve empty folders', async () => {
  let batches = 0;
  const make = i => ({ name: i + '.txt', isFile: true, file: cb => cb(file(i + '.txt', 'x')) });
  const children = Array.from({ length: 205 }, (_, i) => make(i));
  const root = { name: 'folder', isDirectory: true, createReader: () => ({ readEntries: cb => { batches++; cb(children.splice(0, 100)); } }) };
  const bundle = await collectLegacy(root); assert.equal(validateManifest(bundle.manifest).files, 205); assert.equal(batches, 4);
  assert.equal(validateManifest((await collectLegacy({ name: 'empty', isDirectory: true, createReader: () => ({ readEntries: cb => cb([]) }) })).manifest).emptyDirectories, 1);
});
test('drop captures every handle synchronously and falls back to entries/files without flattening folders', async () => {
  let active = true; let count = 0;
  const data = { items: [file('one', '1'), file('two', '2')].map(f => ({ kind: 'file', getAsFileSystemHandle() { assert.equal(active, true); count++; return Promise.resolve(handleFile(f)); }, getAsFile: () => f })) };
  const captured = captureDrop(data); active = false; assert.equal(count, 2); const bundle = await collectDrop(captured); assert.equal(validateManifest(bundle.manifest).files, 2);
  const fallback = captureDrop({ items: [{ kind: 'file', getAsFileSystemHandle: () => Promise.reject(new Error('unsupported')), getAsFile: () => file('fallback', 'ok') }] });
  assert.equal((await collectDrop(fallback)).manifest.entries[0].relativePath, 'fallback');
});
test('source file changes and denied folder reads fail without mutating previous selections', async () => {
  let current = file('same.txt', 'original'); const handle = { name: current.name, kind: 'file', getFile: async () => current };
  const bundle = await collectHandle(handle); current = file('same.txt', 'changed-size');
  await assert.rejects(bytes(readEntry(bundle, bundle.manifest.entries[0])), e => e.code === 'FT_FILE_CHANGED');
  const original = collectFiles([file('original', 'preserved')]);
  await assert.rejects(collectHandle({ name: 'bad', kind: 'directory', async *values() { yield handleFile(file('first', 'x')); throw new Error('denied'); } }));
  assert.equal(original.manifest.entries.length, 1); assert.equal(original.manifest.entries[0].relativePath, 'original');
});
test('local file reads are lazy and bounded; truncation and oversized stream chunks are rejected', async () => {
  let reads = 0; const n = FILE_LIMITS.chunkBytes * 2 + 17;
  const fake = { name: 'large.bin', size: n, lastModified: 0, slice(start, end) { reads++; assert.ok(end - start <= FILE_LIMITS.chunkBytes); return new Blob([new Uint8Array(Math.min(end, n) - start)]); } };
  const bundle = collectFiles([fake]); assert.equal(reads, 0); const output = await bytes(readEntry(bundle, bundle.manifest.entries[0])); assert.equal(output.length, n); assert.equal(reads, 3);
  bundle.sources.set('large.bin', async function* () { yield new Uint8Array(1); });
  await assert.rejects(bytes(readEntry(bundle, bundle.manifest.entries[0])), e => e.code === 'FT_SIZE_MISMATCH');
  bundle.sources.set('large.bin', async function* () { yield new Uint8Array(FILE_LIMITS.chunkBytes + 1); });
  await assert.rejects(bytes(readEntry(bundle, bundle.manifest.entries[0])), e => e.code === 'FT_STREAM_INVALID');
});
test('classic and ZIP64 archives round-trip Unicode files, empty directories and CRC through Python zipfile', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'ft-zip-中文 space-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bundle = await collectHandle(handleDir('资料', [handleDir('空目录'), handleDir('nested', [handleFile(file('中文.txt', '内容\nabc')), handleFile(file('empty.bin'))])]));
  for (const forceZip64 of [false, true]) {
    const data = await bytes(zipChunks(bundle, { forceZip64 })); assert.equal(BigInt(data.length), zipSize(bundle.manifest, { forceZip64 })); const path = join(directory, forceZip64 + '.zip'); writeFileSync(path, data);
    const script = "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;assert z.read('资料/nested/中文.txt').decode()=='内容\\nabc';assert z.read('资料/nested/empty.bin')==b'';assert z.getinfo('资料/空目录/').is_dir();assert all(i.compress_type==0 for i in z.infolist());print('ZIP round-trip OK')";
    const result = spawnSync(process.env.FT_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', script, path], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
  }
});
test('ZIP64 size planning handles a file larger than 4 GiB without reading or buffering it', async () => {
  const bundle = collectFiles([{ name: 'huge.bin', size: 4294967296, lastModified: 0, slice() { throw new Error('must not read'); } }]);
  assert.ok(zipSize(bundle.manifest) > 4294967296n);
  const stream = zipChunks(bundle); const first = (await stream.next()).value; const header = new DataView(first.buffer, first.byteOffset, first.byteLength);
  assert.equal(header.getUint16(4, true), 45); assert.equal(header.getUint32(18, true), 0xffffffff); await stream.return();
});
test('memory fallback refuses oversized exports before reading and enforces the limit while streaming', async () => {
  let started = false; async function* chunks() { started = true; yield new Uint8Array(4); }
  await assert.rejects(boundedBlob(chunks(), '11', { maximumBytes: 10 }), e => e.code === 'FT_MEMORY_LIMIT'); assert.equal(started, false);
  await assert.rejects(boundedBlob(chunks(), '3', { maximumBytes: 3 }), e => e.code === 'FT_MEMORY_LIMIT');
  const blob = await boundedBlob(chunks(), '4'); assert.equal(blob.size, 4);
});
test('writable backpressure keeps one write outstanding and cancellation aborts rather than committing a partial file', async () => {
  let inFlight = 0; let max = 0; const w = writer(); w.write = async () => { inFlight++; max = Math.max(max, inFlight); await new Promise(ok => setTimeout(ok, 1)); inFlight--; };
  await writeChunks((async function* () { for (let i = 0; i < 5; i++) yield new Uint8Array(1); })(), w); assert.equal(max, 1); assert.equal(w.closed, true);
  const controller = new AbortController(); let released = false; const cancelled = writer({ afterWrite: () => controller.abort() });
  const source = (async function* () { try { yield new Uint8Array(1); yield new Uint8Array(1); } finally { released = true; } })();
  await assert.rejects(writeChunks(source, cancelled, { signal: controller.signal }), e => e.code === 'FT_CANCELLED'); assert.equal(cancelled.closed, false); assert.equal(cancelled.aborted, true); assert.equal(released, true);
});
test('directory output restores structure in a fresh container and refuses to reuse existing destinations', async () => {
  const bundle = await collectHandle(handleDir('资料', [handleDir('空目录'), handleFile(file('正文.txt', '正文')), handleFile(file('空文件'))])); const root = new Directory();
  const result = await writeDirectory(bundle, root, { containerName: 'new-copy' }); assert.equal(result.files, 2);
  const target = root.directories.get('new-copy').directories.get('资料'); assert.ok(target.directories.has('空目录')); assert.equal(target.files.get('正文.txt').committed.toString(), '正文'); assert.equal(target.files.get('空文件').committed.length, 0);
  await assert.rejects(writeDirectory(bundle, root, { containerName: 'new-copy' }), e => e.code === 'FT_DESTINATION_EXISTS');
  assert.equal(target.files.get('正文.txt').committed.toString(), '正文');
});
test('directory failure aborts the current file and reports only completed files and its new container', async () => {
  const bundle = collectFiles([file('ok.txt', 'ok'), file('bad.txt', 'broken')]); bundle.sources.set('bad.txt', async function* () { yield new Uint8Array(1); });
  const root = new Directory(); await assert.rejects(writeDirectory(bundle, root, { containerName: 'partial' }), e => e.code === 'FT_SIZE_MISMATCH' && e.partialDirectory === 'partial' && e.completedFiles === 1);
  const destination = root.directories.get('partial'); assert.equal(destination.files.get('ok.txt').committed.toString(), 'ok'); assert.equal(destination.files.get('bad.txt').committed, null);
});
test('native save picker is requested in the click turn before file reads; cancellation starts no write', async () => {
  const bundle = collectFiles([file('text.txt', 'hello')]); const w = writer(); let picked = false;
  const scope = { isSecureContext: true, showSaveFilePicker() { picked = true; return Promise.resolve({ name: 'saved.zip', createWritable: async () => w }); } };
  const saving = saveZip(bundle, { scope }); assert.equal(picked, true); assert.equal(w.parts.length, 0); assert.equal((await saving).status, 'saved'); assert.equal(w.closed, true);
  let writes = 0; const cancelled = { isSecureContext: true, showSaveFilePicker: () => Promise.reject(Object.assign(new Error(), { name: 'AbortError' })) };
  bundle.sources.set('text.txt', async function* () { writes++; yield new Uint8Array(5); });
  await assert.rejects(saveSingle(bundle, bundle.manifest.entries[0], { scope: cancelled }), { name: 'AbortError' }); assert.equal(writes, 0);
  assert.equal(browserFileSupport({ isSecureContext: false, showDirectoryPicker() {} }).directoryWrite, false);
});
test('configured policy warnings use byte-accurate limits and do not claim live quota enforcement', () => {
  const bundle = collectFiles([file('file', '1234')]); const policy = defaultSettings().rules[1]; policy.maxTaskBytes = '3'; policy.maxFileBytes = '2'; policy.maxFiles = 0;
  assert.deepEqual(policyWarnings(bundle.manifest, policy).sort(), ['FT_FILE_COUNT_LIMIT', 'FT_FILE_SIZE_LIMIT', 'FT_TASK_SIZE_LIMIT']); assert.deepEqual(policyWarnings(bundle.manifest), ['FT_POLICY_UNKNOWN']);
});

test('large selections yield between metadata batches, respond to cancellation and stay within the entry cap', async () => {
  const f = file('same.txt', 'x'); const controller = new AbortController();
  const scanning = collectFilesAsync(Array(2000).fill(f), { signal: controller.signal }); controller.abort();
  await assert.rejects(scanning, e => e.code === 'FT_CANCELLED');
  const many = collectFiles(Array(2000).fill(f)); assert.equal(many.manifest.entries.length, 2000); assert.equal(many.manifest.entries[1999].relativePath, 'same (2000).txt');
  assert.throws(() => collectFiles(Array(FILE_LIMITS.entries + 1).fill(f)), e => e.code === 'FT_COLLECTION_LIMIT');
});
test('memory fallback copies transient producer buffers before reuse', async () => {
  async function* reused() { const b = new Uint8Array([1, 2]); yield b; b.set([3, 4]); yield b; }
  assert.deepEqual([...new Uint8Array(await (await boundedBlob(reused(), '4')).arrayBuffer())], [1, 2, 3, 4]);
});

test('recent fallback downloads share one bounded memory budget and release it when URLs are revoked', async () => {
  const timers = []; let reads = 0;
  const scope = { URL: { createObjectURL: () => 'blob:local', revokeObjectURL() {} }, document: { body: { append() {} }, createElement: () => ({ style: {}, click() {}, remove() {} }) }, setTimeout: cb => timers.push(cb) };
  offerBlob({ size: FILE_LIMITS.memoryDownloadBytes }, 'first.zip', scope);
  const bundle = collectFiles([file('tiny.txt', 'x')]); bundle.sources.set('tiny.txt', async function* () { reads++; yield new Uint8Array([1]); });
  await assert.rejects(saveSingle(bundle, bundle.manifest.entries[0], { scope }), e => e.code === 'FT_DOWNLOAD_BUSY'); assert.equal(reads, 0);
  timers.shift()(); assert.equal((await saveSingle(bundle, bundle.manifest.entries[0], { scope })).status, 'download-requested'); assert.equal(reads, 1); timers.shift()();
});
