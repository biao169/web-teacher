import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { redactSensitive, RESOURCE_CATALOG } from '../../shared/complete-admin/core.mjs'

const root = resolve(import.meta.dirname, '../..')
const source = path => readFileSync(resolve(root, path), 'utf8')

test('操作日志页面挂载专用工作台且保持只读', () => {
  const page = source('app/pages/admin/logs/index.vue')
  const workspace = source('app/components/admin/complete/AdminCompleteLogWorkspace.vue')
  assert.match(page, /<AdminCompleteLogWorkspace\s*\/>/u)
  assert.doesNotMatch(page, /AdminCompleteResourceWorkspace/u)
  for (const feature of ['导出当前结果', '目标 UID', '安全详情', '请求编号', '日志只读']) {
    assert.match(workspace, new RegExp(feature, 'u'))
  }
  assert.doesNotMatch(workspace, /type="selection"|编辑日志|删除日志/u)
})

test('日志服务提供有界组合筛选、动态分面和安全详情', () => {
  const service = source('server/services/complete-admin/log-service.ts')
  for (const field of ['module', 'action', 'status', 'actor', 'targetUid', 'from', 'to']) assert.match(service, new RegExp(field, 'u'))
  assert.match(service, /SORT_FIELDS/u)
  assert.match(service, /LOG_DETAIL_LIMIT/u)
  assert.match(service, /redactSensitive/u)
  assert.match(service, /facets: \{ modules, actions, statuses, actors/u)
  assert.doesNotMatch(service.match(/async list\(\)[\s\S]*?async get/u)?.[0] ?? '', /detail_json/u)
})

test('日志导出检查独立权限、CSRF、行数、文件大小和公式注入', () => {
  const route = source('server/api/v1/admin/complete/logs/export.post.ts')
  const service = source('server/services/complete-admin/log-service.ts')
  const csv = source('server/utils/complete-admin/csv.ts')
  assert.match(route, /'export', \{ write: true \}/u)
  assert.match(route, /readBoundedJson\(event, 64 \* 1024\)/u)
  for (const guard of ['MAX_EXPORT_ROWS', 'LOG_EXPORT_DETAIL_ROWS', 'LOG_EXPORT_BYTES', 'LOG_EXPORT_LIMIT', 'LOG_EXPORT_SIZE_LIMIT']) {
    assert.match(service, new RegExp(guard, 'u'))
  }
  assert.match(service, /serializeSafeCsv/u)
  assert.match(csv, /\^\[=\+\\-@\\t\\r\]/u)
  assert.match(service, /'export'.*导出操作日志/su)
})

test('日志专用读取路由存在且通用资源写入仍被关闭', () => {
  for (const route of [
    'server/api/v1/admin/complete/logs/index.get.ts',
    'server/api/v1/admin/complete/logs/[uid].get.ts',
    'server/api/v1/admin/complete/logs/export.post.ts',
  ]) assert.doesNotThrow(() => source(route))
  assert.equal(Object.hasOwn(RESOURCE_CATALOG, 'logs'), false)
  const resource = source('server/services/complete-admin/resource-service.ts')
  assert.match(resource, /if \(resource\.readOnly\) throw new Error\('UPDATE_NOT_ALLOWED'\)/u)
  assert.match(resource, /if \(resource\.readOnly\) throw new Error\('BATCH_NOT_ALLOWED'\)/u)
})

test('通用敏感字段清洗覆盖嵌套认证信息', () => {
  const safe = redactSensitive({
    requestId: 'req-123', password: 'never-return', nested: { authorization: 'Bearer secret', api_key: 'secret', title: '保留' },
  })
  assert.equal(safe.requestId, 'req-123')
  assert.equal(safe.password, '[REDACTED]')
  assert.equal(safe.nested.authorization, '[REDACTED]')
  assert.equal(safe.nested.api_key, '[REDACTED]')
  assert.equal(safe.nested.title, '保留')
})
