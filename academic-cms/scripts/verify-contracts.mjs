import { spawnSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { projectRoot } from './lib/run-command.mjs'
import { findCompiler, commonJsResolution } from './lib/typescript-compiler.mjs'

const outputDir = resolve(projectRoot, '.tmp', 'stage0-contracts')
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

await rm(outputDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
await mkdir(outputDir, { recursive: true })
await writeFile(resolve(outputDir, 'package.json'), '{"type":"commonjs"}\n', 'utf8')

try {
  const compiler = await findCompiler(projectRoot)

  const sourceFiles = [
    'shared/contracts/health.ts',
    'shared/utils/locale-path.ts',
    'shared/utils/request-id.ts',
    'server/utils/health.ts',
  ]
  const temporaryConfig = resolve(outputDir, 'tsconfig.json')
  await writeFile(temporaryConfig, JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'CommonJS', moduleResolution: commonJsResolution(compiler.version),
      lib: ['ES2022', 'DOM'], strict: true, noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true, skipLibCheck: true,
      rootDir: projectRoot, outDir: outputDir,
    },
    files: sourceFiles.map(file => resolve(projectRoot, file)),
  }))
  const result = spawnSync(compiler.command, [...compiler.prefix, '--project', temporaryConfig], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60_000,
  })
  if (result.status !== 0) {
    throw new Error(`Core contract compilation failed:\n${result.stdout}${result.stderr}`)
  }

  const require = createRequire(import.meta.url)
  const health = require(resolve(outputDir, 'server/utils/health.js'))
  const locale = require(resolve(outputDir, 'shared/utils/locale-path.js'))
  const requestId = require(resolve(outputDir, 'shared/utils/request-id.js'))

  const payload = health.createHealthPayload({
    version: '1.2.3',
    runtime: 'node',
    requestId: 'contract-request-0001',
    now: () => new Date('2026-08-29T00:00:00.000Z'),
  })
  assert(payload.status === 'ok' && payload.runtime === 'node', 'health payload contract mismatch')
  assert(payload.timestamp === '2026-08-29T00:00:00.000Z', 'health timestamp mismatch')
  assert(health.normalizeRuntimeKind('unexpected') === 'unknown', 'runtime normalization mismatch')
  let invalidClockRejected = false
  try {
    health.createHealthPayload({
      version: '1.2.3', runtime: 'node', requestId: 'contract-request-0001',
      now: () => new Date(Number.NaN),
    })
  } catch (error) {
    invalidClockRejected = error instanceof TypeError
  }
  assert(invalidClockRejected, 'invalid health clock was accepted')
  assert(health.normalizeHealthVersion(' 2.0.0+edge ') === '2.0.0+edge', 'health version normalization mismatch')
  let rejectedUnsafeHealth = false
  try {
    health.createHealthPayload({ version: 'bad version', runtime: 'node', requestId: 'contract-request-0001' })
  } catch {
    rejectedUnsafeHealth = true
  }
  assert(rejectedUnsafeHealth, 'unsafe health metadata was accepted')

  assert(locale.switchLocalePath('/zh/publications?year=2026#top', 'en') === '/en/publications?year=2026#top', 'locale path suffix was not preserved')
  assert(locale.switchLocalePath('/admin?from=nav', 'zh') === '/zh?from=nav', 'locale fallback suffix was not preserved')

  assert(requestId.normalizeRequestId(' request-contract-01 ') === 'request-contract-01', 'request ID normalization mismatch')
  assert(requestId.normalizeRequestId('<unsafe>') === null, 'unsafe request ID was accepted')
  assert(requestId.selectRequestId({
    cloudflareRay: '9abcdef012345678-LHR',
    forwardedRequestId: 'request-contract-01',
  }) === '9abcdef012345678-LHR', 'Cloudflare request ID priority mismatch')

  console.log(`PASS  core TypeScript contracts compiled with ${compiler.version} (${compiler.source})`)
  console.log('PASS  health, locale, and request-ID runtime assertions')
} finally {
  await rm(outputDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
}
