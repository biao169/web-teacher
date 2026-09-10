import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectRoot } from './lib/run-command.mjs'

const requireLock = process.argv.includes('--require-lock')
const passed = []
const warnings = []
const failures = []

function check(condition, message) {
  if (condition) passed.push(message)
  else failures.push(message)
}

async function exists(path) {
  return access(resolve(projectRoot, path), constants.F_OK).then(() => true, () => false)
}

async function text(path) {
  return readFile(resolve(projectRoot, path), 'utf8')
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(resolve(projectRoot, path))).digest('hex')
}

function isPinnedVersion(version) {
  if (typeof version !== 'string' || !version) return false
  if (version.startsWith('npm:')) return /@\d+(?:\.\d+){2}(?:[-+][0-9A-Za-z.-]+)?$/.test(version)
  return /^\d+(?:\.\d+){2}(?:[-+][0-9A-Za-z.-]+)?$/.test(version)
}

function balancedBraces(source) {
  let depth = 0
  let inComment = false
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index]
    const next = source[index + 1]
    if (!inComment && current === '/' && next === '*') {
      inComment = true
      index += 1
      continue
    }
    if (inComment && current === '*' && next === '/') {
      inComment = false
      index += 1
      continue
    }
    if (inComment) continue
    if (current === '{') depth += 1
    if (current === '}') depth -= 1
    if (depth < 0) return false
  }
  return depth === 0 && !inComment
}

const requiredFiles = [
  'package.json',
  '.node-version',
  '.nvmrc',
  '.github/workflows/current-source.yml',
  'pnpm-workspace.yaml',
  'nuxt.config.ts',
  'wrangler.jsonc',
  'tsconfig.json',
  'tsconfig.core.json',
  'eslint.config.mjs',
  'vitest.config.ts',
  'playwright.config.ts',
  'app/app.vue',
  'app/spa-loading-template.html',
  'app/layouts/public.vue',
  'app/layouts/admin.vue',
  'app/components/public/Brand.vue',
  'app/components/admin/Brand.vue',
  'app/pages/zh/index.vue',
  'app/pages/en/index.vue',
  'app/pages/admin/index.vue',
  'app/assets/public/base.css',
  'app/assets/admin/base.css',
  'server/middleware/00-request-context.ts',
  'server/routes/health.get.ts',
  'server/types/h3.d.ts',
  'server/utils/health.ts',
  'shared/contracts/health.ts',
  'shared/utils/request-id.ts',
  'shared/utils/locale-path.ts',
  'scripts/build-target.mjs',
  'scripts/run-built-target.mjs',
  'scripts/smoke-runtime.mjs',
  'scripts/lib/build-output.mjs',
  'scripts/lib/cloudflare-assets.mjs',
  'scripts/lib/run-command.mjs',
  'scripts/verify-stage0.mjs',
  'scripts/verify-contracts.mjs',
  'tests/unit/health.spec.ts',
  'tests/unit/request-id.spec.ts',
  'tests/unit/locale-path.spec.ts',
  'tests/e2e/smoke.spec.ts',
  'tests/node/build-output.test.mjs',
  'docs/06_网站设计与系统架构.md',
  'README.md',
]
for (const file of requiredFiles) check(await exists(file), `required file: ${file}`)

const forbiddenPaths = [
  '.npmrc',
  'app/pages/index.vue',
  'app/assets/styles',
  'app/components/public/PublicBrand.vue',
  'app/components/admin/AdminBrand.vue',
  'scripts/preview-runtime.mjs',
  'scripts/verify-health-contract.mjs',
  'scripts/verify-scaffold.mjs',
  'scripts/verify-phase0.mjs',
  'scripts/verify-runtime-contracts.mjs',
  'tests/unit/health.test.ts',
]
for (const path of forbiddenPaths) check(!(await exists(path)), `obsolete path absent: ${path}`)

