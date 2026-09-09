import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('论文编辑器接入引文解析、联网查验、原值对照与撤销', async () => {
  const editor = await read('app/components/admin/content/Editor.vue')
  const assistant = await read('app/components/admin/complete/AdminPublicationMetadataAssistant.vue')
  assert.match(editor, /AdminPublicationMetadataAssistant/u)
  assert.match(editor, /联网查验补全/u)
  assert.match(editor, /填充前/u)
  assert.match(editor, /undoPublicationField/u)
  assert.match(editor, /corresponding_authors/u)
  assert.match(assistant, /IEEE、Elsevier、APA、GB\/T 或 BibTeX/u)
  assert.match(assistant, /撤销本次填充/u)
})

test('论文元数据接口支持按题名或 DOI 查询、自动换源和逐源失败结果', async () => {
  const route = await read('server/api/v1/admin/complete/metadata/publication.get.ts')
  const service = await read('server/services/complete-admin/metadata-service.ts')
  assert.ok(route.includes("requireAdmin(event, ['publications'], 'edit')"))
  for (const provider of ['crossref', 'openalex', 'semantic-scholar', 'datacite', 'europe-pmc', 'pubmed']) assert.match(service, new RegExp(provider))
  assert.match(service, /is_corresponding/u)
  assert.match(service, /corresponding_authors/u)
  assert.ok(service.includes("query.requestedProvider === 'auto'"))
  assert.match(service, /METADATA_RATE_LIMITED/u)
  assert.ok(service.includes('attempts.push'))
  assert.ok(service.includes("query.mode === 'title'"))
})
