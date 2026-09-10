import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations } from './db/migrations.mjs'
import { findCompiler } from './lib/typescript-compiler.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = resolve(root, 'reports/stage27')
const logDir = resolve(reportDir, 'logs')
await mkdir(logDir, { recursive: true })

const report = {
  stage: 27,
  title: '后台通用列表、编辑表单与核心内容管理',
  scope: 'offline TypeScript, SQLite/D1 protocol contracts, migration, UI source boundaries and historical regressions; not installed Nuxt/browser/workerd release acceptance',
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  checks: [],
  status: 'running',
}

function check(name, condition, detail) {
  report.checks.push({ name, status: condition ? 'passed' : 'failed', ...(detail === undefined ? {} : { detail }) })
  if (!condition) throw new Error(name)
}
function sha256(value) { return createHash('sha256').update(value).digest('hex') }
function tapNumber(tap, label) { return Number(new RegExp(`^(?:#|ℹ) ${label} (\\d+)$`, 'm').exec(tap)?.[1] ?? Number.NaN) }
function parseTap(tap) {
  return { tests: tapNumber(tap, 'tests'), passed: tapNumber(tap, 'pass'), failed: tapNumber(tap, 'fail'), cancelled: tapNumber(tap, 'cancelled'), skipped: tapNumber(tap, 'skipped') }
}
function completeTap(value) { return value.tests > 0 && value.passed === value.tests && value.failed === 0 && value.cancelled === 0 && value.skipped === 0 }
async function run(name, command, args, logName, timeout = 360_000) {
  console.error(`[stage27] ${name}`)
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout, maxBuffer: 128 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' } })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}\n` : ''}`
  await writeFile(resolve(logDir, logName), output)
  check(name, result.status === 0 && !result.signal && !result.error, { exitCode: result.status, signal: result.signal, log: `logs/${logName}` })
  return output
}
function markdown(result) {
  const passed = result.checks.filter(item => item.status === 'passed').length
  const failed = result.checks.filter(item => item.status === 'failed').length
  const rows = [
    ['状态', result.status], ['生成时间', result.generatedAt], ['Node', result.environment.node], ['TypeScript', result.environment.compiler ?? '未运行'],
    ['阶段 27 主测试', result.stage27Tests ? `${result.stage27Tests.passed}/${result.stage27Tests.tests}` : '未运行'],
    ['稳定性重复', result.stabilityRuns?.map(item => `${item.passed}/${item.tests}`).join('、') || '未运行'],
    ['阶段 26 回归', result.regression?.stage26 ? `${result.regression.stage26.passed}/${result.regression.stage26.tests}` : '未运行'],
    ['阶段 6 回归', result.regression?.stage6 ? `${result.regression.stage6.passed}/${result.regression.stage6.tests}` : '未运行'],
    ['阶段 5 回归', result.regression?.stage5 ? `${result.regression.stage5.passed}/${result.regression.stage5.tests}` : '未运行'],
    ['阶段 4 回归', result.regression?.stage4 ? `${result.regression.stage4.passed}/${result.regression.stage4.tests}` : '未运行'],
    ['阶段 3 回归', result.regression?.stage3 ? `${result.regression.stage3.passed}/${result.regression.stage3.tests}` : '未运行'],
    ['安全回归', result.regression?.security ? `${result.regression.security.passed}/${result.regression.security.tests}` : '未运行'],
    ['数据库回归', result.regression?.database ? `${result.regression.database.passed}/${result.regression.database.tests}` : '未运行'],
    ['检查项', `${passed} 通过，${failed} 失败`],
  ]
  return `# 阶段 27 后台核心内容管理离线验收报告\n\n> 本报告验证十个核心后台模块的描述器、服务端分页、筛选、编辑、权限、乐观锁、批量原子性、审计、缓存失效和历史离线回归；不代表真实 Nuxt 浏览器构建、native better-sqlite3 或 workerd 已通过。\n\n## 验收摘要\n\n| 项目 | 结果 |\n|---|---|\n${rows.map(([a,b]) => `| ${a} | ${String(b).replaceAll('|','\\|')} |`).join('\n')}\n\n## 检查明细\n\n| 检查 | 结果 |\n|---|---|\n${result.checks.map(item => `| ${item.name.replaceAll('|','\\|')} | ${item.status} |`).join('\n')}\n${result.error ? `\n## 失败原因\n\n\`${result.error.replaceAll('`','\\`')}\`\n` : ''}`
}

