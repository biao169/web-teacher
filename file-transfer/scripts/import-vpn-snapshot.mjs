import { open, rename, unlink, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { loadConfig, assertRuntime } from '../server/config.mjs';
import { openStorage } from '../server/storage.mjs';

let storage, temporary;
try {
  assertRuntime(); const config = loadConfig(); storage = openStorage(config);
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 8192) throw new Error('FT_METER_INVALID'); chunks.push(chunk); }
  const sample = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (sample.kind !== 'snapshot') throw new Error('FT_METER_INVALID');
  // Same schema and source/period checks as the service; no credentials in input.
  storage.vpn.observe(sample, storage.readSettings().revision);
  const directory = join(config.dataPath, 'telemetry'), destination = join(directory, 'vpn-snapshot.json');
  const parent = await lstat(directory); if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('FT_METER_INVALID');
  temporary = join(directory, 'snapshot-' + randomUUID() + '.tmp');
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(sample) + '\n'); await file.sync(); } finally { await file.close(); }
  await rename(temporary, destination); temporary = null;
  console.log(JSON.stringify({ saved: true, observedAt: sample.observedAt, mode: 'estimated' }));
} catch (e) { console.error(e.code?.startsWith('FT_') ? e.code : 'FT_METER_INVALID'); process.exitCode = 1; }
finally { storage?.close(); if (temporary) await unlink(temporary).catch(() => {}); }
