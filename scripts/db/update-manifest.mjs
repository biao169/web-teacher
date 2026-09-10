import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256 } from './migrations.mjs'
const directory = resolve(fileURLToPath(new URL('../../migrations', import.meta.url)))
const path = resolve(directory, 'manifest.json')
const old = JSON.parse(await readFile(path, 'utf8'))
const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
const entries = []
for (let i = 0; i < names.length; i += 1) {
  const name = names[i]
  if (!new RegExp(`^${String(i + 1).padStart(4, '0')}_[a-z0-9_]+\\.sql$`).test(name)) throw new Error('Migration numbering must be consecutive')
  const hash = sha256(await readFile(resolve(directory, name)))
  const previous = old.migrations.find(item => item.name === name)
  if (previous && previous.sha256 !== hash) throw new Error(`Refusing to change the checksum of an existing migration: ${name}`)
  entries.push({ name, sha256: hash })
}
if (old.migrations.some(item => !names.includes(item.name))) throw new Error('Refusing to remove a migration')
await writeFile(path, JSON.stringify({ version: 1, migrations: entries }, null, 2) + '\n')
console.log(`Manifest contains ${entries.length} immutable migrations`)
