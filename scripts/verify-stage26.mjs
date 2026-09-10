import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations } from './db/migrations.mjs'
import { findCompiler } from './lib/typescript-compiler.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = resolve(root, 'reports/stage26')
const logDir = resolve(reportDir, 'logs')
await mkdir(logDir, { recursive: true })

const report = {
  stage: 26,
  scope: 'offline administration shell, permission-aware navigation, split read/write handlers and bounded dashboard acceptance; NOT installed Nuxt, browser, native better-sqlite3 or workerd release acceptance',
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  checks: [],
  status: 'running',
}

function check(name, condition, detail) {
  report.checks.push({ name, status: condition ? 'passed' : 'failed', ...(detail === undefined ? {} : { detail }) })
  if (!condition) throw new Error(name)
}

async function run(name, command, args, logName, timeout = 240_000) {
  console.error(`[stage26] ${name}`)
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}\n` : ''}`
  await writeFile(resolve(logDir, logName), output)
  check(name, result.status === 0 && !result.signal && !result.error, {
    exitCode: result.status,
    signal: result.signal,
    log: `logs/${logName}`,
  })
  return output
}

function sha256(data) { return createHash('sha256').update(data).digest('hex') }
function tapNumber(tap, label) { return Number(new RegExp(`^(?:#|ℹ) ${label} (\\d+)$`, 'm').exec(tap)?.[1] ?? Number.NaN) }
function parseTap(tap) {
  return {
    tests: tapNumber(tap, 'tests'),
    passed: tapNumber(tap, 'pass'),
    failed: tapNumber(tap, 'fail'),
    cancelled: tapNumber(tap, 'cancelled'),
    skipped: tapNumber(tap, 'skipped'),
  }
}
function completeTap(value) {
  return value.tests > 0 && value.passed === value.tests && value.failed === 0 && value.cancelled === 0 && value.skipped === 0
}
async function walk(directory, suffixes) {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', '.output', '.tmp', 'node_modules'].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) output.push(...await walk(path, suffixes))
    else if (entry.isFile() && suffixes.some(suffix => entry.name.endsWith(suffix))) output.push(path)
  }
  return output.sort()
}
function markdown(result) {
  const passed = result.checks.filter(item => item.status === 'passed').length
  const failed = result.checks.filter(item => item.status === 'failed').length
  const summary = [
    ['状态', result.status],
    ['生成时间', result.generatedAt],
    ['Node', result.environment.node],
    ['TypeScript', result.environment.compiler ?? '未运行'],
    ['阶段 26 主测试', result.stage26Tests ? `${result.stage26Tests.passed}/${result.stage26Tests.tests}` : '未运行'],
    ['稳定性重复', result.stabilityRuns?.map(item => `${item.passed}/${item.tests}`).join('、') || '未运行'],
    ['阶段 6 回归', result.regression?.stage6 ? `${result.regression.stage6.passed}/${result.regression.stage6.tests}` : '未运行'],
    ['阶段 5 回归', result.regression?.stage5 ? `${result.regression.stage5.passed}/${result.regression.stage5.tests}` : '未运行'],
    ['阶段 4 回归', result.regression?.stage4 ? `${result.regression.stage4.passed}/${result.regression.stage4.tests}` : '未运行'],
    ['阶段 3 回归', result.regression?.stage3 ? `${result.regression.stage3.passed}/${result.regression.stage3.tests}` : '未运行'],
    ['安全回归', result.regression?.security ? `${result.regression.security.passed}/${result.regression.security.tests}` : '未运行'],
    ['数据库回归', result.regression?.database ? `${result.regression.database.passed}/${result.regression.database.tests}` : '未运行'],
    ['Node 构建契约', result.regression?.node ? `${result.regression.node.passed}/${result.regression.node.tests}` : '未运行'],
    ['分析修正轮次', result.reviewCycles ?? '未运行'],
    ['检查项', `${passed} 通过，${failed} 失败`],
  ]
  const details = result.checks.map(item => `| ${item.name.replaceAll('|', '\\|')} | ${item.status} |`).join('\n')
  return `# 阶段 26 后台 Shell 与访问控制离线验收报告\n\n> 本报告验证后台运行边界、权限感知导航、客户端守卫、读写 Handler、Dashboard 查询预算和历史离线回归；不代表真实 Nuxt 构建、Element Plus 浏览器交互、native better-sqlite3 或 workerd 已通过。\n\n## 验收摘要\n\n| 项目 | 结果 |\n|---|---|\n${summary.map(([name, value]) => `| ${name} | ${String(value).replaceAll('|', '\\|')} |`).join('\n')}\n\n## 检查明细\n\n| 检查 | 结果 |\n|---|---|\n${details}\n${result.error ? `\n## 失败原因\n\n\`${result.error.replaceAll('`', '\\`')}\`\n` : ''}`
}

