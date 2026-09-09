import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'

/** Fails before a Cloudflare output receives a valid deployment build marker. */
export async function assertWorkerDatabaseIsolation(root) {
  const server = resolve(root, '.output/server')
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name), label = relative(server, path)
      if (entry.name === 'better-sqlite3') throw new Error(`Worker output contains native SQLite: ${label}`)
      if (entry.isDirectory()) { await scan(path); continue }
      if (entry.name.endsWith('.node')) throw new Error(`Worker output contains a native addon: ${label}`)
      if (/\.(?:mjs|cjs|js)$/.test(entry.name)) {
        const source = await readFile(path, 'utf8')
        if (/better-sqlite3|better_sqlite3\.node|node:sqlite/.test(source)) throw new Error(`Worker output references native SQLite: ${label}`)
      }
    }
  }
  await scan(server)
}
