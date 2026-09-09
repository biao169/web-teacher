import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { core } from '../helpers/offline-stage3.mjs'
import { R2BucketDouble, streamBytes } from '../helpers/stage3-doubles.mjs'

function checksum(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function hasCode(code) { return error => error?.code === code }

async function withTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'academic-cms-media-'))
  try { await run(directory) }
  finally { await rm(directory, { recursive: true, force: true }) }
}

test('local media store creates immutable objects and serves exact ranges', async () => {
  await withTempDirectory(async root => {
    const store = new core.LocalMediaStore(root, { maxObjectBytes: 1024 })
    const bytes = new TextEncoder().encode('0123456789')
    const digest = checksum(bytes)
    const created = await store.put({ key: 'papers/论文.pdf', body: bytes, size: bytes.byteLength, contentType: 'application/pdf', checksumSha256: digest })
    assert.equal(created.size, 10)
    assert.equal(created.checksumSha256, digest)
    assert.deepEqual(new Uint8Array(await readFile(join(root, 'papers', '论文.pdf'))), bytes)

    const head = await store.head('papers/论文.pdf')
    assert.equal(head.size, 10)
    const full = await store.read('papers/论文.pdf')
    assert.deepEqual(await streamBytes(full.body), bytes)
    const partial = await store.read('papers/论文.pdf', { range: { offset: 3, length: 4 }, etagMatches: head.etag })
    assert.deepEqual(await streamBytes(partial.body), new TextEncoder().encode('3456'))
    await assert.rejects(() => store.read('papers/论文.pdf', { range: { offset: 9, length: 2 } }), hasCode('MEDIA_RANGE'))
    await assert.rejects(() => store.read('papers/论文.pdf', { etagMatches: '"changed"' }), hasCode('MEDIA_PRECONDITION'))
    await assert.rejects(() => store.put({ key: 'papers/论文.pdf', body: bytes, size: 10, contentType: 'application/pdf' }), hasCode('MEDIA_CONFLICT'))
    assert.equal(await store.delete('papers/论文.pdf'), true)
    assert.equal(await store.delete('papers/论文.pdf'), false)
  })
})


test('local media ETag detects same-size replacement even when mtime is restored', async () => {
  await withTempDirectory(async root => {
    const store = new core.LocalMediaStore(root, { maxObjectBytes: 1024 })
    const path = join(root, 'objects', 'version.bin')
    const original = new TextEncoder().encode('AAAA')
    await store.put({ key: 'objects/version.bin', body: original, size: original.byteLength, contentType: 'application/octet-stream' })
    const before = await store.head('objects/version.bin')
    const times = await stat(path)
    await new Promise(resolve => setTimeout(resolve, 5))
    await writeFile(path, new TextEncoder().encode('BBBB'))
    await utimes(path, times.atime, times.mtime)
    const after = await store.head('objects/version.bin')
    assert.notEqual(after.etag, before.etag)
    await assert.rejects(() => store.read('objects/version.bin', { etagMatches: before.etag }), hasCode('MEDIA_PRECONDITION'))
  })
})

test('local media store rejects bad declarations, checksums and symlink traversal', async () => {
  await withTempDirectory(async root => {
    const store = new core.LocalMediaStore(root, { maxObjectBytes: 32 })
    const bytes = new TextEncoder().encode('payload')
    await assert.rejects(() => store.put({ key: 'bad/size.bin', body: bytes, size: bytes.byteLength + 1, contentType: 'application/octet-stream' }), hasCode('MEDIA_PROTOCOL'))
    await assert.rejects(() => store.put({ key: 'bad/hash.bin', body: bytes, size: bytes.byteLength, contentType: 'application/octet-stream', checksumSha256: '0'.repeat(64) }), hasCode('MEDIA_PRECONDITION'))
    assert.equal(await store.head('bad/size.bin'), null)
    assert.equal(await store.head('bad/hash.bin'), null)

    const outside = await mkdtemp(join(tmpdir(), 'academic-cms-outside-'))
    try {
      await mkdir(join(outside, 'target'))
      await symlink(join(outside, 'target'), join(root, 'linked'), 'dir')
      await assert.rejects(() => store.head('linked/file.bin'), hasCode('MEDIA_STORAGE'))
      await assert.rejects(() => store.put({ key: 'linked/file.bin', body: bytes, size: bytes.byteLength, contentType: 'application/octet-stream' }), hasCode('MEDIA_STORAGE'))
    }
    finally { await rm(outside, { recursive: true, force: true }) }

    const readOnly = new core.LocalMediaStore(root, { kind: 'static', readOnly: true })
    await assert.rejects(() => readOnly.put({ key: 'x.bin', body: bytes, size: bytes.byteLength, contentType: 'application/octet-stream' }), hasCode('MEDIA_FORBIDDEN'))
    await assert.rejects(() => readOnly.delete('x.bin'), hasCode('MEDIA_FORBIDDEN'))
  })
})