try {
  const baseline = JSON.parse(await readFile(resolve(reportDir, 'input-baseline.json'), 'utf8'))
  for (const [name, expected] of Object.entries(baseline.files)) {
    const path = resolve(root, name)
    check(`protected document: ${name}`, sha256(await readFile(path)) === expected)
    if (/^docs\/0[1-4]_/.test(name)) check(`read-only document: ${name}`, ((await stat(path)).mode & 0o222) === 0)
  }
  const stageDocument = await readFile(resolve(root, 'docs/26_后台Shell与访问控制.md'), 'utf8')
  check('stage-26 feature design documents functions and purposes', stageDocument.includes('# 26 后台 Shell 与访问控制') && stageDocument.includes('## 一、功能和用途') && stageDocument.includes('## 十二、阶段验收标准'))

  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  const exactDependencies = {
    'element-plus': '2.14.5',
    '@tanstack/vue-query': '5.102.8',
    pinia: '4.0.3',
    'unplugin-element-plus': '0.11.2',
  }
  for (const [name, version] of Object.entries(exactDependencies)) {
    check(`administration dependency is pinned: ${name}`, (packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name]) === version, version)
  }
  check('stage-26 package scripts expose offline and release gates', packageJson.scripts?.['verify:stage26:offline'] === 'node scripts/verify-stage26.mjs' && packageJson.scripts?.['verify:stage26'] === 'node scripts/verify-stage26-release.mjs')

  const migrations = await loadMigrations(resolve(root, 'migrations'))
  const names = migrations.map(item => item.name)
  check('migration history is append-only through the administration shell index', names.slice(0, 6).join(',') === '0001_initial.sql,0002_auth_security.sql,0003_media_i18n_cache.sql,0004_public_content_indexes.sql,0005_public_interactions_and_demo_seed.sql,0006_admin_shell.sql', migrations.map(item => ({ name: item.name, sha256: item.sha256 })))
  const migration = await readFile(resolve(root, 'migrations/0006_admin_shell.sql'), 'utf8')
  check('dashboard recent-activity query has a dedicated deterministic index', /idx_operation_logs_created_desc/u.test(migration) && /created_at" DESC, "id" DESC/u.test(migration))
  await run('generated database schema/catalog/types remain current', process.execPath, ['scripts/db/generate-schema.mjs', '--check'], 'schema-check.log')

  const compiler = await findCompiler(root)
  report.environment.compiler = compiler.version
  report.environment.compilerSource = compiler.source
  await run('strict administration core TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage26.json', '--noEmit'], 'stage26-core-typecheck.log')
  await run('strict administration H3/platform TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage26-http.json', '--noEmit'], 'stage26-http-typecheck.log')

  const tap = await run('stage-26 administration shell and access-control contracts', process.execPath, ['scripts/run-stage26-tests.mjs'], 'final-stage26.tap')
  report.stage26Tests = parseTap(tap)
  check('all stage-26 tests ran without failure, skip or cancellation', completeTap(report.stage26Tests), report.stage26Tests)
  report.stabilityRuns = []
  for (let index = 1; index <= 2; index += 1) {
    const repeated = parseTap(await run(`stage-26 stability repetition ${index}`, process.execPath, ['scripts/run-stage26-tests.mjs'], `stability-${index}.tap`))
    report.stabilityRuns.push(repeated)
    check(`stage-26 stability repetition ${index} is complete`, completeTap(repeated), repeated)
  }

  report.regression = {}
  for (const [stage, script, logName] of [
    ['stage6', 'scripts/run-stage6-tests.mjs', 'stage6-regression.tap'],
    ['stage5', 'scripts/run-stage5-tests.mjs', 'stage5-regression.tap'],
    ['stage4', 'scripts/run-stage4-tests.mjs', 'stage4-regression.tap'],
    ['stage3', 'scripts/run-stage3-tests.mjs', 'stage3-regression.tap'],
    ['security', 'scripts/run-security-tests.mjs', 'security-regression.tap'],
  ]) {
    const result = parseTap(await run(`${stage} historical regression`, process.execPath, [script], logName))
    check(`${stage} historical regression is complete`, completeTap(result), result)
    report.regression[stage] = result
  }

  await run('stage-1 database, migration and stage-0 regression', process.execPath, ['scripts/verify-stage1.mjs'], 'stage1-regression.log', 420_000)
  const databaseReport = JSON.parse(await readFile(resolve(root, 'reports/stage1/validation.json'), 'utf8'))
  check('database regression is complete', databaseReport.status === 'passed_offline_only' && completeTap({
    tests: databaseReport.databaseTests?.tests,
    passed: databaseReport.databaseTests?.passed,
    failed: databaseReport.databaseTests?.failed,
    cancelled: databaseReport.databaseTests?.cancelled,
    skipped: databaseReport.databaseTests?.skipped,
  }), databaseReport.databaseTests)
  report.regression.database = databaseReport.databaseTests

  const node = parseTap(await run('Node build-target contracts', process.execPath, ['--test', ...((await walk(resolve(root, 'tests/node'), ['.test.mjs'])).map(path => relative(root, path)))], 'node-build-contracts.tap'))
  check('Node build-target contracts are complete', completeTap(node), node)
  report.regression.node = node

  const nuxtConfig = await readFile(resolve(root, 'nuxt.config.ts'), 'utf8')
  check('administration routes are client-rendered and private', /['"]\/admin\/\*\*['"]\s*:\s*\{[\s\S]*?ssr:\s*false[\s\S]*?private, no-store/u.test(nuxtConfig))
  check('Element Plus uses the build-time on-demand plugin', /ElementPlus\(\{\s*useSource:\s*false\s*\}\)/u.test(nuxtConfig))

  const publicSources = [
    ...await walk(resolve(root, 'app/components/public'), ['.vue', '.ts']),
    ...await walk(resolve(root, 'app/pages/zh'), ['.vue', '.ts']),
    ...await walk(resolve(root, 'app/pages/en'), ['.vue', '.ts']),
    resolve(root, 'app/layouts/public.vue'),
  ]
  for (const path of publicSources) {
    const source = await readFile(path, 'utf8')
    const name = relative(root, path)
    check(`public source excludes administration runtime: ${name}`, !/(?:element-plus|@tanstack\/vue-query|from ['"]pinia['"]|~\/admin\/|components\/admin\/|assets\/admin\/)/u.test(source))
  }
  const adminSources = [
    ...await walk(resolve(root, 'app/components/admin'), ['.vue', '.ts']),
    ...await walk(resolve(root, 'app/pages/admin'), ['.vue', '.ts']),
    resolve(root, 'app/layouts/admin.vue'),
  ]
  for (const path of adminSources) {
    const source = await readFile(path, 'utf8')
    const name = relative(root, path)
    check(`admin source excludes public UI and raw HTML injection: ${name}`, !/(?:components\/public\/|assets\/public\/|\bv-html\b)/u.test(source))
  }

  const runtimePlugin = await readFile(resolve(root, 'app/plugins/admin-runtime.client.ts'), 'utf8')
  check('administration state libraries initialize only inside the administration document', /if \(!isAdminLocation\(\)\) return/u.test(runtimePlugin) && /import\('\.\.\/admin\/pinia'\)/u.test(runtimePlugin) && /import\('\.\.\/admin\/query-client'\)/u.test(runtimePlugin))
  const middleware = await readFile(resolve(root, 'app/middleware/admin-auth.global.ts'), 'utf8')
  check('client guard handles authentication, forced password change, unknown routes and permission denial', /AUTH_PASSWORD_CHANGE_REQUIRED|mustChangePassword/u.test(middleware) && /adminModuleForPath/u.test(middleware) && /hasAdminPermission/u.test(middleware) && /admin\/not-found/u.test(middleware) && /admin\/forbidden/u.test(middleware))

  const readHandler = await readFile(resolve(root, 'server/utils/admin-read-handler.ts'), 'utf8')
  const writeHandler = await readFile(resolve(root, 'server/utils/admin-write-handler.ts'), 'utf8')
  check('read handler performs session permission checks without write-only browser checks', /requireEventPermission/u.test(readHandler) && !/protectJsonWrite/u.test(readHandler))
  const protection = writeHandler.indexOf("protectJsonWrite(event, runtime, 'session')")
  const body = writeHandler.indexOf('readBoundedJsonBody(event, maximumBytes)')
  const permission = writeHandler.indexOf('requireEventPermission(event, requirement.module, requirement.action)')
  check('write handler protects origin/CSRF and bounds JSON before database-backed permission lookup', protection >= 0 && body > protection && permission > body)

  const dashboardStore = await readFile(resolve(root, 'server/services/admin/dashboard-store.ts'), 'utf8')
  check('dashboard uses one optional database batch and fixed recent-row budget', /this\.adapter\.batch\(commands\)/u.test(dashboardStore) && /ADMIN_RECENT_OPERATION_LIMIT = 8/u.test(dashboardStore) && /hasPermission\(principal,'messages','view'\)/u.test(dashboardStore) && /hasPermission\(principal,'operation_logs','view'\)/u.test(dashboardStore))

  const review = JSON.parse(await readFile(resolve(reportDir, 'review-cycles.json'), 'utf8'))
  check('at least two documented write-analysis-correction cycles exist', Array.isArray(review.cycles) && review.cycles.length >= 2 && review.cycles.every(item => Array.isArray(item.findings) && item.findings.length && Array.isArray(item.corrections) && item.corrections.length && item.result), { cycles: review.cycles?.length })
  report.reviewCycles = review.cycles.length

  report.status = 'passed_offline_only'
}
catch (error) {
  report.status = 'failed'
  report.error = error instanceof Error ? error.stack ?? error.message : String(error)
  process.exitCode = 1
}

await writeFile(resolve(reportDir, 'validation.json'), `${JSON.stringify(report, null, 2)}\n`)
await writeFile(resolve(reportDir, 'validation.md'), `${markdown(report)}\n`)
console.log(JSON.stringify({
  status: report.status,
  stage26Tests: report.stage26Tests,
  stabilityRuns: report.stabilityRuns,
  regression: report.regression,
  checks: {
    passed: report.checks.filter(item => item.status === 'passed').length,
    failed: report.checks.filter(item => item.status === 'failed').length,
  },
  report: 'reports/stage26/validation.json',
}, null, 2))
