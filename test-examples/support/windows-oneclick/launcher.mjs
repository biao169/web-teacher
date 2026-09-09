import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, readdirSync, rmSync, lstatSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { createServer } from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODES = new Set(['start-teacher', 'start-both', 'init-teacher', 'init-both']);
const SECRET_KEYS = ['NUXT_AUTH_SECRET', 'NUXT_AUTH_BOOTSTRAP_TOKEN', 'NUXT_MEDIA_GRANT_SECRET'];
const DEMO = 'data/oneclick-demo.sqlite3';
const CREDENTIALS = 'data/oneclick-demo-login.txt';
const STATE = 'data/windows-oneclick-state.json';
const FT_MODULE_WINDOWS_PATH = "fileURLToPath(new URL('../file-transfer/integration/teacher-site/module.mjs', import.meta.url))";
const FT_MODULE_FILE_URL = "new URL('../file-transfer/integration/teacher-site/module.mjs', import.meta.url).href";
const FT_INTERNAL_PATH_REPAIRS = [
  ['const local = relative => fileURLToPath(new URL(relative, import.meta.url));', "const local = relative => fileURLToPath(new URL(relative, import.meta.url)).replaceAll('\\\\', '/');"],
  ["'#ft-teacher-auth': resolve(nuxt.options.rootDir, 'server/utils/auth-runtime.ts'),", "'#ft-teacher-auth': resolve(nuxt.options.rootDir, 'server/utils/auth-runtime.ts').replaceAll('\\\\', '/'),"],
  ["'#ft-teacher-auth-http': resolve(nuxt.options.rootDir, 'server/utils/auth-http.ts'),", "'#ft-teacher-auth-http': resolve(nuxt.options.rootDir, 'server/utils/auth-http.ts').replaceAll('\\\\', '/'),"],
  ["'#ft-teacher-bounded-json': resolve(nuxt.options.rootDir, 'server/utils/bounded-json.ts'),", "'#ft-teacher-bounded-json': resolve(nuxt.options.rootDir, 'server/utils/bounded-json.ts').replaceAll('\\\\', '/'),"],
];
const DEFAULTS = { teacherDirectory: '', teacherDatabase: '', port: 8005, openBrowser: true, autoInstall: true, nodePath: '', pnpmPath: '', pythonPath: '' };

