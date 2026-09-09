import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fixture } from './helpers.mjs';
import { PROJECT_ROOT } from '../server/config.mjs';

test('copied service starts from a different cwd, passes CLI health, restarts and stops', { timeout: 15000 }, async t => {
  const { root } = fixture(t);
  const copied = join(root, '教师工具 test', 'file-transfer');
  mkdirSync(copied, { recursive: true });
  for (const name of ['server', 'shared', 'web/files', 'scripts', 'package.json']) cpSync(join(PROJECT_ROOT, name), join(copied, name), { recursive: true });
  // Copy only the small declared runtime dependencies, never machine paths.
  for (const name of ['ws', 'qrcode-generator']) cpSync(join(PROJECT_ROOT, 'node_modules', name), join(copied, 'node_modules', name), {recursive:true,dereference:true});
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  writeFileSync(join(copied, 'config.local.json'), JSON.stringify({ port }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('FT_')));
  const initialize = () => spawnSync(process.execPath, [join(copied, 'scripts/initialize-bridge.mjs')], { cwd: root, env, encoding: 'utf8', timeout: 4000 });
  const initialized = initialize(); assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(JSON.parse(initialized.stdout).keyCreated, true);
  const privateKey = readFileSync(join(copied, 'storage/data/teacher-signing-key.pkcs8'));
  const repeated = initialize(); assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).keyCreated, false);
  assert.deepEqual(readFileSync(join(copied, 'storage/data/teacher-signing-key.pkcs8')), privateKey);
  assert.ok(!initialized.stdout.includes(privateKey.toString('base64')));
  let originalDb;
  for (let pass = 0; pass < 2; pass++) {
    const child = spawn(process.execPath, [join(copied, 'scripts/start.mjs')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; } });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CLI startup timeout')), 4000);
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.includes('"event":"ready"')) { clearTimeout(timer); resolve(); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`CLI exited early: ${code}`)); });
    });
    const health = spawnSync(process.execPath, [join(copied, 'scripts/health.mjs')], { cwd: root, env, encoding: 'utf8', timeout: 4000 });
    assert.equal(health.status, 0, health.stderr);
    assert.equal(JSON.parse(health.stdout).transferAvailable, false);
    assert.equal(existsSync(join(root, 'storage')), false);
    child.kill('SIGTERM');
    const result = await exited;
    // On Windows TerminateProcess does not deliver POSIX SIGTERM to Node.
    if (process.platform !== 'win32') assert.equal(result.code, 0);
    else { const unlock = spawnSync(process.execPath, [join(copied, 'scripts/maintenance.mjs'), 'unlock-stale'], { cwd: root, env, encoding: 'utf8', timeout: 4000 }); assert.equal(unlock.status, 0, unlock.stderr); }
    const db = readFileSync(join(copied, 'storage/data/metadata.sqlite'));
    if (originalDb) assert.deepEqual(db, originalDb);
    originalDb = db;
  }
});
