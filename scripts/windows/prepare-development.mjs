import { readFile, access, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Remove generated Nuxt development state only, after validating the project. */
export async function prepareDevelopment(root) {
  const project = resolve(root)
  const manifest = JSON.parse(await readFile(resolve(project, 'package.json'), 'utf8'))
  if (manifest.name !== 'academic-cms') throw new Error('Not an Academic CMS project')
  await access(resolve(project, 'nuxt.config.ts'))
  await access(resolve(project, 'shared/complete-admin/core.mjs'))
  for (const directory of ['.nuxt', 'node_modules/.cache/nuxt']) {
    await rm(resolve(project, directory), { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await prepareDevelopment(fileURLToPath(new URL('../..', import.meta.url)))
    console.log('[OK] Shared module found; Nuxt development cache cleared.')
  } catch (error) {
    console.error('[ERROR] Development preparation failed:', error.message)
    process.exitCode = 1
  }
}
