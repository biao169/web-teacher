import { FILE_LIMITS, safePath, validateManifest, fileError, checkAbort } from '../../shared/manifest.mjs';
import { readEntry } from './collection.mjs';
import { zipChunks, zipSize } from './zip.mjs';
export const browserFileSupport = (scope = globalThis) => ({ directoryRead: scope.isSecureContext === true && typeof scope.showDirectoryPicker === 'function', directoryWrite: scope.isSecureContext === true && typeof scope.showDirectoryPicker === 'function', streamSave: scope.isSecureContext === true && typeof scope.showSaveFilePicker === 'function' });
export async function writeChunks(chunks, writable, { signal } = {}) {
  let size = 0n;
  try {
    for await (const bytes of chunks) { checkAbort(signal); await writable.write(bytes); size += BigInt(bytes.byteLength); }
    checkAbort(signal); await writable.close(); return size.toString();
  } catch (error) { try { await writable.abort(error); } catch { /* preserve original failure */ } throw error; }
}
export async function boundedBlob(chunks, expectedBytes, { signal, maximumBytes = FILE_LIMITS.memoryDownloadBytes, type = 'application/octet-stream' } = {}) {
  if (BigInt(expectedBytes) > BigInt(maximumBytes)) throw fileError('FT_MEMORY_LIMIT');
  const parts = []; let size = 0;
  for await (const bytes of chunks) { checkAbort(signal); size += bytes.byteLength; if (size > maximumBytes) throw fileError('FT_MEMORY_LIMIT'); parts.push(bytes.slice()); }
  checkAbort(signal); if (BigInt(size) !== BigInt(expectedBytes)) throw fileError('FT_SIZE_MISMATCH');
  return new Blob(parts, { type });
}
// Bound the aggregate memory retained by recent fallback downloads too, not
// only a single export. Native streaming saves do not use this budget.
const downloadBudgets = new WeakMap();
function reserveDownload(scope, size) {
  let budget = downloadBudgets.get(scope);
  if (!budget) { budget = { used: 0n }; downloadBudgets.set(scope, budget); }
  const bytes = BigInt(size);
  if (bytes > BigInt(FILE_LIMITS.memoryDownloadBytes)) throw fileError('FT_MEMORY_LIMIT');
  if (budget.used + bytes > BigInt(FILE_LIMITS.memoryDownloadBytes)) throw fileError('FT_DOWNLOAD_BUSY');
  budget.used += bytes; let released = false;
  return () => { if (!released) { budget.used -= bytes; released = true; } };
}
export function offerBlob(blob, name, scope = globalThis, release = reserveDownload(scope, blob.size)) {
  let url; let a;
  try {
    safePath(name); if (name.includes('/')) throw fileError('FT_UNSAFE_PATH', name);
    url = scope.URL.createObjectURL(blob); a = scope.document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none'; scope.document.body.append(a);
    a.click();
    scope.setTimeout(() => { scope.URL.revokeObjectURL(url); release(); }, 60000);
    return { status: 'download-requested', name };
  } catch (error) { if (url) scope.URL.revokeObjectURL(url); release(); throw error; }
  finally { a?.remove(); }
}
async function fallbackDownload(chunks, expected, name, scope, options = {}) {
  const release = reserveDownload(scope, expected);
  try { const blob = await boundedBlob(chunks, expected, options); return offerBlob(blob, name, scope, release); }
  catch (error) { release(); throw error; }
}
export function exportName(suffix = '.zip') { return 'transfer-' + new Date().toISOString().replace(/[:.]/gu, '-').slice(0, 19) + suffix; }
export async function saveZip(bundle, { scope = globalThis, signal, onProgress } = {}) {
  const size = zipSize(bundle.manifest); checkAbort(signal); const name = exportName();
  if (browserFileSupport(scope).streamSave) {
    // Invoked before any await to preserve the click's transient activation.
    const handle = await scope.showSaveFilePicker({ suggestedName: name, types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }] });
    checkAbort(signal); const writer = await handle.createWritable();
    await writeChunks(zipChunks(bundle, { signal, onProgress }), writer, { signal });
    return { status: 'saved', name: handle.name || name };
  }
  return fallbackDownload(zipChunks(bundle, { signal, onProgress }), size, name, scope, { signal, type: 'application/zip' });
}
export async function saveSingle(bundle, entry, { scope = globalThis, signal, onProgress = () => {} } = {}) {
  validateManifest(bundle.manifest);
  if (entry.kind !== 'file' || !bundle.manifest.entries.includes(entry)) throw fileError('FT_MANIFEST_INVALID');
  const name = entry.relativePath.split('/').pop();
  async function* chunks() { let bytes = 0n; for await (const chunk of readEntry(bundle, entry, signal)) { yield chunk; bytes += BigInt(chunk.length); onProgress({ bytes: bytes.toString(), totalBytes: entry.sizeBytes, path: entry.relativePath }); } }
  checkAbort(signal);
  if (browserFileSupport(scope).streamSave) {
    const handle = await scope.showSaveFilePicker({ suggestedName: name }); checkAbort(signal);
    await writeChunks(chunks(), await handle.createWritable(), { signal }); return { status: 'saved', name: handle.name || name };
  }
  return fallbackDownload(chunks(), entry.sizeBytes, name, scope, { signal });
}
export async function writeDirectory(bundle, root, { signal, onProgress = () => {}, containerName = 'transfer-' + crypto.randomUUID() } = {}) {
  const stats = validateManifest(bundle.manifest); safePath(containerName);
  if (containerName.includes('/')) throw fileError('FT_UNSAFE_PATH', containerName);
  checkAbort(signal);
  // A fresh, randomly named container keeps existing destination files intact.
  try { await root.getDirectoryHandle(containerName); throw fileError('FT_DESTINATION_EXISTS', containerName); }
  catch (error) { if (error.name !== 'NotFoundError') throw error; }
  checkAbort(signal);
  const container = await root.getDirectoryHandle(containerName, { create: true }); const dirs = new Map([['', container]]); let complete = 0; let bytes = 0n;
  async function directory(path) {
    if (dirs.has(path)) return dirs.get(path);
    const parts = path.split('/'); const name = parts.pop(); const parent = await directory(parts.join('/')); checkAbort(signal);
    try { await parent.getDirectoryHandle(name); throw fileError('FT_DESTINATION_EXISTS', path); } catch (error) { if (error.name !== 'NotFoundError') throw error; }
    const handle = await parent.getDirectoryHandle(name, { create: true }); dirs.set(path, handle); return handle;
  }
  try {
    for (const entry of bundle.manifest.entries) {
      checkAbort(signal);
      if (entry.kind === 'directory') { await directory(entry.relativePath); continue; }
      const parts = entry.relativePath.split('/'); const name = parts.pop(); const parent = await directory(parts.join('/'));
      try { await parent.getFileHandle(name); throw fileError('FT_DESTINATION_EXISTS', entry.relativePath); } catch (error) { if (error.name !== 'NotFoundError') throw error; }
      const handle = await parent.getFileHandle(name, { create: true }); const writable = await handle.createWritable();
      async function* chunks() { for await (const chunk of readEntry(bundle, entry, signal)) { yield chunk; bytes += BigInt(chunk.length); onProgress({ bytes: bytes.toString(), totalBytes: stats.totalBytes, path: entry.relativePath }); } }
      await writeChunks(chunks(), writable, { signal }); complete++;
    }
    return { status: 'saved', name: containerName, files: complete, bytes: bytes.toString() };
  } catch (error) { error.partialDirectory = containerName; error.completedFiles = complete; throw error; }
}
export async function saveDirectory(bundle, { scope = globalThis, signal, onProgress } = {}) {
  validateManifest(bundle.manifest); checkAbort(signal);
  if (!browserFileSupport(scope).directoryWrite) throw fileError('FT_DIRECTORY_UNSUPPORTED');
  const root = await scope.showDirectoryPicker({ mode: 'readwrite' }); checkAbort(signal);
  return writeDirectory(bundle, root, { signal, onProgress });
}
