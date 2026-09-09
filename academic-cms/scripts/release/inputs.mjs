import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'

const DIRECTORIES = ['app', 'server', 'shared', 'db', 'public', 'modules', 'scripts', 'migrations', 'tests', '.github']
const FILES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'nuxt.config.ts', 'wrangler.jsonc', 'tsconfig.json', 'playwright.config.ts', 'playwright.production.config.ts', 'eslint.config.mjs', 'vitest.config.ts', 'vitest.database.config.ts', 'vitest.workerd.config.ts', '.nvmrc', '.node-version']

/** Hash actual build inputs, not old test reports. Symlinks in source are refused. */
export async function sourceIdentity(root) {
  const paths = []
  async function visit(path) {
    const info = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (!info) return
    if (info.isSymbolicLink()) throw new Error(`Source symlink is not accepted: ${relative(root, path)}`)
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) {
        if (['__pycache__', 'node_modules', '.tmp', '.nuxt', '.output', '.cache'].includes(name) || name.endsWith('.pyc')) continue
        await visit(resolve(path, name))
      }
    } else if (info.isFile()) paths.push(path)
  }
  const contextConfigs = (await readdir(root)).filter(name => /^tsconfig\.[a-zA-Z0-9-]+\.json$/u.test(name))
  for (const name of new Set([...DIRECTORIES, ...FILES, ...contextConfigs])) await visit(resolve(root, name))
  const hash = createHash('sha256')
  const inventory = []
  for (const path of paths.sort()) {
    const name = relative(root, path).replaceAll('\\', '/')
    const digest = createHash('sha256').update(await readFile(path)).digest('hex')
    hash.update(name).update('\0').update(digest).update('\n')
    inventory.push({ path: name, sha256: digest })
  }
  return { digest: hash.digest('hex'), files: inventory.length, inventory }
}
