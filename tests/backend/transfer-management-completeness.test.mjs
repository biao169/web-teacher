import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const source = path => readFileSync(resolve(root, path), 'utf8')

test('导入导出页面挂载完整工作台而不是自链接占位卡片', () => {
  const page = source('app/pages/admin/import-export/index.vue')
  const workspace = source('app/components/admin/complete/AdminCompleteTransferWorkspace.vue')
  assert.match(page, /<AdminCompleteTransferWorkspace\s*\/>/u)
  assert.doesNotMatch(page, /to:\s*['"]\/admin\/import-export\?tab=/u)
  for (const feature of ['加密备份', '安全 JSON', '单表 CSV', '解密并预检', '按 UID 合并', '替换所选表', '内容摘要', '执行替换恢复']) {
    assert.match(workspace, new RegExp(feature, 'u'))
  }
})

test('工作台复用既有下载、权限和 API 方法并区分三项权限', () => {
  const workspace = source('app/components/admin/complete/AdminCompleteTransferWorkspace.vue')
  assert.match(workspace, /downloadAdminTextFile/u)
  assert.match(workspace, /useCompleteAdminApi\(\)/u)
  assert.match(workspace, /hasAdminPermission\(currentUser\.value, 'import_export', 'export'\)/u)
  assert.match(workspace, /hasAdminPermission\(currentUser\.value, 'import_export', 'create'\)/u)
  assert.match(workspace, /hasAdminPermission\(currentUser\.value, 'import_export', 'edit'\)/u)
  assert.match(workspace, /REPLACE_ACADEMIC_CMS_DATA/u)
  assert.match(workspace, /MERGE_ACADEMIC_CMS_DATA/u)
})

test('传输服务固定白名单、动态核对 Schema 并限制在线数据量', () => {
  const service = source('server/services/complete-admin/transfer-service.ts')
  assert.match(service, /export const TRANSFER_TABLES/u)
  assert.match(service, /SELECT name FROM _cms_migrations ORDER BY name DESC LIMIT 1/u)
  assert.match(service, /BACKUP_SCHEMA_TOO_NEW/u)
  assert.match(service, /ONLINE_IMPORT_ROWS = 500/u)
  assert.match(service, /IMPORT_TABLE_NOT_ALLOWED/u)
  assert.match(service, /IMPORT_UNKNOWN_FIELD/u)
  assert.match(service, /IMPORT_FIELD_SHAPE_MISMATCH/u)
  assert.match(service, /IMPORT_PASSWORD_HASH_REQUIRED/u)
})

test('恢复在一次有界批处理中完成，支持合并、替换和摘要防篡改', () => {
  const service = source('server/services/complete-admin/transfer-service.ts')
  assert.equal(service.match(/await db\.batch\(operations\)/gu)?.length, 1)
  assert.match(service, /FROM json_each\(\?\)/u)
  assert.match(service, /ON CONFLICT\(uid\) DO UPDATE SET/u)
  assert.match(service, /for \(const table of \[\.\.\.IMPORT_ORDER\]\.reverse\(\)\)/u)
  assert.match(service, /DELETE FROM \$\{identifier\(table\)\}/u)
  assert.match(service, /Backup changed after preview/u)
  assert.match(service, /MAX_IMPORT_OPERATIONS/u)
})

test('账号权限恢复撤销活动会话，导出和恢复均留下审计与缓存失效', () => {
  const service = source('server/services/complete-admin/transfer-service.ts')
  const invalidationMap = source('server/cache/invalidation-map.ts')
  assert.match(service, /table\.startsWith\('auth_'\)/u)
  assert.match(service, /UPDATE auth_sessions SET revoked_at=\?,revoke_reason='security_policy'/u)
  assert.match(service, /INSERT INTO operation_logs/u)
  assert.match(service, /cache_generations/u)
  assert.match(service, /cacheTagsForMutation/u)
  assert.match(invalidationMap, /global_settings: \['public:settings', 'public:home', 'public:media-policy'\]/u)
  assert.match(service, /configurationRestored: restoresConfiguration/u)
  assert.match(service, /requiresReload: restoresConfiguration \|\| restoresAuth/u)
  assert.match(service, /sessionsRevoked: restoresAuth/u)
})

test('配置恢复保持备份内更新时间顺序并晚于目标库旧配置', () => {
  const service = source('server/services/complete-admin/transfer-service.ts')
  assert.match(service, /SELECT MAX\(updated_at\) AS updated_at/u)
  assert.match(service, /currentLatestMillis \+ records\.length/u)
  assert.match(service, /left\.value - right\.value \|\| left\.index - right\.index/u)
  assert.match(service, /restoredUpdatedAt\.get\(index\)/u)
})

test('加密备份可选择携带受管理媒体文件并明确容量边界', () => {
  const service = source('server/services/complete-admin/transfer-service.ts')
  const mediaService = source('server/services/media/media-service.ts')
  const workspace = source('app/components/admin/complete/AdminCompleteTransferWorkspace.vue')
  assert.match(service, /MAX_MEDIA_BACKUP_OBJECTS = 100/u)
  assert.match(service, /MAX_MEDIA_BACKUP_BYTES = 24 \* 1024 \* 1024/u)
  assert.match(service, /includeMediaFiles/u)
  assert.match(service, /validateMediaObjectCatalog/u)
  assert.match(service, /rollbackRestoredMedia/u)
  assert.match(mediaService, /readForBackup/u)
  assert.match(mediaService, /restoreFromBackup/u)
  assert.match(mediaService, /rollbackBackupRestore/u)
  assert.match(workspace, /同时备份受管理的媒体实体文件/u)
  assert.match(workspace, /mediaFilesIncluded/u)
})

test('配置恢复报告刷新链路', () => {
  const workspace = source('app/components/admin/complete/AdminCompleteTransferWorkspace.vue')
  assert.match(workspace, /配置生效/u)
  assert.match(workspace, /window\.location\.reload\(\)/u)
  assert.match(workspace, /window\.location\.assign\('\/admin\/login'\)/u)
})

test('加密备份与 CSV 使用强参数和共享公式注入防护', () => {
  const service = source('server/services/complete-admin/transfer-service.ts')
  const csv = source('server/utils/complete-admin/csv.ts')
  assert.match(service, /PBKDF2-SHA256/u)
  assert.match(service, /iterations: 600_000/u)
  assert.match(service, /AES-256-GCM/u)
  assert.match(service, /serializeSafeCsv/u)
  assert.match(csv, /\^\[=\+\\-@\\t\\r\]/u)
  assert.match(csv, /'\$\{text\}/u)
})

test('三个写接口分别要求导出、预检和恢复权限且启用 CSRF', () => {
  const api = source('server/utils/complete-admin/api.ts')
  const routes = [
    ['server/api/v1/admin/complete/import-export/export.post.ts', "'export'", '256*1024'],
    ['server/api/v1/admin/complete/import-export/preview.post.ts', "'create'", '48*1024*1024'],
    ['server/api/v1/admin/complete/import-export/apply.post.ts', "'edit'", '48*1024*1024'],
  ]
  for (const [path, permission, limit] of routes) {
    const route = source(path)
    assert.match(route, new RegExp(permission, 'u'))
    assert.match(route, /\{write:true\}/u)
    assert.match(route.replaceAll(' ', ''), new RegExp(`readBoundedJson\\(event,${limit.replaceAll('*', '\\*')}\\)`, 'u'))
  }
  for (const code of ['CSV_SINGLE_TABLE_REQUIRED', 'BACKUP_DECRYPT_FAILED', 'BACKUP_SCHEMA_TOO_NEW', 'IMPORT_CONFIRMATION_REQUIRED']) {
    assert.match(api, new RegExp(`${code}: 422`, 'u'))
  }
  assert.match(api, /IMPORT_DIGEST_MISMATCH: 409/u)
})