try {
  const baseline = JSON.parse(await readFile(resolve(reportDir, 'input-baseline.json'), 'utf8'))
  for (const [name, expected] of Object.entries(baseline.files)) {
    const path = resolve(root, name)
    check(`protected document: ${name}`, sha256(await readFile(path)) === expected)
    if (/^docs\/0[1-4]_/.test(name)) check(`read-only document: ${name}`, ((await stat(path)).mode & 0o222) === 0)
  }
  for (const [name, heading] of [
    ['docs/27_后台通用列表筛选分页与批量选择.md', '# 27 后台通用列表、筛选、分页与批量选择'],
    ['docs/28_后台通用编辑表单与核心内容管理.md', '# 28 后台通用编辑表单与核心内容管理'],
  ]) {
    const content = await readFile(resolve(root, name), 'utf8')
    check(`feature design exists: ${name}`, content.includes(heading) && content.includes('## 一、功能和用途'))
  }

  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  check('stage-27 package scripts expose offline and release gates', packageJson.scripts?.['verify:stage27:offline'] === 'node scripts/verify-stage27.mjs' && packageJson.scripts?.['verify:stage27'] === 'node scripts/verify-stage27-release.mjs')

  const migrations = await loadMigrations(resolve(root, 'migrations'))
  check('migration history is append-only through 0007', migrations.map(item => item.name).slice(0, 7).join(',') === '0001_initial.sql,0002_auth_security.sql,0003_media_i18n_cache.sql,0004_public_content_indexes.sql,0005_public_interactions_and_demo_seed.sql,0006_admin_shell.sql,0007_admin_content_management.sql', migrations.map(item => ({ name: item.name, sha256: item.sha256 })))
  const migration = await readFile(resolve(root, 'migrations/0007_admin_content_management.sql'), 'utf8')
  check('stage-27 migration contains mutation guard and core administration indexes', /admin_mutation_guards/u.test(migration) && /idx_profiles_admin_updated/u.test(migration) && /idx_publications_admin_updated/u.test(migration) && /idx_projects_admin_updated/u.test(migration))
  await run('generated database schema/catalog/types remain current', process.execPath, ['scripts/db/generate-schema.mjs', '--check'], 'schema-check.log')

  const compiler = await findCompiler(root)
  report.environment.compiler = compiler.version
  report.environment.compilerSource = compiler.source
  await run('strict stage-27 service TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage27.json', '--noEmit'], 'stage27-core-typecheck.log')
  await run('strict stage-27 H3 route TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage27-http.json', '--noEmit'], 'stage27-http-typecheck.log')

  const mainTap = await run('stage-27 core content contracts', process.execPath, ['scripts/run-stage27-tests.mjs'], 'final-stage27.tap')
  report.stage27Tests = parseTap(mainTap)
  check('all stage-27 tests completed', completeTap(report.stage27Tests), report.stage27Tests)
  report.stabilityRuns = []
  for (let index = 1; index <= 2; index += 1) {
    const repeated = parseTap(await run(`stage-27 stability repetition ${index}`, process.execPath, ['scripts/run-stage27-tests.mjs'], `stability-${index}.tap`))
    report.stabilityRuns.push(repeated)
    check(`stage-27 stability repetition ${index} is complete`, completeTap(repeated), repeated)
  }

  report.regression = {}
  for (const [name, script, log] of [
    ['stage26', 'scripts/run-stage26-tests.mjs', 'stage26-regression.tap'],
    ['stage6', 'scripts/run-stage6-tests.mjs', 'stage6-regression.tap'],
    ['stage5', 'scripts/run-stage5-tests.mjs', 'stage5-regression.tap'],
    ['stage4', 'scripts/run-stage4-tests.mjs', 'stage4-regression.tap'],
    ['stage3', 'scripts/run-stage3-tests.mjs', 'stage3-regression.tap'],
    ['security', 'scripts/run-security-tests.mjs', 'security-regression.tap'],
  ]) {
    const result = parseTap(await run(`${name} historical regression`, process.execPath, [script], log, 420_000))
    check(`${name} historical regression is complete`, completeTap(result), result)
    report.regression[name] = result
  }

  await run('stage-1 database and stage-0 regression', process.execPath, ['scripts/verify-stage1.mjs'], 'stage1-regression.log', 600_000)
  const databaseReport = JSON.parse(await readFile(resolve(root, 'reports/stage1/validation.json'), 'utf8'))
  const database = { tests: databaseReport.databaseTests?.tests, passed: databaseReport.databaseTests?.passed, failed: databaseReport.databaseTests?.failed, cancelled: databaseReport.databaseTests?.cancelled, skipped: databaseReport.databaseTests?.skipped }
  check('database regression is complete', completeTap(database), database)
  report.regression.database = database

  const nodeTap = parseTap(await run('Node build-target contracts', process.execPath, ['--test', '--test-reporter=tap', 'tests/node/build-output.test.mjs'], 'node-build-contracts.tap'))
  check('Node build-target contracts are complete', completeTap(nodeTap), nodeTap)
  report.regression.node = nodeTap

  report.reviewCycles = 3
  for (const file of ['cycle1-before.tap','cycle1-pass.tap','cycle2-pass.tap','cycle3-pass.tap']) check(`review evidence exists: ${file}`, (await stat(resolve(reportDir, file))).size > 0)
  report.status = 'passed_offline_only'
}
catch (error) {
  report.status = 'failed'
  report.error = error instanceof Error ? error.stack ?? error.message : String(error)
  process.exitCode = 1
}
await writeFile(resolve(reportDir, 'validation.json'), `${JSON.stringify(report, null, 2)}\n`)
await writeFile(resolve(reportDir, 'validation.md'), markdown(report))
console.log(JSON.stringify(report, null, 2))
