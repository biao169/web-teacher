// Uncompressed ZIP / ZIP64 with UTF-8 names and streaming data descriptors.
// The ZIP format specification is documented in docs/files.md.
import { validateManifest, checkAbort, fileError } from '../../shared/manifest.mjs';
import { readEntry } from './collection.mjs';
const U32 = 0xffffffffn; const utf8 = new TextEncoder();
const table = Uint32Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crcUpdate(crc, bytes) { for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); return crc; }
function block(size) { const bytes = new Uint8Array(size); const view = new DataView(bytes.buffer); return { bytes, u16: (p, v) => view.setUint16(p, v, true), u32: (p, v) => view.setUint32(p, Number(v), true), u64: (p, v) => view.setBigUint64(p, BigInt(v), true) }; }
function dosTime(timestamp) {
  const d = new Date(timestamp ?? Date.UTC(1980, 0, 1)); const year = Math.min(2107, Math.max(1980, d.getUTCFullYear()));
  return { time: d.getUTCHours() << 11 | d.getUTCMinutes() << 5 | Math.floor(d.getUTCSeconds() / 2), date: (year - 1980) << 9 | (d.getUTCMonth() + 1) << 5 | d.getUTCDate() };
}
function extra(values) { if (!values.length) return new Uint8Array(); const b = block(4 + values.length * 8); b.u16(0, 1); b.u16(2, values.length * 8); values.forEach((v, i) => b.u64(4 + i * 8, v)); return b.bytes; }
function info(entry, offset, forceZip64) {
  const directory = entry.kind === 'directory'; const size = BigInt(entry.sizeBytes); const name = utf8.encode(entry.relativePath + (directory ? '/' : ''));
  const zip64 = forceZip64 || size >= U32; const zipOffset = forceZip64 || offset >= U32;
  return { directory, size, name, offset, zip64, zipOffset, flags: directory ? 0x0800 : 0x0808, ...dosTime(entry.modifiedAt) };
}
function local(i) {
  const ext = extra(i.zip64 ? [i.size, i.size] : []); const b = block(30 + i.name.length + ext.length);
  b.u32(0, 0x04034b50); b.u16(4, i.zip64 ? 45 : 20); b.u16(6, i.flags); b.u16(8, 0); b.u16(10, i.time); b.u16(12, i.date);
  b.u32(18, i.zip64 ? U32 : i.size); b.u32(22, i.zip64 ? U32 : i.size); b.u16(26, i.name.length); b.u16(28, ext.length);
  b.bytes.set(i.name, 30); b.bytes.set(ext, 30 + i.name.length); return b.bytes;
}
function descriptor(i, crc) { const b = block(i.zip64 ? 24 : 16); b.u32(0, 0x08074b50); b.u32(4, crc); if (i.zip64) { b.u64(8, i.size); b.u64(16, i.size); } else { b.u32(8, i.size); b.u32(12, i.size); } return b.bytes; }
function central(i, crc) {
  const ext = extra([...(i.zip64 ? [i.size, i.size] : []), ...(i.zipOffset ? [i.offset] : [])]); const b = block(46 + i.name.length + ext.length);
  b.u32(0, 0x02014b50); b.u16(4, 3 << 8 | 45); b.u16(6, i.zip64 || i.zipOffset ? 45 : 20); b.u16(8, i.flags); b.u16(10, 0); b.u16(12, i.time); b.u16(14, i.date); b.u32(16, crc);
  b.u32(20, i.zip64 ? U32 : i.size); b.u32(24, i.zip64 ? U32 : i.size); b.u16(28, i.name.length); b.u16(30, ext.length);
  b.u32(38, i.directory ? ((0o40755 << 16) | 0x10) >>> 0 : (0o100644 << 16) >>> 0); b.u32(42, i.zipOffset ? U32 : i.offset);
  b.bytes.set(i.name, 46); b.bytes.set(ext, 46 + i.name.length); return b.bytes;
}
function endings(count, offset, length, force) {
  const parts = []; const zip64 = force || count >= 65535 || offset >= U32 || length >= U32;
  if (zip64) {
    const b = block(56); b.u32(0, 0x06064b50); b.u64(4, 44n); b.u16(12, 45); b.u16(14, 45); b.u64(24, count); b.u64(32, count); b.u64(40, length); b.u64(48, offset); parts.push(b.bytes);
    const locator = block(20); locator.u32(0, 0x07064b50); locator.u64(8, offset + length); locator.u32(16, 1); parts.push(locator.bytes);
  }
  const end = block(22); end.u32(0, 0x06054b50); end.u16(8, Math.min(count, 65535)); end.u16(10, Math.min(count, 65535)); end.u32(12, length >= U32 ? U32 : length); end.u32(16, offset >= U32 ? U32 : offset); parts.push(end.bytes); return parts;
}
export function zipSize(manifest, { forceZip64 = false } = {}) {
  validateManifest(manifest); let offset = 0n; let centralSize = 0n;
  for (const entry of manifest.entries) { const i = info(entry, offset, forceZip64); offset += BigInt(local(i).length) + i.size + BigInt(i.directory ? 0 : descriptor(i, 0).length); centralSize += BigInt(central(i, 0).length); }
  return offset + centralSize + BigInt(endings(manifest.entries.length, offset, centralSize, forceZip64).reduce((n, b) => n + b.length, 0));
}
export async function* zipChunks(bundle, { signal, onProgress = () => {}, forceZip64 = false } = {}) {
  const stats = validateManifest(bundle.manifest); const total = BigInt(stats.totalBytes); const centralParts = []; let offset = 0n; let payload = 0n;
  for (const entry of bundle.manifest.entries) {
    checkAbort(signal); const i = info(entry, offset, forceZip64); const head = local(i); yield head; offset += BigInt(head.length); let crc = 0xffffffff;
    if (!i.directory) {
      for await (const bytes of readEntry(bundle, entry, signal)) { crc = crcUpdate(crc, bytes); yield bytes; offset += BigInt(bytes.length); payload += BigInt(bytes.length); onProgress({ bytes: payload.toString(), totalBytes: total.toString(), path: entry.relativePath }); }
      const footer = descriptor(i, (crc ^ 0xffffffff) >>> 0); yield footer; offset += BigInt(footer.length);
    }
    centralParts.push(central(i, i.directory ? 0 : (crc ^ 0xffffffff) >>> 0));
  }
  const centralOffset = offset;
  for (const bytes of centralParts) { checkAbort(signal); yield bytes; offset += BigInt(bytes.length); }
  for (const bytes of endings(bundle.manifest.entries.length, centralOffset, offset - centralOffset, forceZip64)) { checkAbort(signal); yield bytes; }
}
