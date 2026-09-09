import { access, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

/** Do not infer an implementation from the presence of a design or report. */
export async function inspectContinuity(root) {
  const exists = async path => access(resolve(root, path)).then(() => true, () => false)
  const requirements = {
    publicSite: ['nuxt.config.ts', 'app/pages/zh/index.vue', 'server/services/public/public-home-service.ts'],
    database: ['db/repository.ts', 'db/runtime/node.ts', 'db/runtime/cloudflare.ts', 'migrations/0001_initial.sql'],
    authentication: ['server/services/auth/authentication-service.ts', 'app/components/public/auth/LoginForm.vue'],
    demonstrationData: ['db/seeds/sample-data.ts', 'scripts/db/seed-sample.ts'],
    adminContent: ['server/services/admin/admin-content-service.ts'],
    mediaAdministration: ['server/services/admin/media-library-service.ts'],
    translationJobs: ['server/services/translation/translation-job-service.ts'],
  }
  const features = {}
  for (const [name, files] of Object.entries(requirements)) {
    features[name] = { evidence: [], missing: [] }
    for (const file of files) features[name][await exists(file) ? 'evidence' : 'missing'].push(file)
    features[name].present = features[name].missing.length === 0
  }
  const migrations = (await readdir(resolve(root, 'migrations')).catch(error => { if (error.code === 'ENOENT') return []; throw error })).filter(x=>/^\d+.*\.sql$/u.test(x)).sort()
  return { note: 'Evidence paths identify this snapshot, not all possible implementations. Reports never count as source.', features, migrations, fullProjectReady: Object.values(features).every(x=>x.present) }
}
