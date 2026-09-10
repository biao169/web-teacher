import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RESOURCE_CATALOG, getResource, normalizeRecordInput, normalizeBatchRequest, validateNavigation,
  detectMediaSignature, validateRichTextDocument, renderRichTextDocument, richTextMediaKeys, createBackupEnvelope,
  parseBackupEnvelope, redactSensitive, buildTranslationProviderRequest, normalizeUploadExtensions
} from '../../shared/complete-admin/core.mjs'

test('catalog exposes every remaining backend area', () => {
  for (const key of ['site-settings','global-settings','navigation','media','translation','news']) assert.ok(RESOURCE_CATALOG[key], key)
  for (const removed of ['users', 'roles', 'permissions', 'logs']) assert.throws(() => getResource(removed), /UNKNOWN_ADMIN_RESOURCE/u)
  assert.equal(getResource('media').readOnlyCreate, true)
  assert.deepEqual(RESOURCE_CATALOG['site-settings'].quick, ['is_active'])
  assert.deepEqual(RESOURCE_CATALOG['global-settings'].quick, ['allow_public_registration', 'allow_anonymous_messages'])
  assert.deepEqual(RESOURCE_CATALOG['site-settings'].invalidate, ['module:site_settings', 'public:site', 'public:layout', 'public:home', 'public:seo'])
  assert.deepEqual(RESOURCE_CATALOG['global-settings'].invalidate, ['module:global_settings', 'public:settings', 'public:home', 'public:media-policy'])
})

test('every complete-resource field carries reusable placeholder and help metadata', () => {
  for (const resource of Object.values(RESOURCE_CATALOG)) {
    for (const field of resource.fields) {
      assert.equal(typeof field.placeholder, 'string', `${resource.key}.${field.key} placeholder`)
      assert.ok(field.placeholder.trim(), `${resource.key}.${field.key} placeholder`)
      assert.equal(typeof field.help, 'string', `${resource.key}.${field.key} help`)
      assert.ok(field.help.trim(), `${resource.key}.${field.key} help`)
    }
  }
  const news = getResource('news')
  assert.match(news.fields.find(field => field.key === 'related_publication_uid').help, /关联/u)
  assert.match(news.fields.find(field => field.key === 'published_at').placeholder, /日期和时间/u)
  assert.match(getResource('global-settings').fields.find(field => field.key === 'deepl_api_key').help, /不会回显/u)
})

test('secret fields require explicit three-state operations', () => {
  assert.throws(() => normalizeRecordInput('global-settings', { deepl_api_key: 'leak' }, 'update'), /SECRET_REQUIRES_OPERATION/u)
  const keep = normalizeRecordInput('global-settings', { secretOperations: { deepl_api_key: { action: 'keep' } } }, 'update')
  assert.deepEqual(keep.secretOperations.deepl_api_key, { action: 'keep' })
  const replace = normalizeRecordInput('global-settings', { secretOperations: { deepl_api_key: { action: 'replace', value: 'secret-value' } } }, 'update')
  assert.equal(replace.secretOperations.deepl_api_key.value, 'secret-value')
  assert.throws(() => normalizeRecordInput('global-settings', { secretOperations: { deepl_api_key: { action: 'drop' } } }, 'update'), /INVALID_SECRET_ACTION/u)
})

