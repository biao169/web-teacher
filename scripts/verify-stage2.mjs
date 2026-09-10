import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations } from './db/migrations.mjs'
import { findCompiler } from './lib/typescript-compiler.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = resolve(root, 'reports/stage2')
await mkdir(reportDir, { recursive: true })

const report = {
  stage: 2,
  scope: 'offline authentication, authorization, request-protection and audit acceptance; NOT native better-sqlite3/workerd/Nuxt release acceptance',
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
    maxBuffer: 32 * 1024 * 1024,
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

async function files(directory, suffix) {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) output.push(...await files(path, suffix))
    else if (entry.isFile() && entry.name.endsWith(suffix)) output.push(path)
  }
  return output.sort()
}

function tapNumber(tap, label) {
  return Number(new RegExp(`^(?:#|ℹ) ${label} (\\d+)$`, 'm').exec(tap)?.[1] ?? Number.NaN)
}

function blankEnv(source, name) {
  return source.split(/\r?\n/u).find(line => line.startsWith(`${name}=`)) === `${name}=`
}

try {
  const baseline = JSON.parse(await readFile(resolve(reportDir, 'input-baseline.json'), 'utf8'))
  for (const [name, expected] of Object.entries(baseline.protected_documents)) {
    const path = resolve(root, name)
    const data = await readFile(path)
    check(`protected document: ${name}`, createHash('sha256').update(data).digest('hex') === expected)
    if (/^docs\/0[1-4]_/.test(name)) check(`read-only document: ${name}`, ((await stat(path)).mode & 0o222) === 0)
  }

  const stageDocument = resolve(root, 'docs/13_安全Session与权限基础.md')
  check('stage-2 feature design document exists', (await stat(stageDocument)).isFile())
  const duplicateStageDocuments = (await readdir(resolve(root, 'docs'))).filter(name => /^13_.*\.md$/u.test(name))
  check('stage-2 has one canonical numbered design document', duplicateStageDocuments.length === 1, duplicateStageDocuments)

  const migrations = await loadMigrations(resolve(root, 'migrations'))
  check('stage-2 migrations are manifest-protected and append-only',
    migrations.map(item => item.name).slice(0, 2).join(',') === '0001_initial.sql,0002_auth_security.sql',
    migrations.map(item => ({ name: item.name, sha256: item.sha256 })))
  await run('migration manifest is current', process.execPath, ['scripts/db/update-manifest.mjs', '--check'], 'migration-manifest.log')
  await run('generated database schema/catalog/types remain current', process.execPath, ['scripts/db/generate-schema.mjs', '--check'], 'schema-generation.log')

  const compiler = await findCompiler(root)
  report.environment.compiler = compiler.version
  report.environment.compilerSource = compiler.source
  await run('strict security core TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.security.json'], 'security-core-typecheck.log')
  await run('strict H3 authentication bridge TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.security-http.json'], 'security-http-typecheck.log')

  const tap = await run('dual-adapter security and adversarial contracts', process.execPath, ['scripts/run-security-tests.mjs'], 'final-security.tap')
  report.securityTests = {
    tests: tapNumber(tap, 'tests'),
    passed: tapNumber(tap, 'pass'),
    failed: tapNumber(tap, 'fail'),
    cancelled: tapNumber(tap, 'cancelled'),
    skipped: tapNumber(tap, 'skipped'),
  }
  check('all security tests actually ran without failure, skip or cancellation',
    report.securityTests.tests > 0
      && report.securityTests.passed === report.securityTests.tests
      && report.securityTests.failed === 0
      && report.securityTests.skipped === 0
      && report.securityTests.cancelled === 0,
    report.securityTests)

  await run('stage-1 database and stage-0 regression suite', process.execPath, ['scripts/verify-stage1.mjs'], 'stage1-regression.log', 240_000)
  const stage1 = JSON.parse(await readFile(resolve(root, 'reports/stage1/validation.json'), 'utf8'))
  check('stage-1 regression remains accepted offline', stage1.status === 'passed_offline_only', {
    status: stage1.status,
    databaseTests: stage1.databaseTests,
  })
  report.regression = { stage1: stage1.status, databaseTests: stage1.databaseTests }

  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  check('security dependencies are exact stable pins',
    packageJson.dependencies.h3 === '1.15.11'
      && packageJson.dependencies['nuxt-security'] === '2.6.0'
      && packageJson.dependencies.zod === '4.5.1')
  check('no bearer-JWT authentication dependency is present',
    packageJson.dependencies.jose === undefined
      && packageJson.dependencies.jsonwebtoken === undefined
      && packageJson.devDependencies?.jose === undefined
      && packageJson.devDependencies?.jsonwebtoken === undefined)

  const migration = await readFile(resolve(root, 'migrations/0002_auth_security.sql'), 'utf8')
  for (const table of ['auth_bootstrap_state', 'auth_sessions', 'auth_login_throttles']) {
    check(`security migration table: ${table}`, migration.includes(`CREATE TABLE "${table}"`))
  }
  check('session migration stores only a token fingerprint', migration.includes('"token_hash" TEXT NOT NULL') && !/"(?:session_token|csrf_token|raw_token)"/u.test(migration))
  check('security migration has no embedded transaction ownership', !/^[ \t]*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/imu.test(migration))

  const nuxt = await readFile(resolve(root, 'nuxt.config.ts'), 'utf8')
  check('nonce CSP is enabled without reusable public SSR SWR', /nonce:\s*true/u.test(nuxt) && !/['"]\/(?:zh|en)['"]\s*:\s*\{\s*swr:/u.test(nuxt))
  const publicRuntime = nuxt.slice(nuxt.indexOf('public: {'), nuxt.indexOf('nitro: {'))
  check('authentication secrets are server-only runtime config', !/authSecret|authBootstrapToken/u.test(publicRuntime))

  const env = await readFile(resolve(root, '.env.example'), 'utf8')
  check('example authentication secret is blank', blankEnv(env, 'NUXT_AUTH_SECRET'))
  check('example bootstrap token is blank', blankEnv(env, 'NUXT_AUTH_BOOTSTRAP_TOKEN'))
  check('example bootstrap password is blank', blankEnv(env, 'CMS_BOOTSTRAP_PASSWORD'))

  const authHttp = await readFile(resolve(root, 'server/utils/auth-http.ts'), 'utf8')
  const adminWriteHandler = await readFile(resolve(root, 'server/utils/admin-write-handler.ts'), 'utf8')
  const store = await readFile(resolve(root, 'server/services/auth/auth-store.ts'), 'utf8')
  check('cookie-authenticated writes bind both CSRF channels to the session token',
    /getCookie\(event, runtime\.cookies\.sessionName\)/u.test(authHttp)
      && /getCookie\(event, runtime\.cookies\.csrfName\)/u.test(authHttp)
      && /getHeader\(event, CSRF_HEADER\)/u.test(authHttp)
      && /tokens: runtime\.tokens/u.test(authHttp))
  const protectIndex = adminWriteHandler.indexOf("protectJsonWrite(event, runtime, 'session')")
  const permissionIndex = adminWriteHandler.indexOf('requireEventPermission(event, requirement.module, requirement.action)')
  check('admin write protection precedes database-backed permission resolution', protectIndex >= 0 && permissionIndex > protectIndex)
  check('session audit does not rely on connection-local change counters', !/changes\(\)/u.test(store))

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
  await rm(resolve(root, '.tmp/security-core'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  await writeFile(resolve(reportDir, 'validation.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    status: report.status,
    securityTests: report.securityTests,
    regression: report.regression,
    compiler: report.environment.compiler,
    report: 'reports/stage2/validation.json',
    ...(report.error ? { error: report.error } : {}),
  }, null, 2))
}
