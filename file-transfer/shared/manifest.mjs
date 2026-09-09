import { byteCount } from './contracts.mjs';
export const FILE_LIMITS = Object.freeze({ entries: 20000, depth: 64, pathBytes: 1024, componentBytes: 255, totalPathBytes: 8 * 1024 * 1024, chunkBytes: 1024 * 1024, memoryDownloadBytes: 128 * 1024 * 1024 });
const encoder = new TextEncoder();
export const fileError = (code, path = '') => Object.assign(new Error(code), { code, path });
export function checkAbort(signal) { if (signal?.aborted) throw fileError('FT_CANCELLED'); }
export function safePath(value) {
  if (typeof value !== 'string' || !value || value !== value.normalize('NFC') || /[\\<>:"|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw fileError('FT_UNSAFE_PATH', value);
  const parts = value.split('/');
  if (parts.length > FILE_LIMITS.depth || encoder.encode(value).length > FILE_LIMITS.pathBytes || parts.some(p => !p || p === '.' || p === '..' || /[. ]$/u.test(p) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(p) || encoder.encode(p).length > FILE_LIMITS.componentBytes)) throw fileError('FT_UNSAFE_PATH', value);
  return value;
}
export const pathKey = path => safePath(path).toUpperCase().toLowerCase().normalize('NFC');
export function renamedPath(path, attempt, directory = false) {
  const parts = safePath(path).split('/'); const name = parts.pop();
  const dot = directory ? -1 : name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name; const suffix = dot > 0 ? name.slice(dot) : '';
  // Leave space for the collision suffix, preserving the extension.
  let trimmed = stem;
  while (encoder.encode(`${trimmed} (${attempt})${suffix}`).length > FILE_LIMITS.componentBytes && trimmed.length) trimmed = Array.from(trimmed).slice(0, -1).join('');
  return safePath([...parts, `${trimmed} (${attempt})${suffix}`].join('/'));
}
export function validateManifest(manifest) {
  if (!manifest || Object.keys(manifest).sort().join(',') !== 'entries,version' || manifest.version !== 1 || !Array.isArray(manifest.entries) || manifest.entries.length > FILE_LIMITS.entries) throw fileError('FT_MANIFEST_INVALID');
  const seen = new Map(); let pathBytes = 0; let total = 0n; let files = 0; let directories = 0;
  for (const e of manifest.entries) {
    if (!e || Object.keys(e).sort().join(',') !== 'kind,modifiedAt,relativePath,sizeBytes' || !['file', 'directory'].includes(e.kind)) throw fileError('FT_MANIFEST_INVALID');
    const key = pathKey(e.relativePath);
    if (seen.has(key)) throw fileError('FT_PATH_CONFLICT', e.relativePath);
    seen.set(key, e); pathBytes += encoder.encode(e.relativePath).length;
    try { byteCount(e.sizeBytes); } catch { throw fileError('FT_MANIFEST_INVALID', e.relativePath); }
    if (e.modifiedAt !== null && (!Number.isSafeInteger(e.modifiedAt) || e.modifiedAt < 0 || e.modifiedAt > 8640000000000000)) throw fileError('FT_MANIFEST_INVALID', e.relativePath);
    if (e.kind === 'directory') { if (e.sizeBytes !== '0') throw fileError('FT_MANIFEST_INVALID', e.relativePath); directories++; }
    else { total += BigInt(e.sizeBytes); files++; }
  }
  if (pathBytes > FILE_LIMITS.totalPathBytes || total > 9223372036854775807n) throw fileError('FT_COLLECTION_LIMIT');
  const nonempty = new Set();
  for (const e of manifest.entries) {
    const parts = e.relativePath.split('/'); parts.pop();
    while (parts.length) {
      const path = parts.join('/'); const parent = seen.get(pathKey(path));
      if (!parent || parent.kind !== 'directory' || parent.relativePath !== path) throw fileError('FT_PATH_CONFLICT', e.relativePath);
      nonempty.add(path); parts.pop();
    }
  }
  return { files, directories, emptyDirectories: directories - nonempty.size, totalBytes: total.toString(), entries: seen.size };
}
export function policyWarnings(manifest, rule) {
  const stats = validateManifest(manifest); const reasons = [];
  if (!rule) return ['FT_POLICY_UNKNOWN'];
  if (!rule.send) reasons.push('FT_SEND_DENIED');
  if (stats.files > rule.maxFiles) reasons.push('FT_FILE_COUNT_LIMIT');
  if (rule.maxTaskBytes !== null && BigInt(stats.totalBytes) > BigInt(rule.maxTaskBytes)) reasons.push('FT_TASK_SIZE_LIMIT');
  if (rule.maxFileBytes !== null && manifest.entries.some(e => e.kind === 'file' && BigInt(e.sizeBytes) > BigInt(rule.maxFileBytes))) reasons.push('FT_FILE_SIZE_LIMIT');
  return reasons;
}