export function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw new Error(`无法读取 JSON：${path}`, { cause: error }); }
}
export function readOptions(base) {
  const input = readJson(join(base, 'windows-oneclick.config.json'), {});
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('启动配置必须是 JSON 对象。');
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULTS, key)) throw new Error(`未知启动配置：${key}`);
  const options = { ...DEFAULTS, ...input };
  for (const key of ['teacherDirectory', 'teacherDatabase', 'nodePath', 'pnpmPath', 'pythonPath']) if (typeof options[key] !== 'string') throw new Error(`${key} 必须为字符串。`);
  for (const key of ['openBrowser', 'autoInstall']) if (typeof options[key] !== 'boolean') throw new Error(`${key} 必须为 true 或 false。`);
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error('网站端口须为 1024–65535 的整数。');
  return options;
}
function projectName(path) {
  try { return readJson(join(path, 'package.json')).name; } catch { return ''; }
}
export function locateTeacher(base, configured = '') {
  if (configured) {
    const path = resolve(base, configured);
    if (projectName(path) !== 'academic-cms') throw new Error(`teacherDirectory 不是教师工程：${path}`);
    return path;
  }
  if (projectName(base) === 'academic-cms') return base;
  const candidates = readdirSync(base, { withFileTypes: true }).filter(item => item.isDirectory() && projectName(join(base, item.name)) === 'academic-cms').map(item => join(base, item.name));
  if (candidates.length !== 1) throw new Error(candidates.length ? '发现多个教师工程，请在 windows-oneclick.config.json 中填写 teacherDirectory。' : '找不到教师工程。请将脚本包解压到 academic-cms（或 web-test）文件夹的上一级。');
  return candidates[0];
}
function privateFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, contents, { flag: 'wx', mode: 0o600 }); renameSync(temp, path); }
  finally { try { unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}
export function acquireLock(teacher) {
  const path = join(teacher, 'data/windows-oneclick.lock');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const owner = { pid: process.pid, token: randomUUID() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try { writeFileSync(path, JSON.stringify(owner), { flag: 'wx', mode: 0o600 }); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = readJson(path);
      if (!Number.isSafeInteger(previous.pid) || previous.pid < 1 || typeof previous.token !== 'string') throw new Error('一键运行锁文件异常，请先确认旧启动窗口已关闭。');
      let alive = true;
      try { process.kill(previous.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
      if (alive) throw new Error('已有一键启动或初始化正在运行，请先关闭原窗口，不要重复双击。');
      if (readJson(path).token !== previous.token) throw new Error('运行状态已变化，请重试。');
      unlinkSync(path);
      if (attempt === 1) throw new Error('无法取得启动锁，请重试。');
    }
  }
  return () => { try { if (readJson(path).token === owner.token) unlinkSync(path); } catch (error) { if (!error.cause || error.cause.code !== 'ENOENT') throw error; } };
}
export async function assertPortFree(port, host = '127.0.0.1') {
  await new Promise((accept, reject) => {
    const server = createServer();
    server.once('error', error => reject(new Error(`端口 ${host}:${port} 已被占用或不可用，请先关闭原服务；脚本不会终止其他程序。`, { cause: error })));
    server.listen({ host, port, exclusive: true }, () => server.close(accept));
  });
}
function environment(teacher, options, both) {
  const local = existsSync(join(teacher, '.env')) ? parseEnv(readFileSync(join(teacher, '.env'), 'utf8')) : {};
  const env = { ...local, ...process.env };
  const secretsPath = join(teacher, 'data/windows-oneclick-secrets.json');
  const saved = readJson(secretsPath, {});
  let changed = false;
  for (const key of SECRET_KEYS) {
    if (!env[key]?.trim()) {
      if (!saved[key]) { saved[key] = randomBytes(48).toString('base64url'); changed = true; }
      env[key] = saved[key];
    }
  }
  if (changed) privateFile(secretsPath, JSON.stringify(saved, null, 2) + '\n');
  const state = readJson(join(teacher, STATE), {});
  const database = options.teacherDatabase || state.database || env.CMS_DATABASE_PATH || 'data/site.sqlite3';
  if (typeof database !== 'string' || !database.trim() || database === ':memory:') throw new Error('教师数据库路径无效。');
  const url = `http://127.0.0.1:${options.port}`;
  Object.assign(env, {
    NODE_ENV: 'development', NITRO_PRESET: 'node-server', NUXT_RUNTIME_KIND: 'node',
    NUXT_HOST: '127.0.0.1', NUXT_PORT: String(options.port), NITRO_HOST: '127.0.0.1', NITRO_PORT: String(options.port),
    CMS_DATABASE_PATH: resolve(teacher, database), NUXT_AUTH_TRUSTED_ORIGINS: url,
    NUXT_AUTH_SECURE_COOKIES: 'false', NUXT_PUBLIC_SITE_URL: url, NUXT_CACHE_ORIGIN: url,
    FT_TEACHER_MODULE_ENABLED: both ? 'true' : 'false',
  });
  // Only teacher.mjs reads and injects the private bridge key for the teacher child.
  delete env.NUXT_FILE_TRANSFER_SIGNING_KEY;
  delete env.NUXT_FILE_TRANSFER_SERVICE_ORIGIN;
  return env;
}
export class Processes {
  children = new Set();
  stopping = false;
  stopPromise;
  start(executable, args, options = {}) {
    if (this.stopping) throw new Error('正在停止。');
    const capture = options.capture === true;
    const child = spawn(executable, args, { cwd: options.cwd, env: options.env, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    const item = { child, finished: false, output: '', errors: '' };
    this.children.add(item);
    if (capture) {
      for (const [stream, key] of [[child.stdout, 'output'], [child.stderr, 'errors']]) stream.setEncoding('utf8').on('data', part => {
        if (item[key].length < 1_000_000) item[key] += part;
      });
    }
    item.done = new Promise((accept, reject) => {
      child.once('error', error => { item.finished = true; this.children.delete(item); reject(new Error(`无法运行 ${executable}：${error.message}`)); });
      child.once('exit', (code, signal) => {
        item.finished = true; this.children.delete(item);
        if (code === 0 || this.stopping) accept(item.output);
        else reject(new Error(`子程序退出（${signal || code}）。${capture ? '\n' + item.errors.slice(-6000) : '请查看上方错误。'}`));
      });
    });
    item.done.catch(() => {});
    return item;
  }
  run(executable, args, options) { return this.start(executable, args, options).done; }
  stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true;
    this.stopPromise = this.stopChildren();
    return this.stopPromise;
  }
  async stopChildren() {
    const running = [...this.children];
    await Promise.allSettled(running.map(async item => {
      if (item.finished) return;
      // Windows taskkill is restricted to the exact process tree started by this launcher.
      if (process.platform === 'win32') {
        await new Promise(done => {
          const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(item.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
          killer.once('exit', done); killer.once('error', done);
        });
      } else {
        try { process.kill(-item.child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        await Promise.race([item.done.catch(() => {}), new Promise(r => setTimeout(r, 3500))]);
        // The wrapper may exit before its grandchildren. Target only our dedicated group.
        try { process.kill(-item.child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }));
  }
}
function projectRequire(project) { return createRequire(join(project, 'package.json')); }
export function resolvePnpmOperation(args) {
  if (args.length === 1 && args[0] === '--version') return 'version';
  if (args.length === 3 && args[0] === 'install' && args[1] === '--frozen-lockfile' && args[2] === '--ignore-scripts') return 'install';
  throw new Error('内部依赖操作不受支持。');
}
async function pnpm(run, project, args, env) {
  const operation = resolvePnpmOperation(args);
  if (process.platform !== 'win32') return run.run(process.env.ONECLICK_TEST_PNPM || 'pnpm', args, { cwd: project, env, capture: operation === 'version' });
  return run.run(join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'pnpm.ps1')], {
    cwd: project, env: { ...env, ONECLICK_PNPM_OPERATION: operation }, capture: operation === 'version',
  });
}
async function ensureDependencies(run, project, env, options, teacher) {
  const required = teacher ? ['nuxt/package.json', 'tsx', 'better-sqlite3'] : ['ws', 'qrcode-generator'];
  const signature = createHash('sha256').update(readFileSync(join(project, 'package.json'))).update(readFileSync(join(project, 'pnpm-lock.yaml'))).digest('hex');
  const stampPath = join(project, teacher ? 'data/windows-oneclick-dependencies.json' : 'storage/windows-oneclick-dependencies.json');
  const stamp = readJson(stampPath, {});
  const ready = () => { try { const r = projectRequire(project); required.forEach(name => r.resolve(name)); return true; } catch { return false; } };
  if (!ready() || (stamp.signature && stamp.signature !== signature)) {
    if (!options.autoInstall) throw new Error(`依赖缺失或版本已变化：请在 ${project} 运行 pnpm install --frozen-lockfile --ignore-scripts。`);
    const version = (await pnpm(run, project, ['--version'], env)).trim();
    if (!/^11\.(?:19|[2-9]\d|\d{3,})\.\d+(?:\s*)$/u.test(version)) throw new Error(`pnpm 版本不匹配：${version || '未找到'}；要求 >=11.19.0 <12。`);
    console.log(`[依赖] ${project}：首次安装可能需要几分钟，请保持联网。`);
    await pnpm(run, project, ['install', '--frozen-lockfile', '--ignore-scripts'], env);
  } else console.log(`[依赖] 复用 ${teacher ? '教师网站' : '文件快传'} 已安装依赖。`);
  if (!ready()) throw new Error(`安装后依赖仍不完整：${project}`);
  if (teacher) {
    try { const Database = projectRequire(project)('better-sqlite3'); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close(); }
    catch { throw new Error('SQLite 原生驱动无法加载。请确认 Node.js 24.19.0 及匹配当前 Windows 架构的锁定依赖；不会继续写入数据。'); }
  }
  privateFile(stampPath, JSON.stringify({ signature }) + '\n');
}
export function inspectDemo(teacher, database) {
  const Database = projectRequire(teacher)('better-sqlite3');
  const db = new Database(database, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('演示库完整性检查失败。');
    if (!db.prepare('SELECT dataset_version FROM demo_seed_state LIMIT 1').get()) throw new Error('该文件不是已完成的演示库。');
    const user = db.prepare("SELECT u.uid, u.status, u.must_change_password, r.is_active, r.uid AS role_uid FROM auth_users u JOIN auth_roles r ON r.uid=u.role_uid WHERE u.username='demo_admin' COLLATE NOCASE").get();
    if (!user || user.status !== 'active' || user.is_active !== 1 || user.role_uid !== 'role:system-administrator') throw new Error('演示管理员缺失、停用或角色已改变；初始化不会重置账号，请使用现有管理员处理。');
    return user;
  } finally { db.close(); }
}
export async function initializeDemo(run, teacher, env, port) {
  const database = join(teacher, DEMO), credentials = join(teacher, CREDENTIALS);
  if (existsSync(database)) {
    inspectDemo(teacher, database);
    console.log('[数据] 独立演示库已存在，保留全部现有内容和密码，不重复添加示例。');
  } else {
    // The existing initializer can rebuild a database. Pass a new private staging
    // path exclusively, then publish only its verified result; never a live DB.
    const staging = `data/oneclick-staging-${randomUUID()}`;
    mkdirSync(join(teacher, staging), { mode: 0o700 });
    const output = await run.run(process.execPath, ['--import', 'tsx', 'scripts/windows/initialize-local-demo.ts', '--database', `${staging}/demo.sqlite3`, '--credentials', `${staging}/login.txt`, '--no-env-update'], { cwd: teacher, env, capture: true });
    const result = JSON.parse(output);
    if (result.status !== 'ready') throw new Error('示例数据初始化未完成，原数据库未修改。');
    const stagedDb = join(teacher, staging, 'demo.sqlite3');
    inspectDemo(teacher, stagedDb);
    const Database = projectRequire(teacher)('better-sqlite3');
    const connection = new Database(stagedDb);
    try { connection.pragma('wal_checkpoint(TRUNCATE)'); } finally { connection.close(); }
    if (existsSync(database)) throw new Error('初始化期间目标数据库已出现，请重新检查，未覆盖它。');
    const login = readFileSync(join(teacher, staging, 'login.txt'), 'utf8').replace(/^URL=.*$/m, `URL=http://127.0.0.1:${port}/zh/login`);
    privateFile(credentials, login);
    renameSync(stagedDb, database);
    rmSync(join(teacher, staging), { recursive: true });
    console.log('[数据] 教师、研究方向、论文、项目、专利、学生、课程、新闻、设置、角色权限等示例已写入。');
    console.log(`[数据] ${Object.keys(result.counts).length} 张示例表；已执行 ${result.migrations.length} 项数据库结构检查/应用。`);
  }
  privateFile(join(teacher, STATE), JSON.stringify({ version: 1, database: DEMO, credentials: CREDENTIALS }, null, 2) + '\n');
  return inspectDemo(teacher, database);
}
async function connectTransfer(run, teacher, tool, env) {
  if (!transferIntegrationReady(teacher)) {
    await run.run(process.execPath, [join(tool, 'scripts/integrate-teacher.mjs'), 'apply', teacher], { cwd: tool, env });
  }
  if (repairTransferModuleSpecifier(teacher)) console.log('[接入] 已将 Windows 快传模块路径转换为 file:// URL。');
  if (repairTransferInternalPaths(tool)) console.log('[接入] 已将快传内部模块路径转换为 Windows 可识别格式。');
  if (!transferIntegrationReady(teacher)) throw new Error('文件快传接入不完整，已停止启动。请使用配套完整源码。');
}
function transferIntegrationReady(teacher) {
  try {
    return readFileSync(join(teacher, 'nuxt.config.ts'), 'utf8').includes(FT_MODULE_FILE_URL)
      && readFileSync(join(teacher, 'app/components/public/SiteHeader.vue'), 'utf8').includes('FileTransferNavEntry')
      && readFileSync(join(teacher, 'app/components/admin/Sidebar.vue'), 'utf8').includes('FileTransferAdminEntry');
  } catch { return false; }
}
export function repairTransferModuleSpecifier(teacher) {
  const path = join(teacher, 'nuxt.config.ts');
  const source = readFileSync(path, 'utf8');
  const oldCount = source.split(FT_MODULE_WINDOWS_PATH).length - 1;
  const newCount = source.split(FT_MODULE_FILE_URL).length - 1;
  if (oldCount === 0 && newCount === 1) return false;
  if (oldCount !== 1 || newCount !== 0) throw new Error('无法安全修复快传模块路径：nuxt.config.ts 接入片段不唯一。');
  const backup = join(teacher, 'data/windows-oneclick-backups', `nuxt-config-before-file-url-${createHash('sha256').update(source).digest('hex').slice(0, 12)}.ts`);
  if (!existsSync(backup)) privateFile(backup, source);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, source.replace(FT_MODULE_WINDOWS_PATH, FT_MODULE_FILE_URL), { flag: 'wx', mode: lstatSync(path).mode });
    renameSync(temporary, path);
  } finally { try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  return true;
}
export function repairTransferInternalPaths(tool) {
  const path = join(tool, 'integration/teacher-site/module.mjs');
  const source = readFileSync(path, 'utf8');
  const canonical = source.includes("path.replaceAll('\\\\', '/')")
    && source.includes("normalizeNuxtPath(fileURLToPath(new URL(relative, import.meta.url)))")
    && ['auth-runtime.ts', 'auth-http.ts', 'bounded-json.ts'].every(name => source.includes(`normalizeNuxtPath(resolve(nuxt.options.rootDir, 'server/utils/${name}'))`));
  if (canonical) return false;
  let next = source;
  let changes = 0;
  for (const [before, after] of FT_INTERNAL_PATH_REPAIRS) {
    const beforeCount = next.split(before).length - 1;
    const afterCount = next.split(after).length - 1;
    if (beforeCount === 1 && afterCount === 0) { next = next.replace(before, after); changes += 1; }
    else if (beforeCount === 0 && afterCount === 1) continue;
    else throw new Error('无法安全修复文件快传内部路径：module.mjs 接入片段不唯一。');
  }
  if (changes === 0) return false;
  const backup = join(tool, 'storage/oneclick-backups', `module-before-windows-path-${createHash('sha256').update(source).digest('hex').slice(0, 12)}.mjs`);
  if (!existsSync(backup)) privateFile(backup, source);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, next, { flag: 'wx', mode: lstatSync(path).mode });
    renameSync(temporary, path);
  } finally { try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  return true;
}
async function toolConfig(tool, env) {
  const { loadConfig } = await import(pathToFileURL(join(tool, 'server/config.mjs')).href);
  return loadConfig({ env });
}
export async function clearStaleTransferLock(run, tool, env) {
  const output = await run.run(process.execPath, [join(tool, 'scripts/maintenance.mjs'), 'unlock-stale'], { cwd: tool, env, capture: true });
  let result;
  try { result = JSON.parse(output); } catch { throw new Error('文件快传锁检查返回了无效结果。'); }
  if (typeof result?.unlocked !== 'boolean') throw new Error('文件快传锁检查结果不完整。');
  if (result.unlocked) console.log('[快传] 已清理上次异常退出遗留的失效运行锁。');
  return result.unlocked;
}
async function waitReady(url, item, milliseconds, jsonCheck) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (item.finished) { await item.done; throw new Error('服务在就绪之前退出。'); }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500), redirect: 'manual' });
      if (response.ok && (!jsonCheck || jsonCheck(await response.json()))) { await response.body?.cancel().catch(() => {}); return; }
      await response.body?.cancel().catch(() => {});
    } catch { /* Retry only during bounded service readiness. */ }
    await new Promise(r => setTimeout(r, 700));
  }
  throw new Error(`服务在规定时间内未就绪：${url}。请查看上方日志。`);
}
async function openBrowser(run, url, env) {
  if (process.platform !== 'win32') return;
  await run.run(join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'browser.ps1')], { env: { ...env, ONECLICK_BROWSER_URL: url }, capture: true });
}
export async function main(argv = process.argv.slice(2)) {
  const mode = argv[0]; const base = resolve(argv[1] || join(HERE, '..'));
  if (!MODES.has(mode) || argv.length > 2) throw new Error('启动模式无效。请双击对应的四个 CMD 入口。');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 24 || minor < 19) throw new Error('要求 Node.js >=24.19.0 <25。');
  const options = readOptions(base), teacher = locateTeacher(base, options.teacherDirectory);
  const both = mode.endsWith('both'), init = mode.startsWith('init');
  const tool = join(dirname(teacher), 'file-transfer');
  if (both && projectName(tool) !== 'academic-file-transfer') throw new Error(`找不到配套快传工程：${tool}。目录名须为 file-transfer，并与教师工程同级。`);
  for (const file of ['nuxt.config.ts', 'shared/complete-admin/core.mjs', 'scripts/windows/prepare-development.mjs', 'scripts/windows/initialize-local-demo.ts', 'pnpm-lock.yaml']) if (!existsSync(join(teacher, file))) throw new Error(`教师源码不完整，缺少 ${file}。请使用配套完整源码。`);
  const release = acquireLock(teacher), run = new Processes();
  let interrupted = false;
  const stop = () => { interrupted = true; console.log('\n[停止] 正在关闭本脚本启动的服务……'); void run.stop(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    console.log(`\n教师目录：${teacher}\n模式：${both ? '教师网站 + 文件快传' : '仅教师网站'} / ${init ? '初始化示例数据' : '本机开发运行'}\n`);
    await assertPortFree(options.port);
    const env = environment(teacher, options, both);
    let config;
    if (both) {
      config = await toolConfig(tool, env);
      await assertPortFree(config.port, config.host);
      if (config.port === options.port) throw new Error('教师网站与快传服务不能使用相同端口。');
    }
    await ensureDependencies(run, teacher, env, options, true);
    if (both) await ensureDependencies(run, tool, env, options, false);
    if (init) {
      if (both) await connectTransfer(run, teacher, tool, env);
      // The seed command is deliberately isolated from any inherited custom DB.
      const user = await initializeDemo(run, teacher, { ...env, FT_TEACHER_MODULE_ENABLED: 'false' }, options.port);
      if (both) {
        await run.run(process.execPath, [join(tool, 'scripts/initialize-bridge.mjs')], { cwd: tool, env });
        await run.run(process.execPath, [join(tool, 'scripts/manage-admin.mjs'), 'grant', user.uid], { cwd: tool, env });
        console.log('[快传] 配置、独立数据库与身份桥接已就绪；demo_admin 已获工具管理权限。');
        console.log('[快传] 现有规则和分享数据保留；LAN 网段、绕行核验与流量规则仍由管理员按真实网络配置。');
      }
      console.log(`\n初始化完成。账号：demo_admin\n${existsSync(join(teacher, CREDENTIALS)) ? '密码文件：' + join(teacher, CREDENTIALS) : '密码文件已不存在：请继续使用原密码，或通过现有管理员重置；初始化没有重置密码。'}\n演示数据库：${join(teacher, DEMO)}\n请双击 ${both ? '02_启动教师与文件快传.cmd' : '01_启动教师网站.cmd'} 启动。`);
      if (options.teacherDatabase) console.log('[说明] teacherDatabase 已手动指定，启动仍使用该指定数据库；留空才自动使用新演示库。');
      return;
    }
    if (!existsSync(env.CMS_DATABASE_PATH)) throw new Error('当前数据库不存在。首次体验请先运行 03 或 04 初始化脚本；已有网站请在配置中指定原数据库路径。');
    console.log(`数据库：${env.CMS_DATABASE_PATH}`);
    if (both) {
      await connectTransfer(run, teacher, tool, env);
      const key = join(config.dataPath, 'teacher-signing-key.pkcs8');
      if (!existsSync(key) || !config.bridgePublicKey) throw new Error('快传身份桥接未初始化，请先运行 04_初始化教师与快传数据.cmd。');
    }
    // Reuse the shipped migration engine and the stale-path cache repair.
    await run.run(process.execPath, [join(teacher, 'scripts/db/migrate.mjs'), '--database', env.CMS_DATABASE_PATH], { cwd: teacher, env });
    await run.run(process.execPath, [join(teacher, 'scripts/windows/prepare-development.mjs')], { cwd: teacher, env });
    const nuxt = join(dirname(projectRequire(teacher).resolve('nuxt/package.json')), 'bin/nuxt.mjs');
    await run.run(process.execPath, both ? [join(tool, 'scripts/teacher.mjs'), 'prepare', teacher] : [nuxt, 'prepare'], { cwd: teacher, env });
    let transfer;
    if (both) {
      await clearStaleTransferLock(run, tool, env);
      transfer = run.start(process.execPath, [join(tool, 'scripts/start.mjs')], { cwd: tool, env });
      const host = ['0.0.0.0', '::'].includes(config.host) ? '127.0.0.1' : config.host;
      await waitReady(`http://${host.includes(':') ? `[${host}]` : host}:${config.port}/transfer-api/ready`, transfer, 20_000, body => body.status === 'ready' && body.name === 'academic-file-transfer' && body.protocolVersion === 1);
    }
    const website = run.start(process.execPath, both ? [join(tool, 'scripts/teacher.mjs'), 'dev', teacher] : [nuxt, 'dev', '--host', '127.0.0.1', '--port', String(options.port)], { cwd: teacher, env });
    const url = `http://127.0.0.1:${options.port}`;
    await Promise.race([waitReady(url + '/zh', website, 180_000), ...(transfer ? [transfer.done.then(() => { throw new Error('快传服务意外退出。'); })] : [])]);
    console.log(`\n[已就绪] 教师网站：${url}/zh\n后台：${url}/admin`);
    if (both) console.log(`文件快传：${url}/zh/transfer\n快传管理：${url}/transfer-admin/`);
    console.log('关闭本窗口或按 Ctrl+C 停止。请勿同时运行另一套启动脚本。');
    if (options.openBrowser) await openBrowser(run, url + (both ? '/zh/transfer' : '/zh'), env).catch(() => console.log('浏览器未自动打开，请复制上方地址。'));
    await Promise.race([website.done, ...(transfer ? [transfer.done.then(() => { if (!interrupted) throw new Error('快传服务退出，正在停止配套网站。'); })] : [])]);
  } catch (error) {
    if (!interrupted) throw error;
  } finally {
    await run.stop(); release(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`\n[失败] ${error.message}\n初始化/运行未完成，请按提示处理后重试。`); process.exitCode = 1; });
}
