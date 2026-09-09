import { spawnSync } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = resolve(root, 'reports/stage27')
await mkdir(reportDir, { recursive: true })
const report = { stage: 27, generatedAt: new Date().toISOString(), environment: { node: process.version }, blockers: [], checks: [], status: 'running' }
const exists = async path => access(path, constants.F_OK).then(() => true, () => false)
const version = process.versions.node.split('.').map(Number)
if (!(version[0] === 24 && version[1] >= 19)) report.blockers.push(`Node ${process.versions.node}; required >=24.19.0 <25`)
if (!await exists(resolve(root, 'pnpm-lock.yaml'))) report.blockers.push('pnpm-lock.yaml is missing')
if (!await exists(resolve(root, 'node_modules/.bin/nuxt'))) report.blockers.push('project dependencies are not installed')
let manager = 'pnpm'
const probe = spawnSync(manager, ['--version'], { cwd: root, encoding: 'utf8' })
if (probe.status !== 0) report.blockers.push('pnpm is unavailable')
else if (!/^11\.(?:19|[2-9]\d)\./u.test((probe.stdout ?? '').trim())) report.blockers.push(`pnpm ${(probe.stdout ?? '').trim()}; required >=11.19.0 <12`)

if (report.blockers.length) {
  report.status = 'blocked_prerequisites'
  process.exitCode = 2
}
else {
  const commands = ['verify:stage27:offline','typecheck','lint','test:unit','typecheck:database','test:database:native','test:database:workerd','build:ubuntu','smoke:ubuntu','test:e2e:production','build:cloudflare','smoke:cloudflare','test:e2e']
  for (const name of commands) {
    const result = spawnSync(manager, ['run', name], { cwd: root, encoding: 'utf8', timeout: 900_000, maxBuffer: 128 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' } })
    const log = `release-${name.replaceAll(':','-')}.log`
    await writeFile(resolve(reportDir, log), `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}\n` : ''}`)
    const passed = result.status === 0 && !result.signal && !result.error
    report.checks.push({ name, status: passed ? 'passed' : 'failed', exitCode: result.status, signal: result.signal, log })
    if (!passed) { report.status = 'failed'; process.exitCode = 1; break }
  }
  if (report.status === 'running') report.status = 'passed'
}
await writeFile(resolve(reportDir, 'release-validation.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
