import { spawnSync } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = resolve(root, 'reports/stage26')
await mkdir(reportDir, { recursive: true })
const report = {
  stage: 26,
  scope: 'installed dependency identity, Nuxt type/lint/build, native SQLite, workerd, browser administration access and dual-platform release gates',
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  status: 'running',
  blockers: [],
  checks: [],
}
const exists = path => access(path).then(() => true, () => false)
const [major, minor] = process.versions.node.split('.').map(Number)
if (major !== 24 || minor < 19) report.blockers.push(`Requires Node >=24.19.0 <25; found ${process.version}`)
if (!await exists(resolve(root, 'pnpm-lock.yaml'))) report.blockers.push('Missing pnpm-lock.yaml; perform a genuine pnpm install and commit the resulting lock')
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
for (const name of [...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.devDependencies ?? {})]) {
  if (!await exists(resolve(root, 'node_modules', name, 'package.json'))) report.blockers.push(`Missing pinned dependency: ${name}`)
}
const manager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const expectedPnpm = packageJson.packageManager.replace('pnpm@', '')
const version = spawnSync(manager, ['--version'], { cwd: root, encoding: 'utf8', timeout: 10_000 })
if (version.status !== 0 || version.stdout.trim() !== expectedPnpm) report.blockers.push(`Requires pnpm ${expectedPnpm}`)

if (report.blockers.length) {
  report.status = 'blocked_prerequisites'
  process.exitCode = 2
}
else {
  const commands = [
    'verify:stage26:offline',
    'typecheck',
    'lint',
    'test:unit',
    'typecheck:database',
    'test:database:native',
    'test:database:workerd',
    'build:ubuntu',
    'smoke:ubuntu',
    'test:e2e:production',
    'build:cloudflare',
    'smoke:cloudflare',
    'test:e2e',
  ]
  for (const name of commands) {
    const result = spawnSync(manager, ['run', name], {
      cwd: root,
      encoding: 'utf8',
      timeout: 900_000,
      maxBuffer: 128 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' },
    })
    const logName = `release-${name.replaceAll(':', '-')}.log`
    await writeFile(resolve(reportDir, logName), `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}\n` : ''}`)
    const passed = result.status === 0 && !result.signal && !result.error
    report.checks.push({ name, status: passed ? 'passed' : 'failed', exitCode: result.status, signal: result.signal, log: logName })
    if (!passed) { report.status = 'failed'; process.exitCode = 1; break }
  }
  if (report.status === 'running') report.status = 'passed'
}
await writeFile(resolve(reportDir, 'release-validation.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
