import { assertRuntime, loadConfig } from '../server/config.mjs';
import { backup, verifyBackup, restoreBackup } from '../server/maintenance.mjs';
import { unlockStale } from '../server/runtime-lock.mjs';
try {
  assertRuntime();
  const [action, first, second, ...extra] = process.argv.slice(2); let result;
  if (extra.length) throw new Error('FT_MAINTENANCE_ARGUMENTS');
  if (action === 'backup' && first && second === '--stopped') result = await backup(loadConfig(), first);
  else if (action === 'verify' && first && !second) { const { manifest, payload, ...value } = await verifyBackup(first); result = value; }
  else if (action === 'restore' && first && second) result = await restoreBackup(first, second);
  else if (action === 'unlock-stale' && !first) result = unlockStale(loadConfig());
  else throw new Error('用法：maintenance.mjs backup <新备份目录> --stopped | verify <备份目录> | restore <备份目录> <不存在的恢复目录> | unlock-stale。备份前停止两个服务和本地维护／采集命令。');
  console.log(JSON.stringify(result));
} catch (e) { console.error(e.message?.startsWith('FT_') || e.message?.startsWith('用法') ? e.message : `FT_MAINTENANCE_FAILED: ${e.code ?? 'check-data-and-paths'}`); process.exitCode = 1; }
