// Child process owned and time-bounded by verify-registry.mjs.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { exactDependency } from './environment.mjs'
import { projectRoot } from '../lib/run-command.mjs'
const pkg = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))
const queue = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
async function worker() {
  while (queue.length) {
    const [name, specifier] = queue.shift()
    const dep = exactDependency(name, specifier)
    try {
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(dep.registryName)}/${dep.version}`, {
        redirect: 'error', signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`HTTP_${response.status}`)
      const metadata = await response.json()
      if (metadata.name !== dep.registryName || metadata.version !== dep.version || !metadata.dist?.integrity) throw new Error('METADATA_MISMATCH')
      console.log(JSON.stringify({ ...dep, status: 'available', integrity: metadata.dist.integrity, engines: metadata.engines ?? null, peerDependencies: metadata.peerDependencies ?? null }))
    } catch (error) {
      console.log(JSON.stringify({ ...dep, status: 'unverified', error: error.cause?.code ?? error.message ?? error.name }))
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
