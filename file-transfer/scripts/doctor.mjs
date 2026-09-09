import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { createPrivateKey, createPublicKey, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { assertRuntime, loadConfig, PROJECT_ROOT } from '../server/config.mjs';
import { readRuntimeLock } from '../server/runtime-lock.mjs';
import { integrateTeacher } from './integrate-teacher.mjs';
import { ROUTES, SERVICE } from '../shared/contracts.mjs';

const checks = [];
const add = (name, status, message) => checks.push({ name, status, message });
function check(name, fn) { try { fn(); } catch (e) { add(name, 'fail', e.message?.startsWith('FT_') ? e.message.split(':')[0] : (e.code ?? '检查失败')); } }
const arguments_ = process.argv.slice(2), live = arguments_.includes('--live');
const other = arguments_.filter(x => x !== '--live');
if (other.length > 1 || other.some(x => x.startsWith('--'))) { console.error('用法：node scripts/doctor.mjs [教师工程目录] [--live]'); process.exitCode = 1; }
else {
  check('runtime', () => { assertRuntime(); add('runtime', 'pass', `Node ${process.versions.node}`); });
  check('dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8')), require = createRequire(join(PROJECT_ROOT, 'package.json'));
    for (const [name, expected] of Object.entries(pkg.dependencies)) {
      let directory = dirname(require.resolve(name)), found;
      for (let i = 0; i < 6; i++) {
        const meta = join(directory, 'package.json');
        if (existsSync(meta)) { const value = JSON.parse(readFileSync(meta, 'utf8')); if (value.name === name) { found = value; break; } }
        directory = dirname(directory);
      }
      if (!found || found.version !== expected) throw new Error('FT_DEPENDENCY_VERSION');
    }
    add('dependencies', 'pass', '锁定的运行依赖已安装');
  });
  let config;
  check('config', () => { config = loadConfig(); add('config', 'pass', '启动配置有效'); });
  if (config) {
    check('storage-path', () => {
      let current = PROJECT_ROOT;
      for (const part of config.dataDirectory.split('/')) { current = join(current, part); const s = lstatSync(current); if (s.isSymbolicLink() || !s.isDirectory()) throw new Error('FT_STORAGE_PATH'); }
      add('storage-path', 'pass', '独立目录存在且无链接跳转');
    });
    check('identity-keys', () => {
      const path = join(config.dataPath, 'teacher-signing-key.pkcs8'), stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('FT_KEY_FILE');
      if (process.platform !== 'win32' && (stat.mode & 0o077)) throw new Error('FT_KEY_PERMISSIONS');
      const key = createPrivateKey({ key: readFileSync(path), format: 'der', type: 'pkcs8' });
      if (key.asymmetricKeyType !== 'ed25519' || createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64') !== config.bridgePublicKey) throw new Error('FT_KEY_MISMATCH');
      add('identity-keys', 'pass', '同机身份桥公私钥匹配；未输出密钥');
    });
    check('database', () => {
      const path = join(config.dataPath, 'metadata.sqlite'), stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('FT_DATABASE_FILE');
      for (const suffix of ['-wal','-shm','-journal']) if (existsSync(path + suffix)) { const s = lstatSync(path + suffix); if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) throw new Error('FT_DATABASE_FILE'); }
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        if (db.prepare('PRAGMA quick_check').all().some(row => Object.values(row)[0] !== 'ok')) throw new Error('FT_DATABASE_INTEGRITY');
        if (db.prepare("SELECT value FROM service_meta WHERE key='owner'").get()?.value !== SERVICE.name || db.prepare('PRAGMA user_version').get().user_version !== 8) throw new Error('FT_DATABASE_VERSION');
        add('database', 'pass', 'schema 8，完整性检查通过');
        const managers = db.prepare('SELECT count(*) AS n FROM admin_grants').get().n;
        add('managers', managers ? 'pass' : 'warn', managers ? '已配置工具管理员' : '尚未授予首个工具管理员');
        const settings = JSON.parse(db.prepare('SELECT document FROM tool_settings WHERE id=1').get().document);
        add('opening', settings.enabled ? 'pass' : 'warn', settings.enabled ? '工具已启用；具体链路仍按权限与路由核验' : '工具尚未开放，可在管理页设置');
        add('vpn-hard-limit', 'warn', '本版没有供应商出口硬截断，严格模式继续禁用计费链路');
      } finally { db.close(); }
    });
    check('runtime-lock', () => { const lock = readRuntimeLock(config); add('runtime-lock', lock ? 'warn' : 'pass', lock ? `数据目录已锁定（PID ${lock.pid}）；运行时正常，停机后残留需检查` : '数据目录当前没有服务／维护锁'); });
  }
  check('source-manifest', () => {
    const path = join(PROJECT_ROOT, 'SOURCE-MANIFEST.json');
    if (!existsSync(path)) return add('source-manifest', 'warn', '工作目录无发布哈希清单；交付源码包包含该文件');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    for (const [name, expected] of Object.entries(manifest)) {
      if (name.includes('\\') || name.split('/').some(x => !x || x === '..' || x === '.') || name.startsWith('/') || name.includes(':')) throw new Error('FT_SOURCE_PATH');
      const file = join(PROJECT_ROOT, name), st = lstatSync(file);
      if (!st.isFile() || st.isSymbolicLink() || createHash('sha256').update(readFileSync(file)).digest('hex') !== expected) throw new Error('FT_SOURCE_CHANGED');
    }
    add('source-manifest', 'pass', '发布清单中的文件哈希一致');
  });
  const teacher = resolve(other[0] ?? process.env.FT_TEACHER_ROOT ?? join(PROJECT_ROOT, '../academic-cms'));
  check('teacher-integration', () => {
    if (dirname(teacher) !== dirname(resolve(PROJECT_ROOT))) throw new Error('FT_TEACHER_SIBLING');
    const result = integrateTeacher(teacher, 'check');
    add('teacher-integration', result.changed.length ? 'fail' : 'pass', result.changed.length ? '教师工程尚未应用全部三处接入' : '三处接入已就位；未修改教师文件');
    add('teacher-build', existsSync(join(teacher, '.output/server/index.mjs')) ? 'pass' : 'warn', '生产包存在性检查；更新工具后仍必须重新构建');
  });
  if (live && config) {
    try {
      const host = config.host === '0.0.0.0' ? '127.0.0.1' : config.host === '::' ? '::1' : config.host;
      const response = await fetch(`http://${host.includes(':') ? '[' + host + ']' : host}:${config.port}${ROUTES.ready}`, { redirect: 'error', signal: AbortSignal.timeout(3000) });
      const body = await response.json();
      if (!response.ok || body.name !== SERVICE.name || body.version !== SERVICE.version || body.status !== 'ready') throw new Error();
      add('live-service', 'pass', '同版本独立服务已就绪');
    } catch { add('live-service', 'fail', '服务未就绪或版本不同；检查启动配置与端口'); }
  }
  const failed = checks.some(x => x.status === 'fail');
  console.log(JSON.stringify({ status: failed ? 'needs-attention' : 'checks-passed', version: SERVICE.version, readOnly: true, live, productionCertified: false, checks }, null, 2));
  if (failed) process.exitCode = 1;
}
