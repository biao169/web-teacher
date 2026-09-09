import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectRoot } from '../lib/run-command.mjs'
import { exactDependency } from './environment.mjs'
import { runProcess } from './process.mjs'

// Read-only metadata verification; never install or execute downloaded packages.
// Isolate native DNS/fetch handles so an AbortSignal cannot leave this command hanging.
const pkg = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))
const expected = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).map(([name, spec]) => exactDependency(name, spec))
const dns = await runProcess(process.execPath, ['--input-type=module', '-e',
  "import{lookup}from'node:dns/promises';await lookup('registry.npmjs.org');console.log('DNS_OK')"], { timeoutMs: 5000, maxBytes: 65536 })
const child = dns.passed ? await runProcess(process.execPath, ['scripts/release/registry-worker.mjs'], {
  cwd: projectRoot, timeoutMs: 70000, maxBytes: 2 * 1024 * 1024,
}) : null
const received = new Map()
for (const line of child?.output.split('\n') ?? []) {
  try {
    const value = JSON.parse(line)
    if (expected.some(item => item.installedName === value.installedName && item.version === value.version && item.registryName === value.registryName)) received.set(value.installedName, value)
  } catch { /* Incomplete output is not evidence that a version exists. */ }
}
const packages = expected.map(dep => received.get(dep.installedName) ?? {
  ...dep, status: 'unverified', error: dns.passed ? 'REGISTRY_BUDGET_OR_WORKER_FAILURE' : 'DNS_PREFLIGHT_FAILED',
}).sort((a, b) => a.installedName.localeCompare(b.installedName))
const diagnostic = result => result ? { passed: result.passed, exitCode: result.exitCode, reason: result.reason, durationMs: result.durationMs } : null
const report = {
  generatedAt: new Date().toISOString(),
  note: 'Version metadata availability is not a completed install, vulnerability audit or compatibility proof.',
  status: packages.every(item => item.status === 'available') ? 'metadata_verified' : 'blocked_network_or_registry',
  dns: diagnostic(dns), worker: diagnostic(child), packages,
}
await mkdir(resolve(projectRoot, 'reports/stage10b/raw'), { recursive: true })
await writeFile(resolve(projectRoot, 'reports/stage10b/registry.json'), JSON.stringify(report, null, 2) + '\n')
await writeFile(resolve(projectRoot, 'reports/stage10b/raw/registry-dns.log'), dns.output)
console.log(JSON.stringify({ status: report.status, verified: packages.filter(item => item.status === 'available').length, total: packages.length, dns: report.dns }))
process.exitCode = report.status === 'metadata_verified' ? 0 : 2
