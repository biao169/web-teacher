import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, realpath, readdir, mkdir, readFile, writeFile, rm, chmod, statfs } from 'node:fs/promises';
import { resolve, relative, join, dirname, basename, sep, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import { SERVICE } from '../shared/contracts.mjs';
import { validateConfig } from './config.mjs';
import { acquireRuntimeLock } from './runtime-lock.mjs';

const fail = code => { throw new Error(code); };
const inside = (parent, child) => { const p = relative(parent, child); return !p || (!p.startsWith('..' + sep) && p !== '..' && !isAbsolute(p)); };
function safeName(name) {
  if (typeof name !== 'string' || !name || name.length > 4096 || name.includes('\\') || isAbsolute(name) || name.split('/').some(p => !p || p === '.' || p === '..' || /[\x00-\x1f:<>"|?*]/u.test(p) || /[. ]$/u.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(p))) fail('FT_BACKUP_PATH');
  return name;
}
async function regular(path) {
  const s = await lstat(path);
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) fail('FT_BACKUP_FILE');
  return s;
}
async function hash(path) {
  const before = await regular(path), h = createHash('sha256'); let bytes = 0n;
  for await (const chunk of createReadStream(path, { highWaterMark: 1024 * 1024 })) { h.update(chunk); bytes += BigInt(chunk.length); }
  const after = await regular(path);
  if (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes !== BigInt(after.size)) fail('FT_BACKUP_CHANGED');
  return { bytes: bytes.toString(), sha256: h.digest('hex') };
}
async function walk(root, prefix = '', result = [], skipLock = false) {
  const s = await lstat(root); if (!s.isDirectory() || s.isSymbolicLink()) fail('FT_BACKUP_DIRECTORY');
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (skipLock && !prefix && entry.name === 'runtime.lock') continue;
    const name = safeName(prefix ? prefix + '/' + entry.name : entry.name);
    if (entry.isDirectory()) await walk(join(root, entry.name), name, result);
    else { await regular(join(root, entry.name)); result.push(name); if (result.length > 100000) fail('FT_BACKUP_TOO_MANY'); }
  }
  return result;
}
async function newDestination(input, forbidden) {
  const candidate = resolve(input), parent = await realpath(dirname(candidate));
  const path = join(parent, basename(candidate));
  for (const from of forbidden) if (inside(await realpath(from), path) || inside(path, await realpath(from))) fail('FT_BACKUP_DESTINATION');
  // mkdir without recursive is an atomic no-overwrite reservation.
  await mkdir(path, { mode: 0o700 });
  return path;
}
async function copyFile(source, destination) {
  const before = await regular(source);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await pipeline(createReadStream(source, { highWaterMark: 1024 * 1024 }), createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
  const after = await regular(source);
  if (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail('FT_BACKUP_CHANGED');
}
function inspectDatabase(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    // The service uses DELETE journaling. Do not copy a custom WAL database as a standalone snapshot.
    if (db.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete') fail('FT_BACKUP_JOURNAL');
    if (db.prepare('PRAGMA quick_check').all().some(row => Object.values(row)[0] !== 'ok')) fail('FT_BACKUP_DATABASE');
    if (db.prepare("SELECT value FROM service_meta WHERE key='owner'").get()?.value !== SERVICE.name) fail('FT_BACKUP_OWNER');
    const schema = db.prepare('PRAGMA user_version').get().user_version;
    if (schema !== 8) fail('FT_BACKUP_SCHEMA');
    return schema;
  } finally { db.close(); }
}
export async function backup(config, destination) {
  const release = acquireRuntimeLock(config, 'backup'); let output, db;
  try {
    // An exclusive database transaction also blocks concurrent local admin writes.
    const dbPath = join(config.dataPath, 'metadata.sqlite'); await regular(dbPath); inspectDatabase(dbPath);
    db = new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout=100; BEGIN EXCLUSIVE');
    const names = await walk(config.dataPath, '', [], true);
    let total = 0n;
    for (const name of names) total += BigInt((await regular(join(config.dataPath, name))).size);
    const space = await statfs(dirname(resolve(destination)), { bigint: true });
    if (space.bavail * space.bsize < total + 16n * 1024n * 1024n) fail('FT_BACKUP_SPACE');
    output = await newDestination(destination, [config.projectRoot]);
    const payload = join(output, 'payload'); await mkdir(payload, { mode: 0o700 });
    const portable = Object.fromEntries(['configVersion','host','port','dataDirectory','bridgePublicKey'].map(k => [k, config[k]]));
    await writeFile(join(payload, 'config.local.json'), JSON.stringify(portable, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    for (const name of names) await copyFile(join(config.dataPath, name), join(payload, config.dataDirectory, name));
    const files = [];
    for (const name of await walk(payload)) files.push({ path: name, ...await hash(join(payload, name)) });
    const manifest = { format: 1, owner: SERVICE.name, version: SERVICE.version, schema: 8, createdAt: new Date().toISOString(), files };
    await writeFile(join(output, 'BACKUP-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await verifyBackup(output);
    return { status: 'backed-up', destination: output, files: files.length, dataBytes: total.toString(), includesPrivateData: true };
  } catch (e) { if (output) await rm(output, { recursive: true, force: true }); throw e; }
  finally { try { if (db) { db.exec('ROLLBACK'); db.close(); } } finally { release(); } }
}
export async function verifyBackup(input) {
  const root = resolve(input); const s = await lstat(root); if (!s.isDirectory() || s.isSymbolicLink()) fail('FT_BACKUP_DIRECTORY');
  const meta = join(root, 'BACKUP-MANIFEST.json'); if ((await regular(meta)).size > 32 * 1024 * 1024) fail('FT_BACKUP_MANIFEST');
  const manifest = JSON.parse(await readFile(meta, 'utf8'));
  if (manifest.format !== 1 || manifest.owner !== SERVICE.name || manifest.schema !== 8 || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 100000) fail('FT_BACKUP_MANIFEST');
  const payload = join(root, 'payload'), actual = await walk(payload), inventory = new Set(actual), names = new Set();
  for (const item of manifest.files) {
    const name = safeName(item.path), lower = name.toLowerCase();
    if (names.has(lower) || !/^[a-f0-9]{64}$/u.test(item.sha256) || !/^(0|[1-9][0-9]{0,18})$/u.test(item.bytes)) fail('FT_BACKUP_MANIFEST');
    names.add(lower);
  }
  if (actual.length !== manifest.files.length || !manifest.files.every(item => inventory.has(item.path))) fail('FT_BACKUP_INVENTORY');
  for (const item of manifest.files) {
    const got = await hash(join(payload, item.path));
    if (got.bytes !== item.bytes || got.sha256 !== item.sha256) fail('FT_BACKUP_HASH');
  }
  const config = validateConfig(JSON.parse(await readFile(join(payload, 'config.local.json'), 'utf8')), payload);
  if (actual.some(name => name !== 'config.local.json' && !name.startsWith(config.dataDirectory + '/'))) fail('FT_BACKUP_SCOPE');
  if (actual.includes(config.dataDirectory + '/runtime.lock')) fail('FT_BACKUP_LOCK');
  const schema = inspectDatabase(join(config.dataPath, 'metadata.sqlite'));
  return { status: 'verified', root, payload, files: manifest.files.length, schema, manifest };
}
export async function restoreBackup(input, destination) {
  const verified = await verifyBackup(input); let output;
  try {
    output = await newDestination(destination, [verified.root]);
    for (const item of verified.manifest.files) await copyFile(join(verified.payload, item.path), join(output, item.path));
    for (const item of verified.manifest.files) {
      const got = await hash(join(output, item.path));
      if (got.sha256 !== item.sha256 || got.bytes !== item.bytes) fail('FT_BACKUP_CHANGED');
    }
    if (process.platform !== 'win32') await chmod(output, 0o700);
    return { status: 'restored-to-new-directory', destination: output, files: verified.files, existingDataOverwritten: false };
  } catch (e) { if (output) await rm(output, { recursive: true, force: true }); throw e; }
}
