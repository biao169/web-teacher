import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations } from './db/migrations.mjs'
import { findCompiler } from './lib/typescript-compiler.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = resolve(root, 'reports/stage5')
const logDir = resolve(reportDir, 'logs')
await mkdir(logDir, { recursive: true })

const report = {
  stage: 5,
  scope: 'offline public core modules, dual-language SSR list/detail routes, bounded search/filter/page queries, media/i18n/cache projection, SEO and query plans; NOT native/browser/workerd release acceptance',
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  checks: [],
  status: 'running',
}

function check(name, condition, detail) {
  report.checks.push({ name, status: condition ? 'passed' : 'failed', ...(detail === undefined ? {} : { detail }) })
  if (!condition) throw new Error(name)
}

async function run(name, command, args, logName, timeout = 180_000) {
  console.error(`[stage5] ${name}`)
  await writeFile(resolve(logDir, `${logName}.started`), `${new Date().toISOString()} ${command} ${args.join(' ')}\n`)
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}\n` : ''}`
  await writeFile(resolve(logDir, logName), output)
  console.error(`[stage5] ${name}: status=${String(result.status)} signal=${String(result.signal)}`)
  check(name, result.status === 0 && !result.signal && !result.error, { exitCode: result.status, signal: result.signal, log: `logs/${logName}` })
  return output
}

function sha256(data) { return createHash('sha256').update(data).digest('hex') }
function tapNumber(tap, label) { return Number(new RegExp(`^(?:#|ℹ) ${label} (\\d+)$`, 'm').exec(tap)?.[1] ?? Number.NaN) }
function parseTap(tap) {
  return { tests: tapNumber(tap, 'tests'), passed: tapNumber(tap, 'pass'), failed: tapNumber(tap, 'fail'), cancelled: tapNumber(tap, 'cancelled'), skipped: tapNumber(tap, 'skipped') }
}
function completeTap(result) { return result.tests > 0 && result.passed === result.tests && result.failed === 0 && result.cancelled === 0 && result.skipped === 0 }
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
  const rows = [
    ['状态', result.status], ['生成时间', result.generatedAt], ['Node', result.environment.node],
    ['TypeScript', result.environment.compiler ?? '未运行'],
    ['阶段 5 测试', result.stage5Tests ? `${result.stage5Tests.passed}/${result.stage5Tests.tests}` : '未运行'],
    ['稳定性重复运行', result.stabilityRuns?.map(item => `${item.passed}/${item.tests}`).join('、') || '未运行'],
    ['阶段 4 回归', result.regression?.stage4 ? `${result.regression.stage4.passed}/${result.regression.stage4.tests}` : '未运行'],
    ['阶段 3 回归', result.regression?.stage3 ? `${result.regression.stage3.passed}/${result.regression.stage3.tests}` : '未运行'],
    ['阶段 2 安全回归', result.regression?.security ? `${result.regression.security.passed}/${result.regression.security.tests}` : '未运行'],
    ['阶段 1 数据库回归', result.regression?.database ? `${result.regression.database.passed}/${result.regression.database.tests}` : '未运行'],
    ['阶段 0 静态检查', result.regression?.stage0 ?? '未运行'],
    ['Node 构建契约', result.regression?.node ? `${result.regression.node.passed}/${result.regression.node.tests}` : '未运行'],
    ['分析修正轮次', result.reviewCycles ?? '未运行'], ['检查项', `${passed} 通过，${failed} 失败`],
  ]
  const details = result.checks.map(item => `| ${item.name.replaceAll('|', '\\|')} | ${item.status} |`).join('\n')
  return `# 阶段 5 离线验收报告\n\n> 本报告覆盖公开核心模块、双语 SSR 路由、服务端分页筛选、详情可见性、翻译/媒体/缓存投影、SEO 与查询计划；不代表 Nuxt 生产构建、真实浏览器 hydration、Lighthouse、native better-sqlite3 或 workerd 平台验收已经通过。\n\n## 验收摘要\n\n| 项目 | 结果 |\n|---|---|\n${rows.map(([name, value]) => `| ${name} | ${String(value).replaceAll('|', '\\|')} |`).join('\n')}\n\n## 检查明细\n\n| 检查 | 结果 |\n|---|---|\n${details}\n${result.error ? `\n## 失败原因\n\n\`${result.error.replaceAll('`', '\\`')}\`\n` : ''}`
}