test('navigation validation separates internal and external links', () => {
  assert.doesNotThrow(() => validateNavigation({ kind: 'route', path: '/zh/publications', fragment: 'featured' }))
  assert.doesNotThrow(() => validateNavigation({ kind: 'route', url_name: 'research', path: null, fragment: '' }))
  assert.doesNotThrow(() => validateNavigation({ kind: 'anchor', url_name: null, path: null, fragment: 'research_topics' }))
  assert.doesNotThrow(() => validateNavigation({ kind: 'external', path: 'https://example.org/lab', fragment: '' }))
  assert.doesNotThrow(() => validateNavigation({ kind: 'button', path: '/admin/news', fragment: '', location: 'admin-sidebar' }))
  assert.throws(() => validateNavigation({ kind: 'external', path: 'javascript:alert(1)', fragment: '' }), /INVALID_EXTERNAL_URL/u)
  assert.throws(() => validateNavigation({ kind: 'external', path: '', fragment: '' }), /REQUIRED_NAVIGATION_TARGET/u)
  assert.throws(() => validateNavigation({ kind: 'anchor', path: null, fragment: '' }), /REQUIRED_NAVIGATION_FRAGMENT/u)
  assert.throws(() => validateNavigation({ kind: 'route', url_name: 'unknown', path: null, fragment: '' }), /INVALID_ROUTE_NAME/u)
  assert.throws(() => validateNavigation({ kind: 'route', url_name: 'research', path: '/research', fragment: '' }), /INVALID_NAVIGATION_TARGET/u)
  assert.throws(() => validateNavigation({ kind: 'route', path: '/research', fragment: '', location: 'admin-sidebar' }), /INVALID_ADMIN_NAVIGATION_TARGET/u)
  assert.throws(() => validateNavigation({ kind: 'route', path: '/api/v1/private', fragment: '' }), /FORBIDDEN_INTERNAL_PATH/u)
  assert.throws(() => validateNavigation({ kind: 'route', path: '/../admin', fragment: '' }), /INVALID_INTERNAL_PATH/u)
  assert.throws(() => validateNavigation({ kind: 'route', path: '/%2e%2e/admin', fragment: '' }), /INVALID_INTERNAL_PATH/u)
})

test('batch request rejects duplicates and unapproved fields', () => {
  const time = '2026-09-01T00:00:00.000Z'
  const value = normalizeBatchRequest('navigation', { records: [{ uid: 'nav:a', expectedUpdatedAt: time }], field: 'enabled', value: true })
  assert.equal(value.value, 1)
  const sequence = normalizeBatchRequest('navigation', { records: [{ uid: 'nav:a', expectedUpdatedAt: time }, { uid: 'nav:b', expectedUpdatedAt: time }], field: 'sort_order', sequence: { start: 20, step: 10 } })
  assert.deepEqual(sequence.values, [20, 30])
  assert.deepEqual(sequence.sequence, { start: 20, step: 10 })
  assert.throws(() => normalizeBatchRequest('navigation', { records: [{ uid: 'nav:a', expectedUpdatedAt: time }], field: 'sort_order', sequence: { start: 20, step: 0 } }), /INVALID_BATCH_SEQUENCE_STEP/u)
  assert.throws(() => normalizeBatchRequest('navigation', { records: [{ uid: 'nav:a', expectedUpdatedAt: time }, { uid: 'nav:a', expectedUpdatedAt: time }], field: 'enabled', value: 1 }), /DUPLICATE_BATCH_UID/u)
  assert.throws(() => normalizeBatchRequest('navigation', { records: [{ uid: 'nav:a', expectedUpdatedAt: time }], field: 'path', value: '/x' }), /BATCH_FIELD_NOT_ALLOWED/u)
})

test('media type derives from bytes instead of filename', () => {
  assert.deepEqual(detectMediaSignature(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), { mime: 'image/png', extension: 'png' })
  assert.deepEqual(detectMediaSignature(new TextEncoder().encode('%PDF-1.7')), { mime: 'application/pdf', extension: 'pdf' })
  assert.deepEqual(detectMediaSignature(Uint8Array.from([0,0,0,24,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d])), { mime: 'video/mp4', extension: 'mp4' })
  assert.deepEqual(detectMediaSignature(Uint8Array.from([0x1a,0x45,0xdf,0xa3,0x42,0x82,0x84,0x77,0x65,0x62,0x6d,0,0,0,0,0])), { mime: 'video/webm', extension: 'webm' })
  assert.equal(detectMediaSignature(new TextEncoder().encode('<svg onload=alert(1)>')), null)
})

test('media descriptor keeps lifecycle changes behind guarded endpoints', () => {
  const media = getResource('media')
  assert.equal(media.fields.find(field => field.key === 'status').readonly, true)
  assert.deepEqual(media.batch, ['category'])
  assert.deepEqual(media.invalidate, ['public:media'])
  const time = '2026-09-01T00:00:00.000Z'
  assert.equal(normalizeBatchRequest('media', { records: [{ uid: 'media:a', expectedUpdatedAt: time }], field: 'category', value: 'cover' }).value, 'cover')
  assert.throws(() => normalizeBatchRequest('media', { records: [{ uid: 'media:a', expectedUpdatedAt: time }], field: 'status', value: 'trash' }), /BATCH_FIELD_NOT_ALLOWED/u)
})

