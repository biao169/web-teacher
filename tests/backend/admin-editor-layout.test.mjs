import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const source = relative => readFile(resolve(root, relative), 'utf8')

test('所有主对象编辑界面复用统一完整编辑器壳', async () => {
  const files = [
    'app/components/admin/content/Editor.vue',
    'app/components/admin/complete/AdminCompleteRecordEditor.vue',
    'app/components/admin/complete/AdminCompleteMediaWorkspace.vue',
    'app/components/admin/complete/AdminCompleteTranslationWorkspace.vue',
    'app/components/admin/complete/AdminCompleteAuthWorkspace.vue',
    'app/components/admin/complete/AdminCompleteLogWorkspace.vue',
    'app/components/admin/complete/AdminCompleteNewsEditor.vue',
  ]
  for (const file of files) {
    const text = await source(file)
    assert.match(text, /import AdminEditorShell from ['"]\.\.\/shared\/AdminEditorShell\.vue['"]/u, `${file} 必须显式导入统一编辑壳，不能依赖 Nuxt 目录前缀自动命名`)
    assert.match(text, /<AdminEditorShell/u, file)
    assert.match(text, /admin-form-section/u, file)
  }
  assert.doesNotMatch(await source('app/components/admin/complete/AdminCompleteLogWorkspace.vue'), /ElDrawer/u)
})

test('统一编辑器提供分区导航、双保存动作和未保存保护', async () => {
  const shell = await source('app/components/admin/shared/AdminEditorShell.vue')
  const generic = await source('app/components/admin/complete/AdminCompleteRecordEditor.vue')
  assert.match(shell, /admin-form-nav/u)
  assert.match(shell, /aria-current/u)
  assert.match(shell, /handleShortcut/u)
  assert.match(shell, /save-and-return/u)
  assert.match(generic, /useAdminEditorLifecycle/u)
  const lifecycle = await source('app/composables/useAdminEditorLifecycle.ts')
  assert.match(lifecycle, /beforeunload/u)
  assert.match(lifecycle, /onBeforeRouteLeave/u)
  assert.match(lifecycle, /onBeforeRouteUpdate/u)
  assert.match(lifecycle, /未保存/u)
})

test('页内编辑器把当前对象写入 URL，并支持刷新和前进后退恢复', async () => {
  const [resource, media, translation, auth, logs] = await Promise.all([
    source('app/components/admin/complete/AdminCompleteResourceWorkspace.vue'),
    source('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
    source('app/components/admin/complete/AdminCompleteTranslationWorkspace.vue'),
    source('app/components/admin/complete/AdminCompleteAuthWorkspace.vue'),
    source('app/components/admin/complete/AdminCompleteLogWorkspace.vue'),
  ])
  assert.match(resource, /route\.query\.edit/u)
  assert.match(resource, /syncEditQuery/u)
  assert.match(resource, /applyEditQuery/u)
  assert.match(resource, /@dirty="editorDirty = \$event"/u)
  assert.match(media, /route\.query\.edit/u)
  assert.match(media, /restoreEditFromQuery/u)
  assert.match(translation, /route\.query\.edit/u)
  assert.match(translation, /restoreEditFromQuery/u)
  assert.match(auth, /syncObjectQuery/u)
  assert.match(auth, /route\.query\.tab/u)
  assert.match(logs, /route\.query\.detail/u)
  assert.match(logs, /applyDetailQuery/u)
})

test('统一页脚按对象生命周期提供删除、回收、失效或禁用动作', async () => {
  const [generic, resource, media, translation, auth, news] = await Promise.all([
    source('app/components/admin/content/Editor.vue'),
    source('app/components/admin/complete/AdminCompleteRecordEditor.vue'),
    source('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
    source('app/components/admin/complete/AdminCompleteTranslationWorkspace.vue'),
    source('app/components/admin/complete/AdminCompleteAuthWorkspace.vue'),
    source('app/components/admin/complete/AdminCompleteNewsEditor.vue'),
  ])
  for (const text of [generic, resource, media, translation, auth, news]) assert.match(text, /#danger-actions/u)
  assert.match(media, /:disabled="!canTrash\(editRow\)"/u)
  assert.match(media, /usageCount\(editRow\) > 0 \? `已被引用/u)
  assert.match(media, /'移入回收站'/u)
  assert.match(translation, /使译文失效<\/ElButton>/u)
  assert.match(auth, /禁用账号<\/ElButton>/u)
  assert.match(auth, /删除角色<\/ElButton>/u)
  assert.match(news, /删除新闻<\/ElButton>/u)
})

test('全局设置密钥状态在首次渲染前完成初始化，读取失败时可重试', async () => {
  const editor = await source('app/components/admin/complete/AdminCompleteRecordEditor.vue')
  assert.match(editor, /const loading = ref\(true\)/u)
  assert.match(editor, /initializeSecretOperations\(\)/u)
  assert.match(editor, /const loaded = ref\(false\)/u)
  assert.match(editor, /v-else-if="!loaded"/u)
  assert.match(editor, /@update:model-value="updateSecretAction/u)
  assert.doesNotMatch(editor, /v-model="secretOperations\[field\.key\]/u)
})

test('新闻只保留完整资源与富文本正式链路', async () => {
  const modules = await source('shared/admin/content-modules.ts')
  const richEditor = await source('app/components/admin/complete/AdminCompleteNewsEditor.vue')
  const removedRoutes = await source('server/middleware/removed-admin-routes.ts')
  assert.doesNotMatch(modules, /^\s*'news',\s*$/mu)
  assert.doesNotMatch(modules, /^\s*news:\s*\{/mu)
  assert.match(richEditor, /AdminEditorShell/u)
  assert.match(richEditor, /news-rich-content/u)
  assert.match(richEditor, /save\(true\)/u)
  assert.match(removedRoutes, /removedNewsEditor/u)
})

test('旧版页面、别名中间件和弹窗编辑器已删除', async () => {
  const removed = [
    'app/components/admin/complete/AdminCompleteRecordDialog.vue',
    'app/shared/admin/route-aliases.ts',
    'app/middleware/00-admin-canonical.global.ts',
    ...['site-settings','global-settings','navigation-items','media-library','translation-cache','translations','operation-logs','users','roles','permissions','backup','research-interests','student-category-displays'].map(name => `app/pages/admin/${name}/index.vue`),
  ]
  for (const file of removed) await assert.rejects(access(resolve(root, file)), undefined, file)
  const core = await source('shared/complete-admin/core.mjs')
  for (const key of ['users', 'roles', 'permissions', 'logs']) assert.doesNotMatch(core, new RegExp(`^\\s*${key}:\\s*\\{`, 'mu'), key)
  const rejection = await source('server/middleware/removed-admin-routes.ts')
  assert.match(rejection, /statusCode:\s*404/u)
  assert.match(rejection, /message:/u)
  assert.doesNotMatch(rejection, /redirect|navigateTo/u)
})
