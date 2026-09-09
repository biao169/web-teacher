import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

export function exactDependency(name, specifier) {
  if (typeof specifier !== 'string') throw new TypeError(`Invalid dependency: ${name}`)
  const alias = /^npm:((?:@[^/]+\/)?[^@]+)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u.exec(specifier)
  const version = alias?.[2] ?? specifier
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) throw new Error(`Unpinned dependency: ${name}`)
  return { installedName: name, registryName: alias?.[1] ?? name, version }
}

export async function inspectEnvironment(root, options = {}) {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  const versions = (options.nodeVersion ?? process.versions.node).split('.').map(Number)
  const blockers = []
  if (versions[0] !== 24 || versions[1] < 19) blockers.push({ code: 'NODE_VERSION', expected: '>=24.19.0 <25', actual: options.nodeVersion ?? process.versions.node })
  const hasLock = await access(resolve(root, 'pnpm-lock.yaml')).then(() => true, () => false)
  if (!hasLock) blockers.push({ code: 'LOCK_MISSING', message: 'Generate a real lock with pnpm install; never synthesize it.' })
  const expectedPnpm = /^pnpm@(.+)$/u.exec(pkg.packageManager ?? '')?.[1]
  const manager = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--version'], { cwd: root, encoding: 'utf8', timeout: 10000 })
  if (manager.status !== 0 || manager.stdout.trim() !== expectedPnpm) blockers.push({ code: 'PNPM_VERSION', expected: expectedPnpm, actual: manager.status === 0 ? manager.stdout.trim() : 'unavailable' })
  const dependencies = []
  for (const [name, specifier] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    const dep = exactDependency(name, specifier)
    let installed
    try { installed = JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8')) } catch { /* Recorded explicitly, never treated as a passed install. */ }
    const matches = installed?.version === dep.version && installed?.name === dep.registryName
    dependencies.push({ ...dep, installedVersion: installed?.version ?? null, matches })
    if (!matches) blockers.push({ code: 'DEPENDENCY_MISSING_OR_MISMATCH', name, expected: dep.version, actual: installed?.version ?? null })
  }
  return { status: blockers.length ? 'blocked_prerequisites' : 'ready_for_execution', node: process.version, packageManager: pkg.packageManager, lockPresent: hasLock, dependencies, blockers }
}