test('global settings accept only canonical upload-extension JSON arrays', () => {
  assert.deepEqual(normalizeUploadExtensions('[".PNG","jpg","jpg","pdf"]'), ['png', 'jpg', 'pdf'])
  assert.deepEqual(normalizeUploadExtensions('["mp4","WEBM"]'), ['mp4', 'webm'])
  assert.deepEqual(normalizeUploadExtensions('[]'), [])
  assert.throws(() => normalizeUploadExtensions('png,jpg'), /INVALID_UPLOAD_EXTENSIONS/u)
  assert.throws(() => normalizeUploadExtensions('["svg"]'), /INVALID_UPLOAD_EXTENSIONS/u)
  assert.throws(() => normalizeRecordInput('global-settings', { upload_allowed_extensions: '{}' }, 'update'), /INVALID_JSON_ARRAY/u)
  assert.throws(() => normalizeRecordInput('global-settings', { translation_job_state: '[]' }, 'update'), /READ_ONLY_FIELD/u)
})

test('rich text accepts explicit nodes and escapes text', () => {
  const document = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: '<Research>' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Paper', marks: [{ type: 'bold' }] }] }, { type: 'image', attrs: { objectKey: 'uploads/demo.png', alt: 'demo', float: 'right' } }] }
  assert.equal(validateRichTextDocument(document).type, 'doc')
  const html = renderRichTextDocument(document)
  assert.match(html, /&lt;Research&gt;/u)
  assert.match(html, /<strong>Paper<\/strong>/u)
  assert.match(html, /rich-align-center/u)
  assert.match(html, /rich-image-right/u)
  const centered = renderRichTextDocument({ type: 'doc', content: [{ type: 'image', attrs: { objectKey: 'uploads/demo.png', alt: 'demo', float: 'center' } }] })
  assert.match(centered, /rich-image-center/u)
  assert.deepEqual(richTextMediaKeys(document), ['uploads/demo.png'])
  assert.equal(html.includes('javascript:'), false)
})

test('news descriptor exposes relation pickers, safe defaults and public cache tags', () => {
  const news = getResource('news')
  assert.equal(news.fields.find(field => field.key === 'content_format').default, 'plain')
  assert.equal(news.fields.find(field => field.key === 'visibility').default, 'hidden')
  assert.equal(news.fields.find(field => field.key === 'related_publication_uid').type, 'relation')
  assert.deepEqual(news.invalidate, ['public:news','public:home','public:translations','public:media'])
})

test('rich text rejects scripts, h1 and unsafe links', () => {
  assert.throws(() => validateRichTextDocument({ type: 'doc', content: [{ type: 'script' }] }), /UNSUPPORTED_RICH_TEXT_NODE/u)
  assert.throws(() => validateRichTextDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] }), /INVALID_HEADING_LEVEL/u)
  assert.throws(() => validateRichTextDocument({ type: 'doc', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }), /INVALID_RICH_TEXT_LINK/u)
})

test('backup envelope is bounded and versioned', () => {
  const envelope = createBackupEnvelope({ profiles: [{ uid: 'profile:1', name: 'A' }] }, { schemaVersion: '0007', createdAt: '2026-09-01T00:00:00Z' })
  assert.equal(parseBackupEnvelope(envelope).format, 'academic-cms-backup')
  assert.throws(() => parseBackupEnvelope({ ...envelope, version: 999 }), /UNSUPPORTED_BACKUP/u)
})

test('sensitive audit fields are recursively redacted', () => {
  const value = redactSensitive({ password: 'x', nested: { apiKey: 'y', title: 'safe' }, cookie: 'z' })
  assert.equal(value.password, '[REDACTED]')
  assert.equal(value.nested.apiKey, '[REDACTED]')
  assert.equal(value.nested.title, 'safe')
})

test('translation provider requests use fixed endpoints', () => {
  const deepL = buildTranslationProviderRequest('deepl', { apiKey: 'secret:fx' }, ['你好'])
  assert.equal(new URL(deepL.url).hostname, 'api-free.deepl.com')
  assert.match(deepL.headers.authorization, /DeepL-Auth-Key/u)
  assert.throws(() => buildTranslationProviderRequest('libretranslate', { url: 'http://evil.example' }, ['x']), /INSECURE_PROVIDER_ENDPOINT/u)
})