test('R2 media adapter preserves metadata, conditional reads and range semantics', async () => {
  const bucket = new R2BucketDouble()
  const store = new core.R2MediaStore(bucket)
  const bytes = new TextEncoder().encode('abcdefghij')
  const digest = checksum(bytes)
  const head = await store.put({ key: 'courses/material.bin', body: bytes, size: 10, contentType: 'application/octet-stream', checksumSha256: digest })
  assert.equal(head.size, 10)
  assert.equal(head.checksumSha256, digest)
  assert.equal(bucket.calls.put, 1)

  const loaded = await store.read('courses/material.bin', { range: { offset: 2, length: 5 }, etagMatches: head.etag })
  assert.deepEqual(await streamBytes(loaded.body), new TextEncoder().encode('cdefg'))
  assert.deepEqual(loaded.range, { offset: 2, length: 5 })
  await assert.rejects(() => store.read('courses/material.bin', { etagMatches: '"old"' }), hasCode('MEDIA_PRECONDITION'))
  await assert.rejects(() => store.put({ key: 'courses/material.bin', body: bytes, size: 10, contentType: 'application/octet-stream' }), hasCode('MEDIA_CONFLICT'))
  assert.equal(await store.delete('courses/material.bin'), true)
  assert.equal(await store.delete('courses/material.bin'), false)
})

test('static fetch adapter is read-only and validates server range behavior', async () => {
  const bytes = new TextEncoder().encode('0123456789')
  const lastModified = 'Sat, 29 Aug 2026 00:00:00 GMT'
  const fetcher = {
    async fetch(request) {
      if (request.url.endsWith('/missing.bin')) return new Response(null, { status: 404 })
      const headers = new Headers({ etag: '"static-1"', 'last-modified': lastModified, 'content-type': 'application/octet-stream' })
      if (request.method === 'HEAD') {
        headers.set('content-length', String(bytes.byteLength))
        return new Response(null, { status: 200, headers })
      }
      if (request.headers.get('if-match') === '"old"') return new Response(null, { status: 412 })
      const range = request.headers.get('range')
      if (range) {
        const match = /^bytes=(\d+)-(\d+)$/.exec(range)
        const start = Number(match[1]); const end = Number(match[2])
        const part = bytes.slice(start, end + 1)
        headers.set('content-range', `bytes ${start}-${end}/${bytes.byteLength}`)
        headers.set('content-length', String(part.byteLength))
        return new Response(part, { status: 206, headers })
      }
      headers.set('content-length', String(bytes.byteLength))
      return new Response(bytes, { status: 200, headers })
    },
  }
  const store = new core.FetchMediaStore(fetcher)
  assert.equal((await store.head('static/file.bin')).size, 10)
  const range = await store.read('static/file.bin', { range: { offset: 4, length: 3 } })
  assert.equal(range.head.size, 10)
  assert.deepEqual(await streamBytes(range.body), new TextEncoder().encode('456'))
  await assert.rejects(() => store.read('static/file.bin', { etagMatches: '"old"' }), hasCode('MEDIA_PRECONDITION'))
  assert.equal(await store.head('missing.bin'), null)
  await assert.rejects(() => store.put({}), hasCode('MEDIA_FORBIDDEN'))
  await assert.rejects(() => store.delete('static/file.bin'), hasCode('MEDIA_FORBIDDEN'))
})

test('media input validation matches the configured one-gigabyte ceiling and rejects header injection', () => {
  const overLegacyLimit = core.assertPutMediaInput({
    key: 'archives/large.bin',
    body: new Uint8Array(),
    size: 101 * 1024 * 1024,
    contentType: 'application/octet-stream',
    fileName: 'large.bin',
    cacheControl: 'private, no-store',
  })
  assert.equal(overLegacyLimit.size, 101 * 1024 * 1024)
  assert.throws(() => core.assertPutMediaInput({
    key: 'archives/too-large.bin', body: new Uint8Array(), size: 1024 * 1024 * 1024 + 1, contentType: 'application/octet-stream',
  }), hasCode('MEDIA_LIMIT'))
  for (const input of [
    { contentType: '' },
    { contentType: 'text/plain\r\nx-unsafe: yes' },
    { contentType: 'not a mime' },
    { contentType: 'text/plain', fileName: 'safe.txt\r\nx-unsafe: yes' },
    { contentType: 'text/plain', cacheControl: 'public\r\nx-unsafe: yes' },
  ]) {
    assert.throws(() => core.assertPutMediaInput({
      key: 'archives/input.bin', body: new Uint8Array(), size: 0, ...input,
    }), hasCode('MEDIA_INPUT'))
  }
})

test('R2 adapter fails fast for an invalid bucket binding', () => {
  assert.throws(() => new core.R2MediaStore({}), hasCode('MEDIA_CONFIG'))
})

test('static fetch adapter rejects mismatched partial response metadata', async () => {
  const fetcher = {
    async fetch(request) {
      if (request.method === 'HEAD') return new Response(null, {
        status: 200,
        headers: { 'content-length': '10', etag: '"v1"', 'last-modified': 'Sat, 29 Aug 2026 00:00:00 GMT' },
      })
      return new Response('bad', {
        status: 206,
        headers: {
          'content-length': '3',
          'content-range': 'bytes 5-7/10',
          etag: '"v1"',
          'last-modified': 'Sat, 29 Aug 2026 00:00:00 GMT',
        },
      })
    },
  }
  const store = new core.FetchMediaStore(fetcher)
  await assert.rejects(() => store.read('static/file.bin', { range: { offset: 4, length: 3 } }), hasCode('MEDIA_PROTOCOL'))
})