const packageJson = JSON.parse(await text('package.json'))
check(packageJson.name === 'academic-cms', 'single service name')
check(packageJson.version === '0.1.0', 'initial application version')
check(packageJson.private === true, 'package is private')
check(packageJson.type === 'module', 'project uses native ESM')
check(packageJson.packageManager === 'pnpm@11.19.0', 'pnpm version pinned')
check(packageJson.engines?.node === '>=24.19.0 <25', 'Node 24 LTS engine range')
check(packageJson.engines?.pnpm === '>=11.19.0 <12', 'pnpm 11 engine range')
check((await text('.node-version')).trim() === '24.19.0', '.node-version matches the Windows runtime')
check((await text('.nvmrc')).trim() === '24.19.0', '.nvmrc matches the Windows runtime')
const currentSourceWorkflow = await text('.github/workflows/current-source.yml')
check(currentSourceWorkflow.includes('node-version: 24.19.0'), 'CI Node version matches the Windows runtime')
check(currentSourceWorkflow.includes('corepack prepare pnpm@11.19.0 --activate'), 'CI pnpm version matches the Windows runtime')
check(packageJson.dependencies?.nuxt === '4.5.2', 'Nuxt exact version')
check(packageJson.dependencies?.vue === '3.5.42', 'Vue exact version')
check(packageJson.devDependencies?.vite === '8.2.2', 'Vite exact version')
check(packageJson.devDependencies?.typescript === 'npm:@typescript/typescript6@6.0.2', 'Vue-compatible TypeScript 6 package')
check(!Object.hasOwn(packageJson.scripts ?? {}, 'prepare'), 'Nuxt install lifecycle is not duplicated')
check(packageJson.scripts?.postinstall === 'nuxt prepare', 'Nuxt generated types are prepared after install')
for (const [section, dependencies] of Object.entries({
  dependencies: packageJson.dependencies ?? {},
  devDependencies: packageJson.devDependencies ?? {},
})) {
  for (const [name, version] of Object.entries(dependencies)) {
    check(isPinnedVersion(version), `${section} version pinned: ${name}@${version}`)
  }
}

const expectedScripts = {
  'build:ubuntu': 'node scripts/build-target.mjs ubuntu',
  'build:cloudflare': 'node scripts/build-target.mjs cloudflare',
  start: 'node scripts/run-built-target.mjs start-ubuntu',
  'preview:cloudflare': 'pnpm run build:cloudflare && node scripts/run-built-target.mjs preview-cloudflare',
  'deploy:cloudflare': 'pnpm run build:cloudflare && node scripts/run-built-target.mjs deploy-cloudflare',
  'typecheck:core': 'tsc6 --project tsconfig.core.json',
  'verify:contracts': 'node scripts/verify-contracts.mjs',
  'verify:stage0': 'node scripts/verify-stage0.mjs && node scripts/verify-contracts.mjs && node --test tests/node/*.test.mjs',
  'verify:stage0:ci': 'node scripts/verify-stage0.mjs --require-lock && node scripts/verify-contracts.mjs && node --test tests/node/*.test.mjs',
  'smoke:ubuntu': 'node scripts/smoke-runtime.mjs ubuntu',
  'smoke:cloudflare': 'node scripts/smoke-runtime.mjs cloudflare',
  'acceptance:ubuntu': 'pnpm run build:ubuntu && pnpm run smoke:ubuntu',
  'acceptance:cloudflare': 'pnpm run build:cloudflare && pnpm run smoke:cloudflare',
}
for (const [name, command] of Object.entries(expectedScripts)) {
  check(packageJson.scripts?.[name] === command, `canonical script: ${name}`)
}
check(!Object.keys(packageJson.scripts ?? {}).some(name => name.includes('phase0')), 'stage naming is consistent')
check(!Object.values(packageJson.scripts ?? {}).some(value => /(^|\s)(NITRO_PRESET|NUXT_\w+)=/.test(value)), 'scripts avoid POSIX-only inline environment syntax')
for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  const matches = [...command.matchAll(/(?:^|\s)(scripts\/[0-9A-Za-z_./-]+\.mjs)(?=\s|$)/g)]
  for (const match of matches) check(await exists(match[1]), `script target exists: ${name} -> ${match[1]}`)
}

