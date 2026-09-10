import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations } from './db/migrations.mjs'
import { findCompiler } from './lib/typescript-compiler.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = resolve(root, 'reports/stage4')
await mkdir(reportDir, { recursive: true })

const report = {
  stage: 4,
  scope: 'offline public Design System, bounded SSR home aggregation, hydration contract, SEO and public UI acceptance; NOT Nuxt production/browser/native/workerd release acceptance',
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
    if (entry.isDirectory()) {
      if (['.git', '.nuxt', '.output', '.tmp', 'node_modules', 'reports'].includes(entry.name)) continue
      output.push(...await files(path, wanted))
    }
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
  const tests = result.stage4Tests ?? {}
  const regression = result.regression ?? {}
  const rows = [
    ['状态', result.status],
    ['生成时间', result.generatedAt],
    ['Node', result.environment.node],
    ['TypeScript', result.environment.compiler ?? '未运行'],
    ['阶段 4 测试', Number.isFinite(tests.tests) ? `${tests.passed}/${tests.tests}` : '未运行'],
    ['稳定性重复运行', result.stabilityRuns?.length ? result.stabilityRuns.map(item => `${item.passed}/${item.tests}`).join('、') : '未运行'],
    ['阶段 3 回归', regression.stage3 ?? '未运行'],
    ['阶段 2 安全回归', Number.isFinite(regression.securityTests?.tests) ? `${regression.securityTests.passed}/${regression.securityTests.tests}` : '未运行'],
    ['阶段 1 数据库回归', Number.isFinite(regression.databaseTests?.tests) ? `${regression.databaseTests.passed}/${regression.databaseTests.tests}` : '未运行'],
    ['Node 构建契约', Number.isFinite(result.nodeBuildTests?.tests) ? `${result.nodeBuildTests.passed}/${result.nodeBuildTests.tests}` : '未运行'],
    ['分析修正轮次', result.reviewCycles ?? '未运行'],
    ['检查项', `${checksPassed} 通过，${checksFailed} 失败`],
  ]
  const details = result.checks.map(item => `| ${item.name.replaceAll('|', '\\|')} | ${item.status} |`).join('\n')
  return `# 阶段 4 离线验收报告\n\n> 本报告覆盖公开站 Design System、SSR 首页数据闭环、双语投影、应用缓存、SEO、错误状态与源码隔离的离线验收；不代表 Nuxt 生产构建、真实浏览器 hydration、初始 JavaScript gzip、Lighthouse、native better-sqlite3 或 workerd 平台验收已经通过。\n\n## 验收摘要\n\n| 项目 | 结果 |\n|---|---|\n${rows.map(([name, value]) => `| ${name} | ${String(value).replaceAll('|', '\\|')} |`).join('\n')}\n\n## 检查明细\n\n| 检查 | 结果 |\n|---|---|\n${details}\n${result.error ? `\n## 失败原因\n\n\`${result.error.replaceAll('`', '\\`')}\`\n` : ''}`
}

