import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations } from './db/migrations.mjs'
import { findCompiler } from './lib/typescript-compiler.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = resolve(root, 'reports/stage3')
await mkdir(reportDir, { recursive: true })

const report = {
  stage: 3,
  scope: 'offline media, i18n, public ViewModel and cache acceptance; NOT native better-sqlite3/workerd/Nuxt/browser release acceptance',
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  checks: [],
  status: 'running',
}

function check(name, condition, detail) {
  report.checks.push({ name, status: condition ? 'passed' : 'failed', ...(detail === undefined ? {} : { detail }) })
  if (!condition) throw new Error(name)
}

async function run(name, command, args, logName, timeout = 120_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  })
  const log = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}\n` : ''}`
  if (logName) await writeFile(resolve(reportDir, logName), log)
  check(name, result.status === 0 && !result.signal && !result.error, {
    exitCode: result.status,
    signal: result.signal,
    log: logName ?? null,
  })
  return log
}

async function files(directory, suffixes) {
  const wanted = Array.isArray(suffixes) ? suffixes : [suffixes]
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory() && !new Set(['.nuxt', '.output', '.tmp', 'node_modules', 'reports']).has(entry.name)) output.push(...await files(path, wanted))
    else if (entry.isFile() && wanted.some(suffix => entry.name.endsWith(suffix))) output.push(path)
  }
  return output.sort()
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

function tapNumber(tap, label) {
  return Number(new RegExp(`^(?:#|ℹ) ${label} (\\d+)$`, 'm').exec(tap)?.[1] ?? Number.NaN)
}

function parseTap(tap) {
  return {
    tests: tapNumber(tap, 'tests'),
    passed: tapNumber(tap, 'pass'),
    failed: tapNumber(tap, 'fail'),
    cancelled: tapNumber(tap, 'cancelled'),
    skipped: tapNumber(tap, 'skipped'),
  }
}

function completeTap(result) {
  return result.tests > 0
    && result.passed === result.tests
    && result.failed === 0
    && result.cancelled === 0
    && result.skipped === 0
}

function blankEnv(source, name) {
  return source.split(/\r?\n/u).find(line => line.startsWith(`${name}=`)) === `${name}=`
}

function markdown(result) {
  const checksPassed = result.checks.filter(item => item.status === 'passed').length
  const checksFailed = result.checks.filter(item => item.status === 'failed').length
  const tests = result.stage3Tests ?? {}
  const regression = result.regression ?? {}
  const rows = [
    ['状态', result.status],
    ['生成时间', result.generatedAt],
    ['Node', result.environment.node],
    ['TypeScript', result.environment.compiler ?? '未运行'],
    ['阶段 3 测试', Number.isFinite(tests.tests) ? `${tests.passed}/${tests.tests}` : '未运行'],
    ['稳定性重复运行', result.stabilityRuns?.length ? result.stabilityRuns.map(item => `${item.passed}/${item.tests}`).join('、') : '未运行'],
    ['阶段 2 回归', regression.stage2 ?? '未运行'],
    ['检查项', `${checksPassed} 通过，${checksFailed} 失败`],
  ]
  const details = result.checks.map(item => `| ${item.name.replaceAll('|', '\\|')} | ${item.status} |`).join('\n')
  return `# 阶段 3 离线验收报告\n\n> 本报告覆盖媒体、i18n、公开 ViewModel 与缓存基础的离线验收；不代表 native better-sqlite3、workerd、Nuxt 生产构建或浏览器发布验收已经通过。\n\n## 验收摘要\n\n| 项目 | 结果 |\n|---|---|\n${rows.map(([name, value]) => `| ${name} | ${String(value).replaceAll('|', '\\|')} |`).join('\n')}\n\n## 检查明细\n\n| 检查 | 结果 |\n|---|---|\n${details}\n${result.error ? `\n## 失败原因\n\n\`${result.error.replaceAll('`', '\\`')}\`\n` : ''}`
}

