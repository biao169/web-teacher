import { FILE_LIMITS, safePath, pathKey, renamedPath, validateManifest, fileError, checkAbort } from '../../shared/manifest.mjs';
export function emptyBundle() { return { manifest: { version: 1, entries: [] }, sources: new Map(), warnings: [], renamed: [] }; }
function builder(signal) {
  const bundle = emptyBundle(); const used = new Set(); const dirs = new Map(); const nextSuffix = new Map(); let pathBytes = 0;
  function allocate(path, directory) {
    let candidate = safePath(path); let i = nextSuffix.get(pathKey(path)) || 2;
    while (used.has(pathKey(candidate))) candidate = renamedPath(path, i++, directory);
    nextSuffix.set(pathKey(path), i);
    if (candidate !== path) bundle.renamed.push({ from: path, to: candidate });
    return candidate;
  }
  function append(entry) {
    checkAbort(signal);
    pathBytes += new TextEncoder().encode(entry.relativePath).length;
    if (bundle.manifest.entries.length >= FILE_LIMITS.entries || pathBytes > FILE_LIMITS.totalPathBytes) throw fileError('FT_COLLECTION_LIMIT');
    bundle.manifest.entries.push(entry); used.add(pathKey(entry.relativePath));
  }
  function directory(raw) {
    const original = safePath(raw.normalize('NFC'));
    if (dirs.has(original)) return dirs.get(original);
    const parts = original.split('/'); const name = parts.pop();
    const parent = parts.length ? directory(parts.join('/')) + '/' : '';
    const path = allocate(parent + name, true);
    append({ relativePath: path, kind: 'directory', sizeBytes: '0', modifiedAt: null }); dirs.set(original, path); return path;
  }
  function file(raw, blob, reopen) {
    checkAbort(signal); const original = safePath(raw.normalize('NFC'));
    if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 0 || typeof blob.slice !== 'function') throw fileError('FT_READ_FAILED', original);
    const parts = original.split('/'); const name = parts.pop();
    const parent = parts.length ? directory(parts.join('/')) + '/' : '';
    const path = allocate(parent + name, false);
    const modifiedAt = Number.isSafeInteger(blob.lastModified) && blob.lastModified >= 0 ? blob.lastModified : null;
    const entry = { relativePath: path, kind: 'file', sizeBytes: String(blob.size), modifiedAt };
    append(entry);
    const reader = async function* (readSignal, start = 0) {
      checkAbort(readSignal); let source;
      try { source = reopen ? await reopen() : blob; } catch { throw fileError('FT_READ_FAILED', path); }
      if (source.size !== blob.size || (modifiedAt !== null && source.lastModified !== modifiedAt)) throw fileError('FT_FILE_CHANGED', path);
      for (let offset = start; offset < source.size; offset += FILE_LIMITS.chunkBytes) {
        checkAbort(readSignal); let bytes;
        try { bytes = new Uint8Array(await source.slice(offset, offset + FILE_LIMITS.chunkBytes).arrayBuffer()); } catch { throw fileError('FT_READ_FAILED', path); }
        checkAbort(readSignal); yield bytes;
      }
    };
    reader.supportsRange = true; bundle.sources.set(path, reader);
  }
  return { bundle, directory, file, finish() { validateManifest(bundle.manifest); return bundle; } };
}
export function collectFiles(files, { directory = false, signal } = {}) {
  const b = builder(signal);
  for (const file of files) {
    if (directory && !file.webkitRelativePath) throw fileError('FT_DIRECTORY_UNSUPPORTED');
    b.file(directory ? file.webkitRelativePath : file.name, file);
  }
  if (directory) b.bundle.warnings.push('FT_EMPTY_DIRECTORIES_UNKNOWN');
  return b.finish();
}
export async function collectFilesAsync(files, { directory = false, signal } = {}) {
  const b = builder(signal); let count = 0;
  for (const file of files) {
    if (directory && !file.webkitRelativePath) throw fileError('FT_DIRECTORY_UNSUPPORTED');
    b.file(directory ? file.webkitRelativePath : file.name, file);
    if (++count % 200 === 0) { await new Promise(ok => setTimeout(ok, 0)); checkAbort(signal); }
  }
  if (directory) b.bundle.warnings.push('FT_EMPTY_DIRECTORIES_UNKNOWN');
  return b.finish();
}
export async function collectHandle(handle, { signal } = {}) {
  const b = builder(signal);
  async function visit(h, parent = '') {
    checkAbort(signal); const path = safePath(parent + h.name.normalize('NFC'));
    if (h.kind === 'directory') {
      b.directory(path);
      for await (const child of h.values()) await visit(child, path + '/');
    } else if (h.kind === 'file') b.file(path, await h.getFile(), () => h.getFile());
    else throw fileError('FT_DIRECTORY_UNSUPPORTED');
  }
  await visit(handle); return b.finish();
}
export async function collectLegacy(entry, { signal } = {}) {
  const b = builder(signal);
  async function visit(e, parent = '') {
    checkAbort(signal); const path = safePath(parent + e.name.normalize('NFC'));
    if (e.isDirectory) {
      b.directory(path); const reader = e.createReader();
      // readEntries can return several batches (notably batches of 100).
      for (;;) { checkAbort(signal); const batch = await new Promise((ok, fail) => reader.readEntries(ok, fail)); if (!batch.length) break; for (const child of batch) await visit(child, path + '/'); }
    } else if (e.isFile) b.file(path, await new Promise((ok, fail) => e.file(ok, fail)));
    else throw fileError('FT_DIRECTORY_UNSUPPORTED');
  }
  await visit(entry); return b.finish();
}
export function mergeAll(bundles) {
  const bundle = emptyBundle(); const roots = new Set(); const nextSuffix = new Map(); let pathBytes = 0;
  for (const incoming of bundles) {
    validateManifest(incoming.manifest);
    if (bundle.manifest.entries.length + incoming.manifest.entries.length > FILE_LIMITS.entries) throw fileError('FT_COLLECTION_LIMIT');
    const mapping = new Map();
    bundle.warnings = [...new Set([...bundle.warnings, ...incoming.warnings])];
    bundle.renamed.push(...incoming.renamed);
    for (const entry of incoming.manifest.entries.filter(e => !e.relativePath.includes('/'))) {
      const original = entry.relativePath; let candidate = original; let i = nextSuffix.get(pathKey(original)) || 2;
      while (roots.has(pathKey(candidate))) candidate = renamedPath(original, i++, entry.kind === 'directory');
      nextSuffix.set(pathKey(original), i);
      roots.add(pathKey(candidate)); mapping.set(original, candidate);
      if (candidate !== original) bundle.renamed.push({ from: original, to: candidate });
    }
    for (const entry of incoming.manifest.entries) {
      const parts = entry.relativePath.split('/'); parts[0] = mapping.get(parts[0]); const path = safePath(parts.join('/'));
      pathBytes += new TextEncoder().encode(path).length;
      if (pathBytes > FILE_LIMITS.totalPathBytes) throw fileError('FT_COLLECTION_LIMIT');
      bundle.manifest.entries.push({ ...entry, relativePath: path });
      if (entry.kind === 'file') bundle.sources.set(path, incoming.sources.get(entry.relativePath));
    }
  }
  validateManifest(bundle.manifest); return bundle;
}
export function mergeBundles(existing, incoming) { return mergeAll([existing, incoming]); }
export function removePath(bundle, path) {
  safePath(path); const keep = entry => entry.relativePath !== path && !entry.relativePath.startsWith(path + '/');
  return { ...bundle, manifest: { version: 1, entries: bundle.manifest.entries.filter(keep) }, sources: new Map([...bundle.sources].filter(([name]) => name !== path && !name.startsWith(path + '/'))) };
}
// Capture all handles synchronously during the drop event; data-transfer access
// may be revoked as soon as the event returns / the first promise is awaited.
export function captureDrop(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []).filter(item => item.kind === 'file');
  if (!items.length) return { captures: [], files: Array.from(dataTransfer?.files || []) };
  return { captures: items.map(item => {
    let pending = null; let entry = null; let file = null;
    try { pending = item.getAsFileSystemHandle ? Promise.resolve(item.getAsFileSystemHandle()).catch(() => null) : null; } catch { /* fallback captured below */ }
    try { entry = item.webkitGetAsEntry?.() ?? null; } catch { /* unsupported */ }
    try { file = item.getAsFile?.() ?? null; } catch { /* unsupported */ }
    return { pending, entry, file };
  }), files: [] };
}
export async function collectDrop(captured, { signal } = {}) {
  if (!captured.captures.length) return collectFiles(captured.files, { signal });
  const bundles = []; let count = 0;
  for (const item of captured.captures) {
    checkAbort(signal); const handle = await item.pending;
    const current = handle ? await collectHandle(handle, { signal }) : item.entry ? await collectLegacy(item.entry, { signal }) : item.file ? collectFiles([item.file], { signal }) : null;
    if (!current) throw fileError('FT_DIRECTORY_UNSUPPORTED');
    count += current.manifest.entries.length; if (count > FILE_LIMITS.entries) throw fileError('FT_COLLECTION_LIMIT');
    bundles.push(current);
    if (bundles.length % 200 === 0) await new Promise(ok => setTimeout(ok, 0));
  }
  return mergeAll(bundles);
}
export async function* readEntry(bundle, entry, signal) {
  checkAbort(signal); const source = bundle.sources.get(entry.relativePath);
  if (typeof source !== 'function') throw fileError('FT_READ_FAILED', entry.relativePath);
  let count = 0n;
  for await (const chunk of source(signal)) {
    checkAbort(signal);
    if (!(chunk instanceof Uint8Array) || chunk.byteLength > FILE_LIMITS.chunkBytes) throw fileError('FT_STREAM_INVALID', entry.relativePath);
    count += BigInt(chunk.byteLength);
    if (count > BigInt(entry.sizeBytes)) throw fileError('FT_SIZE_MISMATCH', entry.relativePath);
    if (chunk.byteLength) yield chunk;
  }
  checkAbort(signal);
  if (count !== BigInt(entry.sizeBytes)) throw fileError('FT_SIZE_MISMATCH', entry.relativePath);
}

export async function* readFrom(bundle,entry,offset,signal){
  const start=BigInt(offset);if(start<0n||start>BigInt(entry.sizeBytes))throw fileError('FT_SIZE_MISMATCH');const source=bundle.sources.get(entry.relativePath);let count=0n;
  if(source?.supportsRange){for await(const chunk of source(signal,Number(start))){checkAbort(signal);if(!(chunk instanceof Uint8Array)||chunk.length>FILE_LIMITS.chunkBytes)throw fileError('FT_STREAM_INVALID');count+=BigInt(chunk.length);if(count>BigInt(entry.sizeBytes)-start)throw fileError('FT_SIZE_MISMATCH');if(chunk.length)yield chunk;}}
  else{let skipped=0n;for await(const chunk of readEntry(bundle,entry,signal)){const length=BigInt(chunk.length);if(skipped+length<=start){skipped+=length;continue;}const bytes=chunk.subarray(Number(start>skipped?start-skipped:0n));skipped+=length;count+=BigInt(bytes.length);if(bytes.length)yield bytes;}}
  checkAbort(signal);if(count!==BigInt(entry.sizeBytes)-start)throw fileError('FT_SIZE_MISMATCH');
}