try {
  const baseline = JSON.parse(await readFile(resolve(reportDir, 'input-baseline.json'), 'utf8'))
  for (const [name, expected] of Object.entries(baseline.protected_documents)) {
    const path = resolve(root, name)
    check(`protected document: ${name}`, sha256(await readFile(path)) === expected)
    if (/^docs\/0[1-4]_/.test(name)) check(`read-only document: ${name}`, ((await stat(path)).mode & 0o222) === 0)
  }

  const documents = (await readdir(resolve(root, 'docs'))).filter(name => /^16_.*\.md$/u.test(name))
  check('stage-5 has one canonical numbered feature document', documents.length === 1 && documents[0] === '16_公开核心模块与检索详情页.md', documents)

  const migrations = await loadMigrations(resolve(root, 'migrations'))
  const names = migrations.map(item => item.name)
  check('stage-5 migration history is append-only and complete', names.slice(0, 4).join(',') === '0001_initial.sql,0002_auth_security.sql,0003_media_i18n_cache.sql,0004_public_content_indexes.sql', migrations.map(item => ({ name: item.name, sha256: item.sha256 })))
  const migration4 = await readFile(resolve(root, 'migrations/0004_public_content_indexes.sql'), 'utf8')
  check('public ordering indexes are migration-owned', /idx_profiles_visibility_active_sort/u.test(migration4) && /idx_projects_visibility_start_date/u.test(migration4) && /idx_courses_visibility_semester/u.test(migration4))
  await run('generated database schema/catalog/types remain current', process.execPath, ['scripts/db/generate-schema.mjs', '--check'], 'schema-generation.log')

  const compiler = await findCompiler(root)
  report.environment.compiler = compiler.version
  report.environment.compilerSource = compiler.source
  await run('strict stage-5 service TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage5.json', '--noEmit'], 'stage5-core-typecheck.log')
  await run('strict stage-5 H3/platform TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage5-http.json', '--noEmit'], 'stage5-http-typecheck.log')

  const tap = await run('stage-5 dual-adapter, SSR, adversarial and query-plan contracts', process.execPath, ['scripts/run-stage5-tests.mjs'], 'final-stage5.tap')
  report.stage5Tests = parseTap(tap)
  check('all stage-5 tests ran without failure, skip or cancellation', completeTap(report.stage5Tests), report.stage5Tests)
  report.stabilityRuns = []
  for (let index = 1; index <= 2; index += 1) {
    const repeated = parseTap(await run(`stage-5 stability repetition ${index}`, process.execPath, ['scripts/run-stage5-tests.mjs'], `stability-${index}.tap`))
    report.stabilityRuns.push(repeated)
    check(`stage-5 stability repetition ${index} is complete`, completeTap(repeated), repeated)
  }

  report.regression = {}
  const stage4 = parseTap(await run('stage-4 public home regression', process.execPath, ['scripts/run-stage4-tests.mjs'], 'stage4-regression.tap'))
  check('stage-4 regression is complete', completeTap(stage4), stage4); report.regression.stage4 = stage4
  const stage3 = parseTap(await run('stage-3 media/i18n/cache regression', process.execPath, ['scripts/run-stage3-tests.mjs'], 'stage3-regression.tap'))
  check('stage-3 regression is complete', completeTap(stage3), stage3); report.regression.stage3 = stage3
  const security = parseTap(await run('stage-2 security regression', process.execPath, ['scripts/run-security-tests.mjs'], 'security-regression.tap'))
  check('stage-2 security regression is complete', completeTap(security), security); report.regression.security = security
  await run('stage-1 database and migration regression', process.execPath, ['scripts/verify-stage1.mjs'], 'stage1-regression.log', 360_000)
  const databaseReport = JSON.parse(await readFile(resolve(root, 'reports/stage1/validation.json'), 'utf8'))
  check('stage-1 database regression is complete', databaseReport.status === 'passed_offline_only' && databaseReport.databaseTests?.passed === databaseReport.databaseTests?.tests && databaseReport.databaseTests?.failed === 0, databaseReport.databaseTests)
  report.regression.database = databaseReport.databaseTests
  const stage0Log = await run('stage-0 structure and protected-document regression', process.execPath, ['scripts/verify-stage0.mjs'], 'stage0-regression.log')
  const stage0Summary = /Summary:\s*(\d+) passed,\s*(\d+) warning\(s\),\s*(\d+) failed/u.exec(stage0Log)
  check('stage-0 regression summary is successful', Boolean(stage0Summary) && Number(stage0Summary[3]) === 0, stage0Summary?.slice(1))
  report.regression.stage0 = stage0Summary ? `${stage0Summary[1]} passed, ${stage0Summary[2]} warnings` : null
  await run('stage-0 TypeScript runtime contracts', process.execPath, ['scripts/verify-contracts.mjs'], 'core-contracts.log')
  const nodeTestFiles = (await readdir(resolve(root, 'tests/node')))
    .filter(name => name.endsWith('.test.mjs')).sort().map(name => `tests/node/${name}`)
  const nodeTap = parseTap(await run('Node build target contracts', process.execPath, ['--test', ...nodeTestFiles], 'node-build.tap'))
  check('Node build target contracts are complete', completeTap(nodeTap), nodeTap); report.regression.node = nodeTap

  const zh = (await walk(resolve(root, 'app/pages/zh'), ['.vue'])).map(path => relative(resolve(root, 'app/pages/zh'), path))
  const en = (await walk(resolve(root, 'app/pages/en'), ['.vue'])).map(path => relative(resolve(root, 'app/pages/en'), path))
  check('Chinese and English route source trees are symmetrical', JSON.stringify(zh) === JSON.stringify(en) && zh.length === 17, { zh: zh.length, en: en.length })
  const api = await walk(resolve(root, 'server/routes/api/v1/public'), ['.ts'])
  check('public API surface contains home, shell and sixteen core endpoints', api.length === 18, api.map(path => relative(root, path)))
  for (const path of api) {
    const source = await readFile(path, 'utf8')
    check(`public API uses shared conditional-result boundary: ${relative(root, path)}`, /handlePublicResult/u.test(source))
  }

  const publicSources = [
    ...await walk(resolve(root, 'app/components/public'), ['.vue', '.ts']),
    ...await walk(resolve(root, 'app/pages/zh'), ['.vue', '.ts']),
    ...await walk(resolve(root, 'app/pages/en'), ['.vue', '.ts']),
    ...await walk(resolve(root, 'app/composables'), ['.ts']),
  ]
  check('public presentation source is non-empty', publicSources.length >= 50, { files: publicSources.length })
  for (const path of publicSources) {
    const source = await readFile(path, 'utf8')
    const name = relative(root, path)
    check(`public source has no raw HTML injection: ${name}`, !/\bv-html\b/u.test(source))
    check(`public source has no admin or heavyweight editor dependency: ${name}`, !/components\/admin|assets\/admin|element-plus|@tiptap\/|echarts|pdfjs/iu.test(source))
    check(`public client source has no direct server/database import: ${name}`, !/(?:~~\/|\.\.\/)+(?:db|server)\//u.test(source))
  }

  const resource = await readFile(resolve(root, 'app/composables/usePublicResource.ts'), 'utf8')
  check('public list and detail resources remain reactive after hydration', /computed\(\(\) => `\/api\/v1\/public/u.test(resource) && /watch:\s*\[endpoint\]/u.test(resource) && /return computed<T>/u.test(resource))
  const seo = await readFile(resolve(root, 'app/composables/usePublicContentSeo.ts'), 'utf8')
  check('content SEO is reactive and JSON-LD escapes script-sensitive code points', /useSeoMeta\(\{[\s\S]*title:\s*\(\)/u.test(seo) && /replace\(\/<\/gu, '\\\\u003c'\)/u.test(seo) && /public-shell:v1:/u.test(seo))
  const homeStore = await readFile(resolve(root, 'server/services/public/public-home-store.ts'), 'utf8')
  const homeService = await readFile(resolve(root, 'server/services/public/public-home-service.ts'), 'utf8')
  check('home aggregation reuses core module parsing and projection policies', /from '\.\/public-row'/u.test(homeStore) && /from '\.\/public-localization'/u.test(homeService) && /from '\.\/public-values'/u.test(homeService))

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
console.log(JSON.stringify({ status: report.status, stage5Tests: report.stage5Tests, stabilityRuns: report.stabilityRuns, regression: report.regression, checks: { passed: report.checks.filter(item => item.status === 'passed').length, failed: report.checks.filter(item => item.status === 'failed').length }, report: 'reports/stage5/validation.json' }, null, 2))
