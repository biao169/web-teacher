import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dir = resolve(root, 'reports/stage1')
await mkdir(dir, { recursive: true })
const report = { stage: 1, scope: 'production dependencies and native/workerd contracts', generatedAt: new Date().toISOString(), status: 'running', blockers: [], checks: [] }
const [major, minor] = process.versions.node.split('.').map(Number)
if (major !== 24 || minor < 19) report.blockers.push(`Requires Node >=24.19.0 <25; found ${process.version}`)
if (!await access(resolve(root, 'pnpm-lock.yaml')).then(() => true, () => false)) report.blockers.push('Missing pnpm-lock.yaml; perform the first genuine pnpm install and commit the resulting lock')
for (const name of ['typescript', 'vitest', 'drizzle-orm', 'better-sqlite3', '@cloudflare/vitest-plugin', '@cloudflare/workers-types']) {
  if (!await access(resolve(root, 'node_modules', name, 'package.json')).then(() => true, () => false)) report.blockers.push(`Missing pinned dependency: ${name}`)
}
const manager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const version = spawnSync(manager, ['--version'], { cwd: root, encoding: 'utf8', timeout: 10_000 })
const expected = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).packageManager.replace('pnpm@', '')
if (version.status !== 0 || version.stdout.trim() !== expected) report.blockers.push(`Requires pnpm ${expected}`)
if (report.blockers.length) {
  report.status = 'blocked_prerequisites'
  process.exitCode = 2
}
else {
  for (const name of ['verify:stage1:offline', 'typecheck:database', 'test:database:native', 'test:database:workerd']) {
    const result = spawnSync(manager, ['run', name], { cwd: root, encoding: 'utf8', timeout: 240_000, maxBuffer: 16 * 1024 * 1024 })
    const log = `release-${name.replaceAll(':', '-')}.log`
    await writeFile(resolve(dir, log), (result.stdout ?? '') + (result.stderr ?? '') + (result.error ? `\n${result.error.message}` : ''))
    const success = result.status === 0 && !result.signal && !result.error
    report.checks.push({ name, status: success ? 'passed' : 'failed', exitCode: result.status, log })
    if (!success) { report.status = 'failed'; process.exitCode = 1; break }
  }
  if (report.status === 'running') report.status = 'passed'
}
await writeFile(resolve(dir, 'release-validation.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
