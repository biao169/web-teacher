import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = path => readFileSync(path, 'utf8')

test('media admin page mounts the complete workspace', () => {
  const page = read('app/pages/admin/media/index.vue')
  const trash = read('app/pages/admin/media/trash/index.vue')
  assert.match(page, /AdminCompleteMediaWorkspace/u)
  assert.match(page, /mode="library"/u)
  assert.match(trash, /AdminCompleteMediaWorkspace/u)
  assert.match(trash, /mode="trash"/u)
  assert.doesNotMatch(page, /to=["']\/admin\/media["']/u)
})

test('workspace and picker use authorized preview grants and server filters', () => {
  const workspace = read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue')
  const picker = read('app/components/admin/complete/AdminCompleteMediaPicker.vue')
  for (const source of [workspace, picker]) {
    assert.match(source, /\/api\/v1\/admin\/complete\/media\/previews/u)
    assert.doesNotMatch(source, /[`"']\/media\/\$\{/u)
  }
  assert.match(workspace, /batch-status/u)
  assert.match(workspace, /\/cleanup/u)
  assert.match(workspace, /deep/u)
  assert.match(workspace, /\/api\/v1\/admin\/complete\/media\/trash/u)
  assert.match(workspace, /\u79fb\u5165\u56de\u6536\u7ad9/u)
  assert.match(workspace, /target="_blank"/u)
  assert.match(workspace, /rel="noopener noreferrer"/u)
  assert.match(workspace, /@save="saveMetadata\(false\)"/u)
  assert.match(workspace, /@save-and-return="saveMetadata\(true\)"/u)
  assert.match(picker, /f_mime_type/u)
  assert.match(picker, /f_status/u)
  assert.doesNotMatch(picker, /mediaMime/u)
  assert.match(picker, /ElPagination/u)
})

test('media lifecycle APIs and binary-route exception are present', () => {
  for (const path of [
    'server/api/v1/admin/complete/media/index.get.ts',
    'server/api/v1/admin/complete/media/trash.get.ts',
    'server/api/v1/admin/complete/media/stats.get.ts',
    'server/api/v1/admin/complete/media/previews.get.ts',
    'server/api/v1/admin/complete/media/preview-by-key.get.ts',
    'server/api/v1/admin/complete/media/usage-summary.get.ts',
    'server/api/v1/admin/complete/media/scan.get.ts',
    'server/api/v1/admin/complete/media/batch-status.patch.ts',
    'server/api/v1/admin/complete/media/cleanup.post.ts',
    'server/api/v1/admin/complete/media/[uid]/metadata.patch.ts',
  ]) assert.equal(existsSync(path), true, path)
  const service = read('server/services/complete-admin/media-service.ts')
  const activeList = read('server/api/v1/admin/complete/media/index.get.ts')
  const trashList = read('server/api/v1/admin/complete/media/trash.get.ts')
  assert.match(activeList, /f_status:\s*'active'/u)
  assert.match(trashList, /f_status:\s*'trash'/u)
  assert.match(service, /adminPath:\s*usageAdminPath/u)
  assert.match(service, /\/admin\/news\/editor\//u)
  assert.match(service, /inspectStorage/u)
  assert.match(service, /data-object-key=/u)
  assert.match(service, /useMediaRuntime\(event\)\.config\.mediaRoot/u)
  const config = read('nuxt.config.ts')
  assert.match(config, /complete\/media\/upload/u)
  assert.match(config, /xssValidator:\s*false/u)
})