const workspace = await text('pnpm-workspace.yaml')
for (const token of [
  'engineStrict: true',
  "savePrefix: ''",
  'autoInstallPeers: false',
  'strictPeerDependencies: true',
  'minimumReleaseAge: 1440',
  'strictDepBuilds: true',
  'allowBuilds:',
  'overrides:',
  'vite: 8.2.2',
]) check(workspace.includes(token), `pnpm workspace setting: ${token}`)

const nuxtConfig = await text('nuxt.config.ts')
for (const token of [
  "srcDir: 'app/'",
  "'/_nuxt/**':",
  'max-age=31536000, immutable',
  "'/admin':",
  "'/admin/**':",
  'ssr: false',
  "'cache-control': 'private, no-store, max-age=0'",
  "'x-robots-tag': 'noindex, nofollow'",
  "payloadExtraction: 'client'",
  'compressPublicAssets: true',
  'sourceMap: false',
  "target: 'es2022'",
]) check(nuxtConfig.includes(token), `Nuxt configuration: ${token}`)
const localeRootSource = await text('server/routes/index.ts')
check(localeRootSource.includes('resolveVisitorLocale') && localeRootSource.includes('sendRedirect') && localeRootSource.includes('302') && localeRootSource.includes('no-store'), 'root language redirect is negotiated, temporary and uncacheable')
check(!nuxtConfig.includes("'/zh/**'" ) && !nuxtConfig.includes("'/en/**'"), 'public SWR is opt-in rather than a visibility-blind wildcard')
check(!nuxtConfig.includes('pageTransition'), 'global page transition is omitted from the performance baseline')
check(nuxtConfig.includes("preset === 'cloudflare_module'"), 'runtime detection recognizes the Cloudflare module preset')
check(nuxtConfig.includes("preset === 'node-server'"), 'runtime detection recognizes the Ubuntu node-server preset')

const buildOutputSource = await text('scripts/lib/build-output.mjs')
check(buildOutputSource.includes("nitroPreset: 'node-server'"), 'Ubuntu uses node-server')
check(buildOutputSource.includes("nitroPreset: 'cloudflare_module'"), 'Cloudflare uses the recommended module preset')
check(buildOutputSource.includes('Build target mismatch'), 'runtime commands reject wrong target output')
check(buildOutputSource.includes('await rename(temporaryFile, paths.metadataFile)'), 'build metadata is committed atomically')
check(buildOutputSource.includes('APP_VERSION_PATTERN'), 'build metadata validates version identifiers')
check(buildOutputSource.includes('parsed?.nitroPreset !== declaredTarget.nitroPreset'), 'build metadata validates target/preset consistency')
check(buildOutputSource.includes('builtAt.toISOString() !== parsed.builtAt'), 'build metadata validates canonical timestamps')

