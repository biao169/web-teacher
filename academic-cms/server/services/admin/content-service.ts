import type { DatabaseAdapter } from '../../../db/contracts'
import { DatabaseError } from '../../../db/errors'
import { timestamp } from '../../../db/codec'
import { adminContentModule, type AdminContentModule, type AdminContentValue } from '../../../shared/admin/content-modules'
import { normalizeAdminUid } from '../../../shared/admin/identity'
import type {
  AdminContentBatchBody,
  AdminContentBatchView,
  AdminContentDeleteBody,
  AdminContentDeleteView,
  AdminContentDetailView,
  AdminContentListView,
  AdminContentMutationBody,
  AdminContentMutationView,
} from '../../../shared/contracts/admin-content'
import { requirePermission, type AuthenticatedPrincipal } from '../../security/permissions'
import { AdminContentError } from './content-errors'
import type { ParsedAdminContentQuery } from './content-query'
import { ADMIN_BATCH_LIMIT, AdminContentStore } from './content-store'
import { normalizeAdminContentValues } from './content-validation'

function databaseCauseText(error: DatabaseError): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 6 && current instanceof Error; depth += 1) {
    parts.push(current.message)
    current = current.cause
  }
  return parts.join(' ').toLowerCase()
}

function rethrowBusinessConstraint(definition: ReturnType<typeof adminContentModule>, error: unknown): never {
  if (error instanceof DatabaseError && error.code === 'DB_UNIQUE') {
    const detail = databaseCauseText(error)
    if (detail.includes(`${definition.table}.uid`.toLowerCase())) {
      throw new AdminContentError('ADMIN_CONTENT_VALIDATION', `Duplicate ${definition.table}.uid`, {
        cause: error,
        publicMessage: '数据库 UID 已存在，请修改后重试。',
        fieldErrors: { uid: '数据库 UID 已存在，请使用其他值。' },
      })
    }
    const field = definition.uniqueFields?.find(candidate => detail.includes(`${definition.table}.${candidate}`.toLowerCase()))
    if (field) {
      const label = definition.fields.find(item => item.name === field)?.label ?? field
      throw new AdminContentError('ADMIN_CONTENT_VALIDATION', `Duplicate ${definition.table}.${field}`, {
        cause: error,
        publicMessage: '提交的数据与已有记录重复。',
        fieldErrors: { [field]: `${label}已存在，请使用其他值。` },
      })
    }
  }
  throw error
}

function objectBody(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Request body must be an object')
  const result = value as Record<string, unknown>
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(result)) if (!allowedSet.has(key)) throw new AdminContentError('ADMIN_CONTENT_INPUT', `Unknown request field: ${key}`)
  return result
}

function safeUid(value: unknown): string {
  try { return normalizeAdminUid(value) }
  catch { throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Record UID is invalid', { fieldErrors: { uid: 'UID 仅支持字母、数字、冒号、点、下划线和短横线，最长 128 个字符。' } }) }
}

function mutationBody(value: unknown, updating: boolean): AdminContentMutationBody {
  const body = objectBody(value, updating ? ['values', 'expectedUpdatedAt'] : ['uid', 'values'])
  if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'values must be an object')
  if (updating && typeof body.expectedUpdatedAt !== 'string') throw new AdminContentError('ADMIN_CONTENT_INPUT', 'expectedUpdatedAt is required')
  return {
    ...(!updating && body.uid !== undefined ? { uid: safeUid(body.uid) } : {}),
    values: body.values as Record<string, unknown>,
    ...(updating ? { expectedUpdatedAt: timestamp(body.expectedUpdatedAt as string) } : {}),
  }
}

function deleteBody(value: unknown): AdminContentDeleteBody {
  const body = objectBody(value, ['expectedUpdatedAt'])
  if (typeof body.expectedUpdatedAt !== 'string') throw new AdminContentError('ADMIN_CONTENT_INPUT', 'expectedUpdatedAt is required')
  return { expectedUpdatedAt: timestamp(body.expectedUpdatedAt) }
}

function batchBody(value: unknown): AdminContentBatchBody {
  const body = objectBody(value, ['uids', 'expectedUpdatedAtByUid', 'values'])
  if (!Array.isArray(body.uids) || body.uids.length < 1 || body.uids.length > ADMIN_BATCH_LIMIT) throw new AdminContentError('ADMIN_CONTENT_INPUT', `Batch size must be between 1 and ${ADMIN_BATCH_LIMIT}`)
  const uids = [...new Set(body.uids.map(safeUid))]
  if (uids.length !== body.uids.length) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Batch UIDs must be unique')
  if (!body.expectedUpdatedAtByUid || typeof body.expectedUpdatedAtByUid !== 'object' || Array.isArray(body.expectedUpdatedAtByUid)) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'expectedUpdatedAtByUid must be an object')
  const rawVersions = body.expectedUpdatedAtByUid as Record<string, unknown>
  if (Object.keys(rawVersions).length !== uids.length) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Every batch record requires one version')
  const versions: Record<string, string> = Object.create(null) as Record<string, string>
  for (const uid of uids) {
    const valueForUid = rawVersions[uid]
    if (typeof valueForUid !== 'string') throw new AdminContentError('ADMIN_CONTENT_INPUT', `Missing version for ${uid}`)
    versions[uid] = timestamp(valueForUid)
  }
  for (const uid of Object.keys(rawVersions)) if (!uids.includes(uid)) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'Version map contains an unexpected UID')
  if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) throw new AdminContentError('ADMIN_CONTENT_INPUT', 'values must be an object')
  return { uids: Object.freeze(uids), expectedUpdatedAtByUid: Object.freeze(versions), values: body.values as Record<string, unknown> }
}