try {
  const baseline = JSON.parse(await readFile(resolve(reportDir, 'input-baseline.json'), 'utf8'))
  for (const [name, expected] of Object.entries(baseline.protected_documents)) {
    const path = resolve(root, name)
    const data = await readFile(path)
    check(`protected document: ${name}`, sha256(data) === expected)
    if (/^docs\/0[1-4]_/.test(name)) check(`read-only document: ${name}`, ((await stat(path)).mode & 0o222) === 0)
  }

  const stageDocument = resolve(root, 'docs/15_公开站DesignSystem与SSR数据闭环.md')
  check('stage-4 feature design document exists', (await stat(stageDocument)).isFile())
  const duplicateStageDocuments = (await readdir(resolve(root, 'docs'))).filter(name => /^15_.*\.md$/u.test(name))
  check('stage-4 has one canonical numbered design document', duplicateStageDocuments.length === 1, duplicateStageDocuments)

  const migrations = await loadMigrations(resolve(root, 'migrations'))
  check('stage-4 preserves the append-only migration set',
    migrations.map(item => item.name).slice(0, 3).join(',') === '0001_initial.sql,0002_auth_security.sql,0003_media_i18n_cache.sql'
      && migrations.length >= 3,
    migrations.map(item => ({ name: item.name, sha256: item.sha256 })))
  await run('migration manifest is current', process.execPath, ['scripts/db/update-manifest.mjs', '--check'], 'migration-manifest.log')
  await run('generated database schema/catalog/types remain current', process.execPath, ['scripts/db/generate-schema.mjs', '--check'], 'schema-generation.log')

  const compiler = await findCompiler(root)
  report.environment.compiler = compiler.version
  report.environment.compilerSource = compiler.source
  await run('strict stage-4 service TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage4.json', '--noEmit'], 'stage4-core-typecheck.log')
  await run('strict stage-4 H3/platform TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.stage4-http.json', '--noEmit'], 'stage4-http-typecheck.log')

  const tap = await run('stage-4 dual-adapter, SSR and adversarial contracts', process.execPath, ['scripts/run-stage4-tests.mjs'], 'final-stage4.tap')
  report.stage4Tests = parseTap(tap)
  check('all stage-4 tests actually ran without failure, skip or cancellation', completeTap(report.stage4Tests), report.stage4Tests)

  report.stabilityRuns = []
  for (let index = 1; index <= 2; index += 1) {
    const repeatedTap = await run(`stage-4 stability repetition ${index}`, process.execPath, ['scripts/run-stage4-tests.mjs'], `stability-${index}.tap`)
    const parsed = parseTap(repeatedTap)
    report.stabilityRuns.push(parsed)
    check(`stage-4 stability repetition ${index} is complete`, completeTap(parsed), parsed)
  }

  const nodeTestFiles = (await files(resolve(root, 'tests/node'), '.test.mjs')).map(path => relative(root, path))
  check('Node build-target contract files exist', nodeTestFiles.length > 0, nodeTestFiles)
  const nodeTap = await run('stage-0 build-target Node contracts', process.execPath, ['--test', '--test-reporter=tap', ...nodeTestFiles], 'node-build-contracts.tap')
  report.nodeBuildTests = parseTap(nodeTap)
  check('all Node build-target contracts ran without skip or failure', completeTap(report.nodeBuildTests), report.nodeBuildTests)

  await run('stage-3 media/cache, stage-2 security, stage-1 database and stage-0 regression suite', process.execPath, ['scripts/verify-stage3.mjs'], 'stage3-regression.log', 900_000)
  const stage3 = JSON.parse(await readFile(resolve(root, 'reports/stage3/validation.json'), 'utf8'))
  check('stage-3 regression remains accepted offline', stage3.status === 'passed_offline_only', {
    status: stage3.status,
    stage3Tests: stage3.stage3Tests,
    regression: stage3.regression,
  })
  report.regression = {
    stage3: stage3.status,
    stage3Tests: stage3.stage3Tests,
    stage3StabilityRuns: stage3.stabilityRuns,
    stage2: stage3.regression?.stage2,
    securityTests: stage3.regression?.securityTests,
    stage1: stage3.regression?.stage1,
    databaseTests: stage3.regression?.databaseTests,
  }

  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  check('stage-4 runtime dependencies remain exact pins',
    packageJson.dependencies.nuxt === '4.5.2'
      && packageJson.dependencies.vue === '3.5.42'
      && packageJson.dependencies.h3 === '1.15.11'
      && packageJson.dependencies['@lucide/vue'] === '1.35.0'
      && packageJson.devDependencies.tailwindcss === '4.3.3'
      && packageJson.devDependencies['@tailwindcss/vite'] === '4.3.3')
  const publicBundleFiles = [
    ...await files(resolve(root, 'app/components/public'), ['.vue', '.ts']),
    ...await files(resolve(root, 'app/composables'), '.ts'),
    ...await files(resolve(root, 'app/pages/zh'), ['.vue', '.ts']),
    ...await files(resolve(root, 'app/pages/en'), ['.vue', '.ts']),
    resolve(root, 'app/layouts/public.vue'),
  ]
  const publicBundleSource = (await Promise.all(publicBundleFiles.map(path => readFile(path, 'utf8')))).join('\n')
  check('public source contract does not import heavy administration features',
    !/(?:from\s+|import\s*)['"](?:element-plus|@tiptap\/|echarts|pdfjs-dist)/iu.test(publicBundleSource))

  const nuxt = await readFile(resolve(root, 'nuxt.config.ts'), 'utf8')
  check('Tailwind is integrated through the Vite plugin',
    /from '@tailwindcss\/vite'/u.test(nuxt) && /plugins:\s*\[\s*tailwindcss\(\)(?:,|\])/u.test(nuxt))
  check('SSR remains enabled and admin remains explicitly client-rendered',
    /ssr:\s*true/u.test(nuxt) && /'\/admin\/\*\*'[\s\S]*?ssr:\s*false/u.test(nuxt))
  check('public canonical origin is explicit runtime configuration',
    /siteUrl:\s*process\.env\.NUXT_PUBLIC_SITE_URL/u.test(nuxt))

  const css = await readFile(resolve(root, 'app/assets/public/base.css'), 'utf8')
  check('Tailwind public utilities are prefixed and omit Preflight',
    /tailwindcss\/theme\.css[^;]+prefix\(pub\)/u.test(css)
      && /tailwindcss\/utilities\.css[^;]+prefix\(pub\)/u.test(css)
      && !/preflight\.css/u.test(css))
  check('public CSS contains motion and forced-color adaptations',
    /prefers-reduced-motion/u.test(css) && /forced-colors/u.test(css))

  const publicFiles = await files(resolve(root, 'app/components/public'), ['.vue', '.ts'])
  check('public component library is non-empty', publicFiles.length >= 10, { files: publicFiles.length })
  for (const path of publicFiles) {
    const source = await readFile(path, 'utf8')
    const name = relative(root, path)
    check(`public UI has no admin or heavyweight editor import: ${name}`,
      !/components\/admin|assets\/admin|element-plus|@tiptap\/|echarts|pdfjs/iu.test(source))
    check(`public UI uses no raw HTML rendering: ${name}`, !/\bv-html\b/u.test(source))
  }

  const adminFiles = await files(resolve(root, 'app/components/admin'), ['.vue', '.ts'])
  for (const path of adminFiles) {
    const source = await readFile(path, 'utf8')
    check(`admin UI does not import public presentation components: ${relative(root, path)}`,
      !/components\/public|assets\/public/u.test(source))
  }

  const publicLayout = await readFile(resolve(root, 'app/layouts/public.vue'), 'utf8')
  const adminLayout = await readFile(resolve(root, 'app/layouts/admin.vue'), 'utf8')
  check('public and admin CSS ownership is isolated',
    /assets\/public\/base\.css/u.test(publicLayout)
      && !/assets\/admin/u.test(publicLayout)
      && !/assets\/public/u.test(adminLayout))
  check('public layout exposes skip navigation and main landmark',
    /skip-link/u.test(publicLayout) && /id="main-content"/u.test(publicLayout))

  const useHome = await readFile(resolve(root, 'app/composables/usePublicHome.ts'), 'utf8')
  check('SSR home uses one stable payload-aware useFetch contract',
    /useFetch<PublicHomeViewModel>/u.test(useHome)
      && /public-home:v1:/u.test(useHome)
      && /server:\s*true/u.test(useHome)
      && /dedupe:\s*'defer'/u.test(useHome)
      && !/\$fetch|useAsyncData/u.test(useHome))

  const publicClientFiles = [
    ...await files(resolve(root, 'app/composables'), ['.ts']),
    ...await files(resolve(root, 'app/pages/zh'), ['.vue', '.ts']),
    ...await files(resolve(root, 'app/pages/en'), ['.vue', '.ts']),
    ...publicFiles,
  ]
  for (const path of publicClientFiles) {
    const source = await readFile(path, 'utf8')
    check(`public client source has no direct database/platform import: ${relative(root, path)}`,
      !/(?:~~\/|\.\.\/)+(?:db|server)\//u.test(source))
  }

  const seo = await readFile(resolve(root, 'app/composables/usePublicSeo.ts'), 'utf8')
  check('SEO uses configured origin, canonical and complete language alternates',
    /runtime\.public\.siteUrl/u.test(seo)
      && /rel:\s*'canonical'/u.test(seo)
      && /hreflang:\s*'zh-CN'/u.test(seo)
      && /hreflang:\s*'en'/u.test(seo)
      && /hreflang:\s*'x-default'/u.test(seo)
      && /ogTitle/u.test(seo)
      && /twitterCard/u.test(seo))
  check('SEO never derives public origin from request headers',
    !/getRequestURL|getHeaders|useRequestURL|x-forwarded-host|host\s*:/iu.test(seo))

  const errorPage = await readFile(resolve(root, 'app/error.vue'), 'utf8')
  check('global error page remains independent of data services and both presentation trees',
    /clearError/u.test(errorPage)
      && /<style scoped>/u.test(errorPage)
      && !/usePublicHome|database|repository|mediaService|publicRuntime|cache/iu.test(errorPage)
      && !/assets\/(?:public|admin)/u.test(errorPage))

  const homePlan = await readFile(resolve(root, 'db/read-plans.ts'), 'utf8')
  const homeStore = await readFile(resolve(root, 'server/services/public/public-home-store.ts'), 'utf8')
  check('home data layer retains one bounded seven-statement batch',
    /PUBLIC_HOME_BATCH_SIZE\s*=\s*7/u.test(homePlan)
      && /commands\.length\s*!==\s*PUBLIC_HOME_BATCH_SIZE/u.test(homeStore)
      && /adapter\.batch\(/u.test(homeStore))
  check('home store does not select contact, password or long news content',
    !/password_hash|\bemail\b|\bphone\b|\boffice\b|\bcontent\b/iu.test(homePlan))

  const homeService = await readFile(resolve(root, 'server/services/public/public-home-service.ts'), 'utf8')
  check('home cache retention is bounded by media grant lifetime with assembly headroom',
    /publicMediaGrantSeconds\s*-\s*20/u.test(homeService)
      && /MAX_HOME_ASSEMBLY_MILLISECONDS\s*=\s*20_000/u.test(homeService))
  check('translations and media projection are prepared concurrently',
    /Promise\.all\(/u.test(homeService))
  check('public home model is serialized by the canonical ViewModel serializer',
    /stablePublicJson/u.test(homeService) && /sha256Hex/u.test(homeService))

  const mediaImage = await readFile(resolve(root, 'app/components/public/MediaImage.vue'), 'utf8')
  const header = await readFile(resolve(root, 'app/components/public/SiteHeader.vue'), 'utf8')
  const hero = await readFile(resolve(root, 'app/components/public/home/Hero.vue'), 'utf8')
  check('only the likely LCP image requests high fetch priority',
    /priority \? 'high'/u.test(mediaImage)
      && !/\bpriority\b/u.test(header)
      && /\bpriority\b/u.test(hero))

  const apiRoute = await readFile(resolve(root, 'server/routes/api/v1/public/home.get.ts'), 'utf8')
  const publicQuery = await readFile(resolve(root, 'server/services/public/public-query.ts'), 'utf8')
  const publicHttp = await readFile(resolve(root, 'server/utils/public-http.ts'), 'utf8')
  check('public home API validates language and supports bounded conditional revalidation',
    /parsePublicLocaleQuery/u.test(apiRoute)
      && /locale must be zh or en/u.test(publicQuery)
      && /ifNoneMatchMatches/u.test(publicHttp)
      && /setResponseStatus\(event, 304\)/u.test(publicHttp)
      && /max-age=0, must-revalidate/u.test(publicHttp))
  check('public home API exposes no private cache or stack diagnostics',
    !/authorization|cookie|session|stack|sql/iu.test(`${apiRoute}\n${publicHttp}`))

  const etag = await readFile(resolve(root, 'shared/utils/http-etag.ts'), 'utf8')
  check('If-None-Match parsing is byte-bounded and uses weak opaque-tag comparison',
    /MAX_IF_NONE_MATCH_BYTES\s*=\s*8_192/u.test(etag)
      && /value\.startsWith\('W\/'\)/u.test(etag)
      && /entityTagList/u.test(etag))

  const env = await readFile(resolve(root, '.env.example'), 'utf8')
  check('example canonical site URL is blank and must be explicitly configured', blankEnv(env, 'NUXT_PUBLIC_SITE_URL'))

  const review = JSON.parse(await readFile(resolve(reportDir, 'review-cycles.json'), 'utf8'))
  check('at least two documented write-analysis-correction cycles exist',
    Array.isArray(review.cycles) && review.cycles.length >= 2
      && review.cycles.every(item => Number.isSafeInteger(item.cycle)
        && Array.isArray(item.findings) && item.findings.length > 0
        && Array.isArray(item.corrections) && item.corrections.length > 0
        && typeof item.result === 'string' && item.result.length > 0),
    { cycles: Array.isArray(review.cycles) ? review.cycles.length : null })
  report.reviewCycles = review.cycles.length

  const cloudflareOnly = [
    'server/adapters/media-cloudflare.ts',
    'server/adapters/cache-cloudflare.ts',
    'server/adapters/database-cloudflare.ts',
  ]
  for (const name of cloudflareOnly) {
    const source = await readFile(resolve(root, name), 'utf8')
    check(`Cloudflare path has no Node builtin import: ${name}`, !/(?:from\s+|import\s*)['"]node:/u.test(source))
  }

  const sourceFiles = await files(root, ['.ts', '.mjs', '.vue', '.sql', '.json', '.md', '.css', '.html'])
  for (const path of sourceFiles) {
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
  for (const name of ['stage4-core', 'stage4-http']) {
    await rm(resolve(root, `.tmp/${name}`), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  }
  await writeFile(resolve(reportDir, 'validation.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(resolve(reportDir, 'validation.md'), markdown(report))
  console.log(JSON.stringify({
    status: report.status,
    stage4Tests: report.stage4Tests,
    stabilityRuns: report.stabilityRuns,
    regression: report.regression,
    nodeBuildTests: report.nodeBuildTests,
    reviewCycles: report.reviewCycles,
    compiler: report.environment.compiler,
    checks: report.checks.length,
    report: 'reports/stage4/validation.json',
    ...(report.error ? { error: report.error } : {}),
  }, null, 2))
}
