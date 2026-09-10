import { isAuthModule, type AuthModule } from '../../shared/enums/auth'
import { hasUnpairedSurrogate } from '../../shared/utils/unicode'
import { sha256Hex } from '../view-model/serializer'
import { CacheError } from './errors'
import type { CacheGenerationSnapshot } from './contracts'
import type { CacheGenerationStore } from './generation-store'
import { normalizeCacheTags, validateCacheTag } from './keys'

const DEPENDENCIES: Readonly<Record<AuthModule, readonly string[]>> = Object.freeze({
  dashboard: ['admin:dashboard'],
  site_settings: ['public:site', 'public:layout', 'public:home', 'public:seo'],
  global_settings: ['public:settings', 'public:home', 'public:media-policy'],
  navigation_items: ['public:navigation', 'public:layout', 'public:home'],
  profiles: ['public:profiles', 'public:team', 'public:home'],
  research_interests: ['public:research', 'public:home'],
  publications: ['public:publications', 'public:home'],
  projects: ['public:projects', 'public:home'],
  patents: ['public:patents', 'public:home'],
  students: ['public:students', 'public:home'],
  student_category_displays: ['public:students'],
  news: ['public:news', 'public:home'],
  courses: ['public:courses'],
  messages: ['admin:messages'],
  media_assets: ['public:media'],
  translation_cache: ['public:translations'],
  operation_logs: ['admin:operation-logs'],
  auth: ['admin:auth'],
  import_export: ['admin:import-export'],
})

export interface CacheMutation {
  module: AuthModule
  uid?: string | null
  dependentModules?: readonly AuthModule[]
  extraTags?: readonly string[]
}

export async function cacheRecordTag(module: AuthModule, uid: string): Promise<string> {
  if (typeof uid !== 'string' || !uid || uid !== uid.normalize('NFC') || hasUnpairedSurrogate(uid)
    || /[\u0000-\u001f\u007f]/u.test(uid) || new TextEncoder().encode(uid).byteLength > 256) {
    throw new CacheError('CACHE_INPUT', 'Invalid cache mutation UID')
  }
  const digest = await sha256Hex(`cache-record-v1\u0000${module}\u0000${uid}`)
  return validateCacheTag(`record:${module}:${digest}`)
}

export async function cacheTagsForMutation(mutation: CacheMutation): Promise<string[]> {
  const module = mutation && typeof mutation === 'object' && !Array.isArray(mutation) ? mutation.module : undefined
  if (!isAuthModule(module) || !Object.hasOwn(DEPENDENCIES, module)) {
    throw new CacheError('CACHE_INPUT', 'Unknown cache mutation module')
  }
  if (mutation.dependentModules !== undefined && !Array.isArray(mutation.dependentModules)) throw new CacheError('CACHE_INPUT', 'Invalid dependent cache modules')
  if (mutation.extraTags !== undefined && !Array.isArray(mutation.extraTags)) throw new CacheError('CACHE_INPUT', 'Invalid extra cache tags')
  const dependentModules: AuthModule[] = []
  for (const value of mutation.dependentModules ?? []) {
    if (!isAuthModule(value)) throw new CacheError('CACHE_INPUT', 'Unknown dependent cache module')
    dependentModules.push(value)
  }
  const modules: AuthModule[] = [...new Set<AuthModule>([module, ...dependentModules])]
  const tags: string[] = []
  for (const selectedModule of modules) tags.push(`module:${selectedModule}`, ...DEPENDENCIES[selectedModule])
  if (mutation.uid !== undefined && mutation.uid !== null) tags.push(await cacheRecordTag(module, mutation.uid))
  if (mutation.extraTags) tags.push(...mutation.extraTags.map(validateCacheTag))
  return normalizeCacheTags(tags)
}

export class CacheInvalidator {
  constructor(private readonly generations: CacheGenerationStore) {}
  async invalidate(mutation: CacheMutation, at?: string): Promise<CacheGenerationSnapshot> {
    return this.generations.bump(await cacheTagsForMutation(mutation), at)
  }
}