const buildScript = await text('scripts/build-target.mjs')
const runScript = await text('scripts/run-built-target.mjs')
const smokeScript = await text('scripts/smoke-runtime.mjs')
check(/resolve\(projectRoot,\s*'\.wrangler',\s*'deploy',\s*'config\.json'\)/.test(buildScript) && /rm\(generatedRedirect,/.test(buildScript), 'build removes generated Wrangler config redirects')
check(buildScript.includes('writeCloudflareStaticHeaders(output.publicDir)'), 'Cloudflare build emits static-asset cache headers')
check(/NITRO_PRESET\s*:\s*target\.nitroPreset/.test(buildScript), 'build passes the selected Nitro preset explicitly')
check(/NUXT_RUNTIME_KIND\s*:\s*target\.runtimeKind/.test(buildScript), 'build embeds the selected runtime kind')
check(runScript.includes("'--config', 'wrangler.jsonc'"), 'Wrangler commands use the checked-in config explicitly')
check(runScript.includes("assertBuildTarget('ubuntu'"), 'Ubuntu start validates the artifact identity')
check(runScript.includes("assertBuildTarget('cloudflare'"), 'Cloudflare actions validate the artifact identity')
check(smokeScript.includes('response.status !== 302'), 'runtime smoke test enforces the root redirect contract')
check(smokeScript.includes("Root redirect is cacheable"), 'runtime smoke test enforces non-cacheable locale selection')
check(smokeScript.includes('await Promise.race'), 'runtime smoke test waits for child shutdown')
check(smokeScript.includes('child.signalCode === null'), 'runtime smoke distinguishes signaled child exit from a live process')

const wrangler = JSON.parse(await text('wrangler.jsonc'))
check(wrangler.name === 'academic-cms', 'Wrangler service name')
check(wrangler.main === '.output/server/index.mjs', 'Wrangler server entry')
check(wrangler.assets?.directory === '.output/public', 'Wrangler static assets directory')
check(wrangler.assets?.binding === 'ASSETS', 'Wrangler assets binding')
check(Array.isArray(wrangler.compatibility_flags) && wrangler.compatibility_flags.includes('nodejs_compat'), 'Wrangler Node compatibility flag')
check(!Object.hasOwn(wrangler.assets ?? {}, 'run_worker_first'), 'matching static assets bypass Worker')
check(wrangler.observability?.enabled === true, 'Cloudflare observability is enabled')

const publicLayout = await text('app/layouts/public.vue')
const publicHeader = await text('app/components/public/SiteHeader.vue')
const publicUiShell = `${publicLayout}
${publicHeader}`
const adminLayout = await text('app/layouts/admin.vue')
check(publicLayout.includes('~/assets/public/base.css'), 'public layout owns public CSS')
check(!publicLayout.includes('assets/admin'), 'public layout excludes admin CSS')
check(adminLayout.includes('~/assets/admin/base.css'), 'admin layout owns admin CSS')
check(!adminLayout.includes('assets/public'), 'admin layout excludes public CSS')
check(publicLayout.includes('<PublicSiteHeader') && publicHeader.includes('class="public-brand"'), 'public component namespace and brand are explicit')
check(adminLayout.includes('<AdminSidebar') && adminLayout.includes('<AdminTopbar'), 'admin component namespace is explicit')
check(publicHeader.includes("from '~~/shared/utils/locale-path'"), 'public UI uses a root-stable shared locale-path import')
check(publicUiShell.includes(':aria-label="labels.languageLabel"'), 'language switch has a bound accessible label')
check(publicUiShell.includes(':hreflang='), 'language switch declares the target language')
check(publicHeader.includes('switchLocalePath(route.fullPath, targetLocale.value)'), 'language switch preserves query and hash through the shared full-path utility')
check(publicHeader.includes('<a class="public-icon-link" href="/admin">'), 'public navigation enters the separately loaded admin application without prefetch')
check(adminLayout.includes("meta: [{ name: 'robots', content: 'noindex,nofollow' }]"), 'admin layout repeats noindex in document metadata')

const publicCss = await text('app/assets/public/base.css')
const adminCss = await text('app/assets/admin/base.css')
check(publicCss.includes('.public-body {'), 'public CSS variables are body-scoped')
check(!publicCss.includes('\nbody {'), 'public CSS has no unscoped body rule')
check(adminCss.includes('.admin-body {'), 'admin CSS variables are body-scoped')
check(!adminCss.includes('\nbody {'), 'admin CSS has no unscoped body rule')
check(balancedBraces(publicCss), 'public CSS braces are balanced')
check(balancedBraces(adminCss), 'admin CSS braces are balanced')
check(!publicCss.includes('.page-enter-') && !publicCss.includes('.page-leave-'), 'public CSS contains no dead page-transition rules')
check(publicCss.includes('.public-body *, .public-body *::before'), 'public reduced-motion rules stay UI-scoped')
check(adminCss.includes('.admin-body *, .admin-body *::before'), 'admin reduced-motion rules stay UI-scoped')

for (const file of ['app/pages/zh/index.vue', 'app/pages/en/index.vue']) {
  const source = await text(file)
  check(!source.includes('/health'), `public page excludes diagnostic UI: ${file}`)
  check(!/https?:\/\//.test(source), `public page has no runtime CDN dependency: ${file}`)
  check(!source.includes('to="/admin"'), `public page does not duplicate or prefetch admin navigation: ${file}`)
  check(source.includes("definePageMeta({ layout: 'public' })"), `public page selects public layout: ${file}`)
}

const adminPage = await text('app/pages/admin/index.vue')
const adminDashboardComposable = await text('app/composables/useAdminDashboard.ts')
check(adminPage.includes("definePageMeta({ layout: 'admin' })"), 'admin page selects admin layout')
check(adminPage.includes('useAdminDashboard()'), 'admin dashboard consumes the bounded administration endpoint')
check(!adminPage.includes("'/health'") && !adminDashboardComposable.includes("'/health'"), 'admin dashboard does not depend on the public health probe')
check(adminDashboardComposable.includes("'/api/v1/admin/dashboard'"), 'admin dashboard has an explicit private API boundary')
check(adminDashboardComposable.includes('useQuery('), 'admin dashboard uses client-side server-state loading')

const requestIdSource = await text('shared/utils/request-id.ts')
check(requestIdSource.indexOf('options.cloudflareRay') < requestIdSource.indexOf('options.forwardedRequestId'), 'Cloudflare Ray ID has priority')
check(requestIdSource.includes('options.generate ? options.generate() : crypto.randomUUID()'), 'randomUUID is invoked with a safe binding')
check(requestIdSource.includes('throw new TypeError'), 'unsafe generated IDs fail closed')
const requestMiddleware = await text('server/middleware/00-request-context.ts')
check(requestMiddleware.includes("config.runtimeKind === 'cloudflare'"), 'cf-ray is trusted only in Cloudflare artifacts')
check(requestMiddleware.includes("getHeader(event, 'x-request-id')"), 'sanitized forwarded request IDs are supported')
check(requestMiddleware.includes("setHeader(event, 'x-request-id', requestId)"), 'request ID is returned to clients')

const healthRoute = await text('server/routes/health.get.ts')
const healthUtility = await text('server/utils/health.ts')
const healthCombined = `${healthRoute}\n${healthUtility}`
for (const forbidden of ['fetch(', 'D1Database', 'R2Bucket', 'better-sqlite3', 'process.env.DB']) {
  check(!healthCombined.includes(forbidden), `health excludes external dependency: ${forbidden}`)
}
check(healthRoute.includes("'cache-control': 'no-store, max-age=0'"), 'health is uncacheable')
check(healthRoute.includes("'x-content-type-options': 'nosniff'"), 'health prevents MIME sniffing')
check(healthRoute.includes('requestId: event.context.requestId'), 'health correlates request ID')
check(healthUtility.includes('Health clock returned an invalid date'), 'health rejects invalid clock values')
check(healthUtility.includes('normalizeHealthVersion'), 'health validates version identifiers')
check(healthUtility.includes('normalizeRequestId'), 'health validates request IDs at the contract boundary')

const localeUtility = await text('shared/utils/locale-path.ts')
check(localeUtility.includes('LOCALIZED_PREFIX'), 'locale utility restricts supported language prefixes')
check(localeUtility.includes("normalizedPath.search(/[?#]/)"), 'locale fallback preserves query and hash suffixes')

const cloudflareHeaders = await text('scripts/lib/cloudflare-assets.mjs')
check(cloudflareHeaders.includes('/_nuxt/*'), 'Cloudflare cache headers target fingerprinted Nuxt assets only')
check(cloudflareHeaders.includes('max-age=31536000, immutable'), 'Cloudflare Nuxt assets receive immutable browser caching')
check(!/^\/\*\s*$/m.test(cloudflareHeaders), 'Cloudflare cache policy does not make HTML globally immutable')

for (const token of [
  "request('/health'",
  "request('/', { redirect: 'manual', headers: { cookie: 'academic-cms-locale=zh' } })",
  "request('/zh')",
  "request('/admin')",
]) check(smokeScript.includes(token), `runtime smoke covers ${token}`)
check(smokeScript.includes('Runtime exited before smoke completion'), 'runtime smoke fails on early process exit')
check(smokeScript.includes("includes('noindex')"), 'runtime smoke verifies admin indexing protection')
check(smokeScript.includes("includes('no-store')"), 'runtime smoke verifies private and health cache boundaries')
check(smokeScript.includes('body.runtime !== target.runtimeKind'), 'runtime smoke verifies the embedded runtime identity')
check(smokeScript.includes('verifyImmutableNuxtAsset'), 'runtime smoke verifies immutable Nuxt asset delivery')
check(smokeScript.includes("cacheControl.includes('max-age=31536000')"), 'runtime smoke enforces the long-lived asset cache budget')

const e2eSource = await text('tests/e2e/smoke.spec.ts')
for (const token of [
  'health endpoint is uncacheable',
  'does not trust a spoofed CF Ray header',
  'root redirects temporarily without caching the language decision',
  'Chinese public route is rendered',
  'English public route exposes matching locale',
  'admin route is private, client-rendered, and anonymous access enters the login flow',
]) check(e2eSource.includes(token), `Playwright contract: ${token}`)

const readme = await text('README.md')
const stage0Design = await text('docs/06_网站设计与系统架构.md')
check(readme.includes('`cloudflare_module`（Workers Module）'), 'README documents the exact Cloudflare preset')
check(stage0Design.includes('`cloudflare_module`（Workers Module）'), 'stage design documents the exact Cloudflare preset')

const protectedHashes = {
  'docs/01_site_overview.md': '1f608d2f1d6218b9a97e42cb7457795fbefde19f23b93944649da1940514b2dd',
  'docs/02_database_schema.md': 'bfb66c781814322df5b09ffc9ff34df31a83b8fb40f9a0164498128fdf62e7d2',
  'docs/03_frontend_requirements.md': '038c88bf2ee80aa10754f3b497b27d72f39917eaaddecb1588e4d0a74fcb2f2d',
  'docs/04_admin_requirements.md': '19f4106b5f7c7301584f9f3d83c8aa6f6ea8e1946126ac20a92bc33a95bde228',
}
for (const [file, expectedHash] of Object.entries(protectedHashes)) {
  check(await sha256(file) === expectedHash, `protected document unchanged: ${file}`)
}
for (const file of Object.keys(protectedHashes).slice(0, 4)) {
  const mode = (await stat(resolve(projectRoot, file))).mode & 0o777
  check((mode & 0o222) === 0, `protected document is read-only: ${file}`)
}

const syntaxFiles = [
  'eslint.config.mjs',
  'scripts/build-target.mjs',
  'scripts/run-built-target.mjs',
  'scripts/smoke-runtime.mjs',
  'scripts/lib/build-output.mjs',
  'scripts/lib/cloudflare-assets.mjs',
  'scripts/lib/run-command.mjs',
  'scripts/verify-stage0.mjs',
  'scripts/verify-contracts.mjs',
  'tests/node/build-output.test.mjs',
]
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', resolve(projectRoot, file)], { encoding: 'utf8' })
  check(result.status === 0, `JavaScript syntax: ${file}${result.stderr ? ` (${result.stderr.trim()})` : ''}`)
}

const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)
if (major === 24) {
  passed.push(`runtime Node major is 24 (${process.version})`)
} else if (requireLock) {
  failures.push(`release acceptance requires Node 24; current runtime is ${process.version}`)
} else {
  warnings.push(`project targets Node 24; current static-verification runtime is ${process.version}`)
}

const hasLock = await exists('pnpm-lock.yaml')
if (hasLock) {
  check((await text('pnpm-lock.yaml')).includes('lockfileVersion:'), 'pnpm lockfile is parseable-looking')
} else if (requireLock) {
  failures.push('pnpm-lock.yaml is required for CI/release acceptance')
} else {
  warnings.push('pnpm-lock.yaml is absent; generate it with pnpm install in a registry-enabled environment and commit it')
}

for (const message of passed) console.log(`PASS  ${message}`)
for (const message of warnings) console.warn(`WARN  ${message}`)
for (const message of failures) console.error(`FAIL  ${message}`)
console.log(`\nSummary: ${passed.length} passed, ${warnings.length} warning(s), ${failures.length} failed.`)
if (failures.length > 0) process.exitCode = 1
