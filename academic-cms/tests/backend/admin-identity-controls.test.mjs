import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const source = relative => readFile(resolve(root, relative), 'utf8')

test('统一 UID 与查重实现覆盖所有对象创建入口', async () => {
  const required = [
    'shared/admin/identity.ts',
    'app/components/admin/shared/AdminIdentitySection.vue',
    'app/components/admin/shared/AdminCheckedFormItem.vue',
    'server/services/complete-admin/duplicate-service.ts',
    'server/api/v1/admin/complete/duplicates/check.get.ts',
  ]
  for (const path of required) assert.equal((await stat(resolve(root, path))).isFile(), true, path)

  const [content, complete, auth, media] = await Promise.all([
    source('app/components/admin/content/Editor.vue'),
    source('app/components/admin/complete/AdminCompleteRecordEditor.vue'),
    source('app/components/admin/complete/AdminCompleteAuthWorkspace.vue'),
    source('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
  ])
  for (const editor of [content, complete, auth, media]) assert.match(editor, /AdminIdentitySection|uploadUid/u)
  assert.match(content, /body:\s*\{ uid: uidValue\.value, values \}/u)
  assert.match(complete, /values\.uid = uidValue\.value/u)
  assert.match(auth, /uid: userForm\.uid/u)
  assert.match(media, /uploadAdminMedia\(file, \{ uid: uploadUid\.value/u)
})

test('服务端把自定义 UID 送入最终数据库唯一约束且禁止更新 UID', async () => {
  const [contentService, contentStore, resource, auth, media] = await Promise.all([
    source('server/services/admin/content-service.ts'),
    source('server/services/admin/content-store.ts'),
    source('server/services/complete-admin/resource-service.ts'),
    source('server/services/complete-admin/auth-service.ts'),
    source('server/services/complete-admin/media-service.ts'),
  ])
  assert.match(contentService, /\['uid', 'values'\]/u)
  assert.match(contentStore, /requestedUid/u)
  assert.match(resource, /Reflect\.deleteProperty\(source, 'uid'\)/u)
  assert.match(auth, /DUPLICATE_UID/u)
  assert.match(media, /query\.uid/u)
})

test('查重接口只允许白名单资源字段并先执行查看权限校验', async () => {
  const [route, service, component] = await Promise.all([
    source('server/api/v1/admin/complete/duplicates/check.get.ts'),
    source('server/services/complete-admin/duplicate-service.ts'),
    source('app/components/admin/shared/AdminCheckedFormItem.vue'),
  ])
  assert.match(route, /requireAdmin\([^)]*'view'/su)
  assert.match(service, /DUPLICATE_RESOURCES/u)
  assert.match(service, /UNKNOWN_DUPLICATE_FIELD/u)
  assert.match(service, /LIMIT 11/u)
  assert.match(component, /target="_blank"/u)
  assert.match(component, /rel="noopener noreferrer"/u)
})
