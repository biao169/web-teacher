import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findCompiler, commonJsResolution } from './lib/typescript-compiler.mjs'
import { loadMigrations } from './db/migrations.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = resolve(root, 'reports/stage1')
const output = resolve(root, '.tmp/database-core')
await mkdir(reportDir, { recursive: true })
const report = { stage: 1, scope: 'offline SQL/core acceptance; NOT native better-sqlite3/workerd release acceptance', generatedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch }, checks: [], status: 'running' }
function check(name, condition, detail) {
  report.checks.push({ name, status: condition ? 'passed' : 'failed', ...(detail === undefined ? {} : { detail }) })
  if (!condition) throw new Error(name)
}
async function run(name, command, args, logName, timeout = 90_000) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 })
  const log = (result.stdout ?? '') + (result.stderr ?? '') + (result.error ? `\n${result.error.message}\n` : '')
  if (logName) await writeFile(resolve(reportDir, logName), log)
  check(name, result.status === 0 && !result.signal && !result.error, { exitCode: result.status, signal: result.signal, log: logName ?? null })
  return log
}
async function files(directory, suffix) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) result.push(...await files(path, suffix))
    else if (entry.isFile() && entry.name.endsWith(suffix)) result.push(path)
  }
  return result.sort()
}
try {
  const baseline = JSON.parse(await readFile(resolve(reportDir, 'input-baseline.json'), 'utf8'))
  for (const [name, expected] of Object.entries(baseline.protected_documents)) {
    const data = await readFile(resolve(root, name))
    check(`protected document: ${name}`, createHash('sha256').update(data).digest('hex') === expected)
    if (/docs\/0[1-4]_/.test(name)) check(`read-only document: ${name}`, ((await stat(resolve(root, name))).mode & 0o222) === 0)
  }
  const migrations = await loadMigrations(resolve(root, 'migrations'))
  check('migration manifest and transaction ownership', migrations.length > 0, migrations.map(item => ({ name: item.name, sha256: item.sha256 })))
  await run('generated schema/catalog/types are current', process.execPath, ['scripts/db/generate-schema.mjs', '--check'], 'schema-generation.log')
  const compiler = await findCompiler(root)
  report.environment.compiler = compiler.version; report.environment.compilerSource = compiler.source
  await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  await mkdir(output, { recursive: true })
  await writeFile(resolve(output, 'package.json'), '{"type":"commonjs"}\n')
  await run('strict core TypeScript compilation', compiler.command, [...compiler.prefix, '-p', 'tsconfig.database.json', '--noEmit', 'false', '--module', 'commonjs', '--moduleResolution', commonJsResolution(compiler.version), '--outDir', output, '--rootDir', root], 'core-typecheck.log')
  const tests = (await files(resolve(root, 'tests/database'), '.spec.mjs')).map(path => relative(root, path))
  const tap = await run('SQLite engine and D1 protocol-double contracts', process.execPath, ['--experimental-sqlite', '--test', '--test-reporter=tap', ...tests], 'final-database.tap')
  const number = label => Number(new RegExp(`^# ${label} (\\d+)$`, 'm').exec(tap)?.[1] ?? NaN)
  report.databaseTests = { tests: number('tests'), passed: number('pass'), failed: number('fail'), cancelled: number('cancelled'), skipped: number('skipped') }
  check('all database tests actually ran without skip or cancellation', report.databaseTests.tests > 0 && report.databaseTests.failed === 0 && report.databaseTests.skipped === 0 && report.databaseTests.cancelled === 0)
  const plan = JSON.parse(await readFile(resolve(reportDir, 'query-plans.json'), 'utf8'))
  report.queryPlans = { evidence: 'query-plans.json', engine: plan.engine, count: plan.plans?.length ?? plan.queries?.length ?? null }
  const syntax = [...await files(resolve(root, 'scripts'), '.mjs'), ...await files(resolve(root, 'tests'), '.mjs')]
  for (const path of syntax) await run(`JavaScript syntax: ${relative(root, path)}`, process.execPath, ['--check', path])
  await run('stage-0 static regression', process.execPath, ['scripts/verify-stage0.mjs'], 'stage0-regression.log')
  await run('stage-0 executable core contracts', process.execPath, ['scripts/verify-contracts.mjs'], 'stage0-core.log')
  await run('stage-0 build target unit tests', process.execPath, ['--test', ...await files(resolve(root, 'tests/node'), '.test.mjs')], 'stage0-node.tap')
  report.status = 'passed_offline_only'
}
catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1 }
finally {
  await writeFile(resolve(reportDir, 'validation.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ status: report.status, databaseTests: report.databaseTests, compiler: report.environment.compiler, report: 'reports/stage1/validation.json', ...(report.error ? { error: report.error } : {}) }, null, 2))
}
