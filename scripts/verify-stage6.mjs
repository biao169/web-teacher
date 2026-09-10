import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations } from './db/migrations.mjs'
import { findCompiler } from './lib/typescript-compiler.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = resolve(root, 'reports/stage6')
const logDir = resolve(reportDir, 'logs')
await mkdir(logDir, { recursive: true })

const report = {
  stage: 6,
  scope: 'offline login/registration/account/contact workflows, public-action throttling, deterministic demo seed data and historical regression; NOT native/browser/workerd release acceptance',
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
  console.error(`[stage6] ${name}`)
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}\n` : ''}`
  await writeFile(resolve(logDir, logName), output)
  console.error(`[stage6] ${name}: status=${String(result.status)} signal=${String(result.signal)}`)
  check(name, result.status === 0 && !result.signal && !result.error, { exitCode: result.status, signal: result.signal, log: `logs/${logName}` })
  return output
}

function sha256(data) { return createHash('sha256').update(data).digest('hex') }
function tapNumber(tap, label) { return Number(new RegExp(`^(?:#|ℹ) ${label} (\\d+)$`, 'm').exec(tap)?.[1] ?? Number.NaN) }
function parseTap(tap) {
  return {
    tests: tapNumber(tap, 'tests'), passed: tapNumber(tap, 'pass'), failed: tapNumber(tap, 'fail'),
    cancelled: tapNumber(tap, 'cancelled'), skipped: tapNumber(tap, 'skipped'),
  }
}
function completeTap(result) {
  return result.tests > 0 && result.passed === result.tests && result.failed === 0 && result.cancelled === 0 && result.skipped === 0
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
  const rows = [
    ['状态', result.status], ['生成时间', result.generatedAt], ['Node', result.environment.node],
    ['TypeScript', result.environment.compiler ?? '未运行'],
    ['阶段 6 测试', result.stage6Tests ? `${result.stage6Tests.passed}/${result.stage6Tests.tests}` : '未运行'],
    ['稳定性重复运行', result.stabilityRuns?.map(item => `${item.passed}/${item.tests}`).join('、') || '未运行'],
    ['阶段 5 回归', result.regression?.stage5 ? `${result.regression.stage5.passed}/${result.regression.stage5.tests}` : '未运行'],
    ['阶段 4 回归', result.regression?.stage4 ? `${result.regression.stage4.passed}/${result.regression.stage4.tests}` : '未运行'],
    ['阶段 3 回归', result.regression?.stage3 ? `${result.regression.stage3.passed}/${result.regression.stage3.tests}` : '未运行'],
    ['阶段 2 安全回归', result.regression?.security ? `${result.regression.security.passed}/${result.regression.security.tests}` : '未运行'],
    ['阶段 1 数据库回归', result.regression?.database ? `${result.regression.database.passed}/${result.regression.database.tests}` : '未运行'],
    ['阶段 0 静态检查', result.regression?.stage0 ?? '未运行'],
    ['Node 构建契约', result.regression?.node ? `${result.regression.node.passed}/${result.regression.node.tests}` : '未运行'],
    ['演示数据表', result.sampleData ? `${result.sampleData.tables} 张（可重复表 10–20 条，单例表 1 条）` : '未运行'],
    ['演示 PNG', result.sampleData ? `${result.sampleData.pngAssets} 个` : '未运行'],
    ['分析修正轮次', result.reviewCycles ?? '未运行'],
    ['检查项', `${passed} 通过，${failed} 失败`],
  ]
  const details = result.checks.map(item => `| ${item.name.replaceAll('|', '\\|')} | ${item.status} |`).join('\n')
  return `# 阶段 6 离线验收报告\n\n> 本报告覆盖登录、注册、账号安全、联系留言、公开操作节流、演示种子数据及历史阶段回归；不代表 Nuxt 生产构建、真实浏览器、native better-sqlite3、D1/R2/Cache API 或 workerd 平台验收已经通过。\n\n## 验收摘要\n\n| 项目 | 结果 |\n|---|---|\n${rows.map(([name, value]) => `| ${name} | ${String(value).replaceAll('|', '\\|')} |`).join('\n')}\n\n## 检查明细\n\n| 检查 | 结果 |\n|---|---|\n${details}\n${result.error ? `\n## 失败原因\n\n\`${result.error.replaceAll('`', '\\`')}\`\n` : ''}`
}

