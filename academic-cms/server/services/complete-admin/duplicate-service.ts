import type { H3Event } from 'h3'
import {
  adminDuplicateRule,
  adminIdentityEditPath,
  isAdminIdentityResource,
  normalizeAdminUid,
  type AdminDuplicateCheckResult,
  type AdminIdentityResource,
} from '~~/shared/admin/identity'
import { resolveAdminDatabase, type SqlValue } from '../../utils/complete-admin/db'

interface DuplicateResourceDefinition {
  readonly table: string
  readonly titleField: string
  readonly fields: readonly string[]
}

const DUPLICATE_RESOURCES = Object.freeze({
  profiles: { table: 'profiles', titleField: 'name', fields: ['name', 'orcid'] },
  research_interests: { table: 'research_interests', titleField: 'name', fields: ['name'] },
  publications: { table: 'publications', titleField: 'title', fields: ['doi', 'title'] },
  projects: { table: 'projects', titleField: 'name', fields: ['project_number', 'name'] },
  patents: { table: 'patents', titleField: 'name', fields: ['application_number', 'grant_number', 'name'] },
  students: { table: 'students', titleField: 'name', fields: ['student_id', 'name'] },
  student_category_displays: { table: 'student_category_displays', titleField: 'label', fields: ['key'] },
  courses: { table: 'courses', titleField: 'name', fields: ['name'] },
  messages: { table: 'messages', titleField: 'subject', fields: [] },
  'site-settings': { table: 'site_settings', titleField: 'site_name', fields: ['site_name'] },
  'global-settings': { table: 'global_settings', titleField: 'uid', fields: [] },
  navigation: { table: 'navigation_items', titleField: 'title', fields: ['title', 'path'] },
  news: { table: 'news', titleField: 'title', fields: ['slug', 'title'] },
  media: { table: 'media_assets', titleField: 'title', fields: ['object_key'] },
  translation: { table: 'translation_cache', titleField: 'source_ref_key', fields: [] },
  'auth-users': { table: 'auth_users', titleField: 'display_name', fields: ['username'] },
  'auth-roles': { table: 'auth_roles', titleField: 'name', fields: ['name'] },
} as const satisfies Record<AdminIdentityResource, DuplicateResourceDefinition>)

function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(value)) throw new Error('UNSAFE_IDENTIFIER')
  return `"${value}"`
}

function hasControlCharacter(value: string): boolean {
  return [...value].some(character => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  })
}

function normalizedDuplicateValue(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error('INVALID_DUPLICATE_VALUE')
  let normalized = value.normalize('NFC').trim()
  if (field === 'doi') normalized = normalized.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '').replace(/^doi\s*:\s*/iu, '').trim()
  if (!normalized || normalized.length > 4000 || hasControlCharacter(normalized)) throw new Error('INVALID_DUPLICATE_VALUE')
  return normalized
}

export class CompleteAdminDuplicateService {
  constructor(private readonly event: H3Event) {}

  async check(resourceValue: unknown, fieldValue: unknown, value: unknown, excludeUidValue?: unknown): Promise<AdminDuplicateCheckResult> {
    if (!isAdminIdentityResource(resourceValue)) throw new Error('UNKNOWN_DUPLICATE_RESOURCE')
    const resource = resourceValue
    const field = String(fieldValue ?? '')
    const rule = adminDuplicateRule(resource, field)
    const definition = DUPLICATE_RESOURCES[resource]
    if (!rule || (field !== 'uid' && !(definition.fields as readonly string[]).includes(field))) throw new Error('UNKNOWN_DUPLICATE_FIELD')
    const normalized = field === 'uid' ? normalizeAdminUid(value) : normalizedDuplicateValue(value, field)
    const excludeUid = excludeUidValue === undefined || excludeUidValue === null || excludeUidValue === ''
      ? null
      : normalizeAdminUid(excludeUidValue)
    const db = await resolveAdminDatabase(this.event)
    const selectedField = identifier(field)
    const params: SqlValue[] = [normalized]
    let comparison = `${selectedField} = ?`
    if (field === 'doi') comparison = `lower(trim(replace(replace(${selectedField}, 'https://doi.org/', ''), 'doi:', ''))) = lower(?)`
    else if (field !== 'uid') comparison = `lower(trim(${selectedField})) = lower(?)`
    let where = `${selectedField} IS NOT NULL AND ${comparison}`
    if (excludeUid) {
      where += ' AND uid <> ?'
      params.push(excludeUid)
    }
    const rows = await db.all<Record<string, unknown>>(
      `SELECT uid, ${identifier(definition.titleField)} AS title FROM ${identifier(definition.table)} WHERE ${where} ORDER BY updated_at DESC, id DESC LIMIT 11`,
      params,
    )
    const matches = rows.slice(0, 10).map(row => {
      const uid = normalizeAdminUid(row.uid)
      const title = String(row.title ?? '').trim() || uid
      return Object.freeze({ uid, title, adminPath: adminIdentityEditPath(resource, uid) })
    })
    return Object.freeze({ resource, field, mode: rule.mode, matches: Object.freeze(matches), truncated: rows.length > 10 })
  }
}