export class AdminContentService {
  private readonly store: AdminContentStore
  constructor(adapter: DatabaseAdapter, private readonly principal: AuthenticatedPrincipal, options: ConstructorParameters<typeof AdminContentStore>[1] = {}) {
    this.store = new AdminContentStore(adapter, options)
  }

  async list(module: AdminContentModule, query: ParsedAdminContentQuery): Promise<AdminContentListView> {
    const definition = adminContentModule(module)
    requirePermission(this.principal, module, 'view')
    const data = await this.store.list(definition, query, this.principal)
    return Object.freeze({
      module,
      items: data.items,
      total: data.total,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: query.page * query.pageSize < data.total,
      facets: data.facets,
      permissions: data.permissions,
    })
  }

  async detail(module: AdminContentModule, uidInput: unknown): Promise<AdminContentDetailView> {
    const definition = adminContentModule(module)
    requirePermission(this.principal, module, 'view')
    const result = await this.store.find(definition, safeUid(uidInput), this.principal)
    if (!result) throw new AdminContentError('ADMIN_CONTENT_NOT_FOUND')
    return result
  }

  async create(module: AdminContentModule, input: unknown): Promise<AdminContentMutationView> {
    const definition = adminContentModule(module)
    requirePermission(this.principal, module, 'create')
    if (!definition.canCreate) throw new AdminContentError('ADMIN_CONTENT_FORBIDDEN')
    const body = mutationBody(input, false)
    const normalized = normalizeAdminContentValues(definition, body.values, 'create')
    let record: AdminContentDetailView
    try { record = await this.store.create(definition, normalized.values, this.principal, body.uid) }
    catch (error) { rethrowBusinessConstraint(definition, error) }
    return Object.freeze({ record, message: `${definition.singularTitle}已创建。` })
  }

  async update(module: AdminContentModule, uidInput: unknown, input: unknown): Promise<AdminContentMutationView> {
    const definition = adminContentModule(module)
    requirePermission(this.principal, module, 'edit')
    const uid = safeUid(uidInput)
    const body = mutationBody(input, true)
    const current = await this.store.find(definition, uid, this.principal)
    if (!current) throw new AdminContentError('ADMIN_CONTENT_NOT_FOUND')
    if (current.updatedAt !== body.expectedUpdatedAt) throw new AdminContentError('ADMIN_CONTENT_CONFLICT')
    const normalized = normalizeAdminContentValues(definition, body.values, 'update', current.values)
    let record: AdminContentDetailView
    try { record = await this.store.update(definition, uid, body.expectedUpdatedAt!, normalized.values, this.principal) }
    catch (error) { rethrowBusinessConstraint(definition, error) }
    return Object.freeze({ record, message: `${definition.singularTitle}已保存。` })
  }

  async delete(module: AdminContentModule, uidInput: unknown, input: unknown): Promise<AdminContentDeleteView> {
    const definition = adminContentModule(module)
    requirePermission(this.principal, module, 'delete')
    if (!definition.canDelete) throw new AdminContentError('ADMIN_CONTENT_FORBIDDEN')
    const uid = safeUid(uidInput)
    const body = deleteBody(input)
    await this.store.delete(definition, uid, body.expectedUpdatedAt, this.principal)
    return Object.freeze({ uid, deleted: true, message: `${definition.singularTitle}已删除。` })
  }

  async batchUpdate(module: AdminContentModule, input: unknown): Promise<AdminContentBatchView> {
    const definition = adminContentModule(module)
    requirePermission(this.principal, module, 'edit')
    const body = batchBody(input)
    const submitted = Object.keys(body.values)
    if (!submitted.length || submitted.some(field => !definition.batchFields.includes(field))) throw new AdminContentError('ADMIN_CONTENT_VALIDATION', 'Batch field is not allowed', { fieldErrors: Object.fromEntries(submitted.map(field => [field, '该字段不支持批量更新。'])) })
    const normalized = normalizeAdminContentValues(definition, body.values, 'batch')
    const values = normalized.values as Readonly<Record<string, AdminContentValue>>
    const updated = await this.store.batchUpdate(definition, body.uids, body.expectedUpdatedAtByUid, values, this.principal)
    return Object.freeze({ updated, message: `已更新 ${updated} 条记录。` })
  }
}
