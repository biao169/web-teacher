import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { loadConfig, assertRuntime, PROJECT_ROOT } from '../server/config.mjs';
import { bridgeKey } from '../server/bridge-token.mjs';
try {
  assertRuntime();
  const action = process.argv[2] ?? 'dev';
  const teacher = resolve(process.argv[3] ?? process.env.FT_TEACHER_ROOT ?? join(PROJECT_ROOT, '../academic-cms'));
  if (!['dev', 'prepare', 'typecheck', 'build', 'start'].includes(action)) throw new Error('仅支持 dev / prepare / typecheck / build / start');
  if (!existsSync(join(teacher, 'nuxt.config.ts'))) throw new Error('未找到教师工程，请用第三个参数指定路径。');
  const config = loadConfig();
  const env = { ...process.env, FT_TEACHER_MODULE_ENABLED: 'true' };
  if (['dev', 'start'].includes(action)) {
    const keyPath = join(config.dataPath, 'teacher-signing-key.pkcs8');
    if (!existsSync(keyPath)) throw new Error('请先运行 node scripts/initialize-bridge.mjs');
    const key = readFileSync(keyPath).toString('base64'); bridgeKey(key, 'private');
    env.NUXT_FILE_TRANSFER_SIGNING_KEY = key;
    const host = ['0.0.0.0', '::'].includes(config.host) ? '127.0.0.1' : config.host;
    env.NUXT_FILE_TRANSFER_SERVICE_ORIGIN = `http://${host.includes(':') ? `[${host}]` : host}:${config.port}`;
  } else { delete env.NUXT_FILE_TRANSFER_SIGNING_KEY; }
  let args;
  if (action === 'build') args = [join(teacher, 'scripts/build-target.mjs'), 'ubuntu'];
  else if (action === 'start') args = [join(teacher, 'scripts/run-built-target.mjs'), 'start-ubuntu'];
  else {
    const require = createRequire(join(teacher, 'package.json'));
    args = [join(dirname(require.resolve('nuxt/package.json')), 'bin/nuxt.mjs'), action];
  }
  const child = spawn(process.execPath, args, { cwd: teacher, env, stdio: 'inherit', shell: false });
  child.on('error', () => { console.error('教师网站启动失败。'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  process.once('SIGINT', () => child.kill('SIGINT'));
  process.once('SIGTERM', () => child.kill('SIGTERM'));
} catch (error) { console.error(error.message); process.exitCode = 1; }
