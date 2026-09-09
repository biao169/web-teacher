import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('论文编辑器接入主页教师提取和多格式引用生成器', async () => {
  const editor = await read('app/components/admin/content/Editor.vue')
  const generator = await read('app/components/admin/complete/AdminPublicationCitationGenerator.vue')
  assert.match(editor, /AdminPublicationCitationGenerator/u)
  assert.match(editor, /item\.group\.id === 'citation'/u)
  assert.match(generator, /提取主页教师姓名/u)
  assert.match(generator, /生成全部引用格式/u)
  assert.match(generator, /应用后仍需使用页面底部“保存”/u)
  for (const value of ['citation_gbt', 'citation_elsevier', 'citation_apa', 'citation_ieee', 'bibtex']) assert.match(generator, new RegExp(value, 'u'))
})

test('主页教师接口与前台共用公开启用精选教师的排序规则', async () => {
  const route = await read('server/api/v1/admin/complete/metadata/homepage-profile.get.ts')
  const service = await read('server/services/complete-admin/metadata-service.ts')
  assert.ok(route.includes("requireAdmin(event, ['publications'], 'edit')"))
  assert.match(service, /PUBLIC_HOME_PROFILE_BASE\.join/u)
  assert.match(service, /PUBLIC_CONTENT_ORDER\.profiles/u)
  const rules = await read('db/public-content-rules.ts')
  assert.match(rules, /PUBLIC_HOME_PROFILE_BASE.*PUBLIC_CONTENT_BASE\.profiles.*is_featured = 1/u)
  assert.doesNotMatch(service.slice(service.indexOf('async homepageProfile()'), service.indexOf('async doi(')), /homepage_profile_uid/u)
})

test('论文前台复用引用分段，不根据高亮自动追加通讯作者星号', async () => {
  const detail = await read('app/components/public/content/PublicationDetail.vue')
  const highlighted = await read('app/components/public/content/HighlightedText.vue')
  assert.match(detail, /CitationText/u)
  assert.match(detail, /CopyRecordButton/u)
  assert.match(await read('shared/utils/public-copy.ts'), /publicCitationSegments/u)
  assert.doesNotMatch(detail, /mark-suffix/u)
  assert.match(detail, /model\.item\.correspondingAuthors/u)
  assert.match(highlighted, /splitHighlightedText/u)
  assert.match(highlighted, /<mark/u)
  assert.doesNotMatch(detail + highlighted, /v-html/u)
})