try {
  const baseline = JSON.parse(await readFile(resolve(reportDir, 'input-baseline.json'), 'utf8'))
  for (const [name, expected] of Object.entries(baseline.protected_documents)) {
    const path = resolve(root, name)
    const data = await readFile(path)
    check(`protected document: ${name}`, sha256(data) === expected)
    if (/^docs\/0[1-4]_/.test(name)) check(`read-only document: ${name}`, ((await stat(path)).mode & 0o222) === 0)
  }

  const stageDocument = resolve(root, 'docs/14_媒体i18n与缓存基础.md')
  check('stage-3 feature design document exists', (await stat(stageDocument)).isFile())
  const duplicateStageDocuments = (await readdir(resolve(root, 'docs'))).filter(name => /^14_.*\.md$/u.test(name))
  check('stage-3 has one canonical numbered design document', duplicateStageDocuments.length === 1, duplicateStageDocuments)

  const migrations = await loadMigrations(resolve(root, 'migrations'))
  const migrationNames = migrations.map(item => item.name)
  check('stage-3 migrations are manifest-protected and append-only',
    migrationNames.slice(0, 3).join(',') === '0001_initial.sql,0002_auth_security.sql,0003_media_i18n_cache.sql'
      && migrationNames.length >= 3,
    migrations.map(item => ({ name: item.name, sha256: item.sha256 })))
  await run('migration manifest is current', process.execPath, ['scripts/db/update-manifest.mjs', '--check'], 'migration-manifest.log')
  await run('generated database schema/catalog/types remain current', process.execPath, ['scripts/db/generate-schema.mjs', '--check'], 'schema-generation.log')

  const compiler = await findCompiler(root)
  report.environment.compiler = compiler.version
  report.environment.compilerSource = compiler.source
  await run('strict stage-3 core TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage3.json', '--noEmit'], 'stage3-core-typecheck.log')
  await run('strict stage-3 H3/platform TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage3-http.json'], 'stage3-http-typecheck.log')

  const tap = await run('stage-3 dual-adapter and adversarial contracts', process.execPath, ['scripts/run-stage3-tests.mjs'], 'final-stage3.tap')
  report.stage3Tests = parseTap(tap)
  check('all stage-3 tests actually ran without failure, skip or cancellation', completeTap(report.stage3Tests), report.stage3Tests)

  report.stabilityRuns = []
  for (let index = 1; index <= 2; index += 1) {
    const repeatedTap = await run(`stage-3 stability repetition ${index}`, process.execPath, ['scripts/run-stage3-tests.mjs'], `stability-${index}.tap`)
    const parsed = parseTap(repeatedTap)
    report.stabilityRuns.push(parsed)
    check(`stage-3 stability repetition ${index} is complete`, completeTap(parsed), parsed)
  }

  await run('stage-2 security, stage-1 database and stage-0 regression suite', process.execPath, ['scripts/verify-stage2.mjs'], 'stage2-regression.log', 360_000)
  const stage2 = JSON.parse(await readFile(resolve(root, 'reports/stage2/validation.json'), 'utf8'))
  check('stage-2 regression remains accepted offline', stage2.status === 'passed_offline_only', {
    status: stage2.status,
    securityTests: stage2.securityTests,
    regression: stage2.regression,
  })
  report.regression = {
    stage2: stage2.status,
    securityTests: stage2.securityTests,
    stage1: stage2.regression?.stage1,
    databaseTests: stage2.regression?.databaseTests,
  }

  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  check('runtime and database dependencies remain exact pins',
    packageJson.dependencies.nuxt === '4.5.2'
      && packageJson.dependencies.vue === '3.5.42'
      && packageJson.dependencies.h3 === '1.15.11'
      && packageJson.dependencies['drizzle-orm'] === '0.45.2'
      && packageJson.dependencies['better-sqlite3'] === '13.0.3')
  check('stage-3 core introduces no online translation SDK dependency',
    !Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies }).some(name => /deepl|translate|translator|openai|anthropic/i.test(name)))

  const migration = await readFile(resolve(root, 'migrations/0003_media_i18n_cache.sql'), 'utf8')
  check('cache generation table exists', migration.includes('CREATE TABLE "cache_generations"'))
  check('stage-3 migration does not own transactions', !/^[ \t]*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/imu.test(migration))

  const wrangler = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'))
  check('Cloudflare D1 binding is DB', wrangler.d1_databases?.some(item => item.binding === 'DB'))
  check('Cloudflare R2 binding is MEDIA', wrangler.r2_buckets?.some(item => item.binding === 'MEDIA'))
  check('Cloudflare Static Assets binding is ASSETS', wrangler.assets?.binding === 'ASSETS')

  const env = await readFile(resolve(root, '.env.example'), 'utf8')
  check('example media grant secret is blank', blankEnv(env, 'NUXT_MEDIA_GRANT_SECRET'))
  check('example cache origin is blank', blankEnv(env, 'NUXT_CACHE_ORIGIN'))

  const mediaContract = await readFile(resolve(root, 'shared/contracts/media.ts'), 'utf8')
  check('public media ViewModel hides platform storage internals',
    !/\b(?:storageKind|storage_kind|localPath|bucketName|r2Binding)\b/u.test(mediaContract))

  const mediaService = await readFile(resolve(root, 'server/services/media/media-service.ts'), 'utf8')
  check('media projection uses one catalog batch entry point', (mediaService.match(/\.projectionData\(/gu) ?? []).length === 1)
  check('media delivery uses one catalog batch entry point', (mediaService.match(/\.deliveryData\(/gu) ?? []).length === 1)

  const translationFiles = [
    ...await files(resolve(root, 'server/i18n'), '.ts'),
    ...await files(resolve(root, 'server/services/i18n'), '.ts'),
  ]
  for (const path of translationFiles) {
    const source = await readFile(path, 'utf8')
    check(`request-time translation has no network call: ${relative(root, path)}`,
      !/(?:\bfetch|\$fetch|axios)\s*\(|https?:\/\//u.test(source))
  }

  const cacheRuntime = await readFile(resolve(root, 'server/utils/cache-runtime.ts'), 'utf8')
  check('background cache refresh uses H3 event.waitUntil', /event\.waitUntil\(task\)/u.test(cacheRuntime))
  check('request-scoped cache services share an isolate/process coordinator', /coordinator:\s*coordinatorFor\(adapter\)/u.test(cacheRuntime))
  check('background cache refresh does not reach provider-private context', !/cloudflare\?*\.context|cloudflare\.context/u.test(cacheRuntime))

  const cloudflareCacheFactory = await readFile(resolve(root, 'server/adapters/cache-cloudflare.ts'), 'utf8')
  check('Cloudflare cache adapter identity is stable inside one isolate',
    /new WeakMap<object, CachedCloudflareAdapter>/u.test(cloudflareCacheFactory)
      && /return cached\.adapter/u.test(cloudflareCacheFactory))

  const stageRunner = await readFile(resolve(root, 'scripts/run-stage3-tests.mjs'), 'utf8')
  const stageHelper = await readFile(resolve(root, 'tests/helpers/offline-stage3.mjs'), 'utf8')
  check('stage-3 test compilation uses invocation-isolated temporary directories',
    /mkdtemp\(resolve\(tempRoot, 'stage3-core-'\)\)/u.test(stageRunner)
      && /STAGE3_CORE_OUTPUT: output/u.test(stageRunner)
      && /process\.env\.STAGE3_CORE_OUTPUT/u.test(stageHelper))

  const review = JSON.parse(await readFile(resolve(reportDir, 'review-cycles.json'), 'utf8'))
  check('at least two documented analysis and correction cycles exist',
    Array.isArray(review.cycles) && review.cycles.length >= 2
      && review.cycles.every(item => Number.isSafeInteger(item.cycle) && typeof item.result === 'string' && item.result.length > 0),
    { cycles: Array.isArray(review.cycles) ? review.cycles.length : null })
  report.reviewCycles = review.cycles.length

  const cloudflareOnly = [
    'server/adapters/media-cloudflare.ts',
    'server/adapters/cache-cloudflare.ts',
    'server/media/r2-store.ts',
    'server/cache/cloudflare-adapter.ts',
  ]
  for (const name of cloudflareOnly) {
    const source = await readFile(resolve(root, name), 'utf8')
    check(`Cloudflare path has no Node builtin import: ${name}`, !/(?:from\s+|import\s*)['"]node:/u.test(source))
  }

  const sourceFiles = await files(root, ['.ts', '.mjs', '.vue', '.sql', '.json', '.md', '.css'])
  for (const path of sourceFiles) {
    if (path.includes(`${resolve(root, '.tmp')}/`)) continue
    const source = await readFile(path, 'utf8')
    check(`text integrity: ${relative(root, path)}`, !source.includes('\0') && !/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(source))
  }
  report.textFiles = sourceFiles.length

  const syntax = [...await files(resolve(root, 'scripts'), '.mjs'), ...await files(resolve(root, 'tests'), '.mjs')]
  for (const path of syntax) await run(`JavaScript syntax: ${relative(root, path)}`, process.execPath, ['--check', path], null, 30_000)
  report.syntaxFiles = syntax.length
  report.status = 'passed_offline_only'
}
catch (error) {
  report.status = 'failed'
  report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
}
finally {
  await rm(resolve(root, '.tmp/stage3-core'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  await rm(resolve(root, '.tmp/stage3-http'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  await writeFile(resolve(reportDir, 'validation.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(resolve(reportDir, 'validation.md'), markdown(report))
  console.log(JSON.stringify({
    status: report.status,
    stage3Tests: report.stage3Tests,
    stabilityRuns: report.stabilityRuns,
    regression: report.regression,
    compiler: report.environment.compiler,
    checks: report.checks.length,
    report: 'reports/stage3/validation.json',
    ...(report.error ? { error: report.error } : {}),
  }, null, 2))
}