try {
  const baseline = JSON.parse(await readFile(resolve(reportDir, 'input-baseline.json'), 'utf8'))
  for (const [name, expected] of Object.entries(baseline.files)) {
    const path = resolve(root, name)
    check(`protected document: ${name}`, sha256(await readFile(path)) === expected)
    if (/^docs\/0[1-4]_/.test(name)) check(`read-only document: ${name}`, ((await stat(path)).mode & 0o222) === 0)
  }

  const documents = (await readdir(resolve(root, 'docs'))).filter(name => /^(17|18)_.*\.md$/u.test(name)).sort()
  check('stage-6 has exactly two canonical numbered feature documents', JSON.stringify(documents) === JSON.stringify(['17_登录注册与联系留言.md', '18_开发演示种子数据.md']), documents)

  const migrations = await loadMigrations(resolve(root, 'migrations'))
  const names = migrations.map(item => item.name)
  check('stage-6 migration history is append-only and complete', names.slice(0, 5).join(',') === '0001_initial.sql,0002_auth_security.sql,0003_media_i18n_cache.sql,0004_public_content_indexes.sql,0005_public_interactions_and_demo_seed.sql', migrations.map(item => ({ name: item.name, sha256: item.sha256 })))
  const migration5 = await readFile(resolve(root, 'migrations/0005_public_interactions_and_demo_seed.sql'), 'utf8')
  check('public action throttle and demo marker are migration-owned', /CREATE TABLE "public_action_throttles"/u.test(migration5) && /CREATE TABLE "demo_seed_state"/u.test(migration5) && /idx_global_settings_updated/u.test(migration5))
  await run('generated database schema/catalog/types remain current', process.execPath, ['scripts/db/generate-schema.mjs', '--check'], 'schema-generation.log')

  const compiler = await findCompiler(root)
  report.environment.compiler = compiler.version
  report.environment.compilerSource = compiler.source
  await run('strict stage-6 service TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage6.json', '--noEmit'], 'stage6-core-typecheck.log')
  await run('strict stage-6 H3/platform TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage6-http.json', '--noEmit'], 'stage6-http-typecheck.log')

  const tap = await run('stage-6 interaction, seed, adversarial and integration contracts', process.execPath, ['scripts/run-stage6-tests.mjs'], 'final-stage6.tap')
  report.stage6Tests = parseTap(tap)
  check('all stage-6 tests ran without failure, skip or cancellation', completeTap(report.stage6Tests), report.stage6Tests)
  report.stabilityRuns = []
  for (let index = 1; index <= 2; index += 1) {
    const repeated = parseTap(await run(`stage-6 stability repetition ${index}`, process.execPath, ['scripts/run-stage6-tests.mjs'], `stability-${index}.tap`))
    report.stabilityRuns.push(repeated)
    check(`stage-6 stability repetition ${index} is complete`, completeTap(repeated), repeated)
  }

  report.regression = {}
  const stage5 = parseTap(await run('stage-5 public content regression', process.execPath, ['scripts/run-stage5-tests.mjs'], 'stage5-regression.tap'))
  check('stage-5 regression is complete', completeTap(stage5), stage5); report.regression.stage5 = stage5
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
  const nodeTestFiles = (await readdir(resolve(root, 'tests/node'))).filter(name => name.endsWith('.test.mjs')).sort().map(name => `tests/node/${name}`)
  const nodeTap = parseTap(await run('Node build target contracts', process.execPath, ['--test', ...nodeTestFiles], 'node-build.tap'))
  check('Node build target contracts are complete', completeTap(nodeTap), nodeTap); report.regression.node = nodeTap

  const zh = (await walk(resolve(root, 'app/pages/zh'), ['.vue'])).map(path => relative(resolve(root, 'app/pages/zh'), path))
  const en = (await walk(resolve(root, 'app/pages/en'), ['.vue'])).map(path => relative(resolve(root, 'app/pages/en'), path))
  check('Chinese and English route source trees are symmetrical', JSON.stringify(zh) === JSON.stringify(en) && zh.length === 22, { zh: zh.length, en: en.length })

  const authApi = (await walk(resolve(root, 'server/routes/api/v1/auth'), ['.ts'])).map(path => relative(resolve(root, 'server/routes/api/v1/auth'), path))
  const expectedAuth = ['bootstrap.post.ts','login.post.ts','logout.post.ts','password/change.post.ts','register.post.ts','registration.get.ts','session.get.ts','session/refresh.post.ts','sessions/revoke-all.post.ts'].sort()
  check('authentication API surface is complete', JSON.stringify(authApi) === JSON.stringify(expectedAuth), authApi)
  const contactApi = (await walk(resolve(root, 'server/routes/api/v1/public'), ['.ts'])).map(path => relative(resolve(root, 'server/routes/api/v1/public'), path)).filter(name => name.startsWith('contact.'))
  check('contact availability and submission API are present', JSON.stringify(contactApi) === JSON.stringify(['contact.get.ts','contact.post.ts']), contactApi)

  const interactionSources = [
    ...await walk(resolve(root, 'app/components/public/auth'), ['.vue', '.ts']),
    ...await walk(resolve(root, 'app/components/public/contact'), ['.vue', '.ts']),
    ...await walk(resolve(root, 'app/pages/zh'), ['.vue', '.ts']),
    ...await walk(resolve(root, 'app/pages/en'), ['.vue', '.ts']),
    resolve(root, 'app/composables/useAuthSession.ts'),
  ]
  for (const path of interactionSources) {
    const source = await readFile(path, 'utf8')
    const name = relative(root, path)
    check(`public interaction source has no raw HTML injection: ${name}`, !/\bv-html\b/u.test(source))
    check(`public interaction source has no admin/heavyweight dependency: ${name}`, !/components\/admin|assets\/admin|element-plus|@tiptap\/|echarts|pdfjs/iu.test(source))
    check(`public interaction source has no direct server/database import: ${name}`, !/(?:~~\/|\.\.\/)+(?:db|server)\//u.test(source))
  }

  const routeFiles = [
    'server/routes/api/v1/auth/register.post.ts', 'server/routes/api/v1/auth/session/refresh.post.ts',
    'server/routes/api/v1/auth/password/change.post.ts', 'server/routes/api/v1/auth/sessions/revoke-all.post.ts',
    'server/routes/api/v1/public/contact.post.ts',
  ]
  for (const name of routeFiles) {
    const source = await readFile(resolve(root, name), 'utf8')
    check(`state-changing route is private/no-store and request-protected: ${name}`, /applyPrivateNoStore\(event\)/u.test(source) && /protectJsonWrite\(event/u.test(source) && /readBoundedJsonBody\(event/u.test(source))
  }

  const redirect = await readFile(resolve(root, 'shared/utils/redirect.ts'), 'utf8')
  check('safe redirect performs bounded repeated decoding and decoded-prefix checks', /MAX_DECODE_ROUNDS = 8/u.test(redirect) && /fullyDecodeUnambiguousPath/u.test(redirect) && /hasForbiddenPrefix\(decodedRawPath\)/u.test(redirect))
  const contactService = await readFile(resolve(root, 'server/services/contact/contact-service.ts'), 'utf8')
  check('honeypot returns before throttle and storage mutation', contactService.indexOf('if (honeypot) return') < contactService.indexOf('await this.throttle.consume') && contactService.indexOf('await this.throttle.consume') < contactService.indexOf('await this.store.create'))

  const seedSource = await readFile(resolve(root, 'db/seeds/sample-data.ts'), 'utf8')
  const countsBlock = /SAMPLE_TABLE_COUNTS = Object\.freeze\(\{([\s\S]*?)\}\s+as const\)/u.exec(seedSource)?.[1] ?? ''
  const counts = Object.fromEntries([...countsBlock.matchAll(/\b([a-z][a-z0-9_]*)\s*:\s*(\d+)/gu)].map(match => [match[1], Number(match[2])]))
  const schemaSpec = JSON.parse(await readFile(resolve(root, 'db/schema-spec.json'), 'utf8'))
  const coreTables = Object.keys(schemaSpec.tables)
  const expectedTechnical = ['auth_bootstrap_state','auth_sessions','auth_login_throttles','cache_generations','public_action_throttles','demo_seed_state']
  check('sample dataset covers every core and current technical table', [...coreTables, ...expectedTechnical].every(name => Object.hasOwn(counts, name)) && Object.keys(counts).length === coreTables.length + expectedTechnical.length, { tables: Object.keys(counts).length })
  const singleton = new Set(['auth_bootstrap_state','demo_seed_state'])
  check('every repeatable sample table has 10–20 rows and singleton tables have one', Object.entries(counts).every(([name, value]) => singleton.has(name) ? value === 1 : value >= 10 && value <= 20), counts)
  report.sampleData = { tables: Object.keys(counts).length, counts }

  const demoFiles = await walk(resolve(root, 'public/demo'), ['.png', '.svg'])
  const pngFiles = demoFiles.filter(path => path.endsWith('.png'))
  const svgFiles = demoFiles.filter(path => path.endsWith('.svg'))
  check('demo media contains exactly twenty PNG files and no SVG', pngFiles.length === 20 && svgFiles.length === 0, { png: pngFiles.length, svg: svgFiles.length })
  for (const path of pngFiles) {
    const bytes = await readFile(path)
    check(`demo image is a non-empty real PNG: ${relative(root, path)}`, bytes.length > 1000 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', { bytes: bytes.length })
  }
  report.sampleData.pngAssets = pngFiles.length
  check('seed references static PNG metadata and exact checksums', /mimeType: 'image\/png'/u.test(seedSource) && /checksum: '[0-9a-f]{64}'/u.test(seedSource) && !/\.svg/u.test(seedSource))
  const seedTests = await readFile(resolve(root, 'tests/stage6/seed.spec.mjs'), 'utf8')
  check('sample identities are verified against the reserved invalid email domain', /endsWith\('@example\.invalid'\)/u.test(seedTests) && /SELECT email FROM auth_users/u.test(seedTests) && /SELECT notify_email AS email FROM global_settings/u.test(seedTests))

  const seedCli = await readFile(resolve(root, 'scripts/db/seed-sample.ts'), 'utf8')
  check('sample seed CLI refuses production and requires explicit acknowledgement, password and safe path', /NODE_ENV === 'production'/u.test(seedCli) && /CMS_DEMO_SEED_ACK/u.test(seedCli) && /CMS_DEMO_PASSWORD/u.test(seedCli) && /--database/u.test(seedCli) && /demo_seed_state/u.test(seedCli) && /isSymbolicLink/u.test(seedCli))
  check('ordinary build/start/migration scripts do not invoke sample seeding', !/db:seed:sample/u.test(JSON.stringify({
    build: JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).scripts.build,
    start: JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).scripts.start,
    migrate: JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).scripts['db:migrate:sqlite'],
  })))

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
  stage6Tests: report.stage6Tests,
  stabilityRuns: report.stabilityRuns,
  regression: report.regression,
  sampleData: report.sampleData,
  checks: { passed: report.checks.filter(item => item.status === 'passed').length, failed: report.checks.filter(item => item.status === 'failed').length },
  report: 'reports/stage6/validation.json',
}, null, 2))
