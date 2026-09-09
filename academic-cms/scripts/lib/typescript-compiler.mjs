import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

/** Prefer the pinned compiler; a global compiler is permitted only for offline core verification. */
export async function findCompiler(root) {
  const candidates = [
    resolve(root, 'node_modules/typescript/bin/tsc'),
    resolve(root, 'node_modules/typescript/bin/tsc6'),
    resolve(root, 'node_modules/typescript/lib/tsc.js'),
  ]
  let local = candidates[0]
  let present = false
  for (const candidate of candidates) {
    if (await access(candidate).then(() => true, () => false)) { local = candidate; present = true; break }
  }
  const command = present ? process.execPath : 'tsc6'
  const prefix = present ? [local] : []
  const result = spawnSync(command, [...prefix, '--version'], { encoding: 'utf8', timeout: 10_000 })
  const version = /Version ([0-9]+\.[0-9]+\.[0-9]+)/.exec(result.stdout ?? '')?.[1]
  if (result.status !== 0 || !version) throw new Error('TypeScript 6 compiler not found; install the pinned dependencies or provide tsc6 for offline checks')
  return { command, prefix, version, source: present ? 'project-pinned' : 'global-offline-only' }
}
export function commonJsResolution(version) {
  // TS 6 officially supports bundler + CommonJS; TS 5 uses node resolution here.
  return Number(version.split('.')[0]) >= 6 ? 'bundler' : 'node'
}
