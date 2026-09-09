import { loadConfig, assertRuntime } from '../server/config.mjs';
import { openStorage } from '../server/storage.mjs';
let storage;
try {
  assertRuntime();
  const [action, uid] = process.argv.slice(2);
  if (!['grant', 'revoke', 'list'].includes(action) || (action !== 'list' && !uid)) throw new Error('用法：node scripts/manage-admin.mjs grant|revoke <教师账号UID>，或 list');
  storage = openStorage(loadConfig());
  if (action !== 'list') storage.setManager(uid, action === 'grant');
  console.log(JSON.stringify({ status: 'ok', managers: storage.listManagers() }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { storage?.close(); }
