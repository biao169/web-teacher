import { describe, expect, it } from 'vitest'
import { adminUploadedMediaRow } from '../../app/admin/media-upload'

describe('admin media upload result', () => {
  it('normalizes an uploaded object into the list row contract', () => {
    expect(adminUploadedMediaRow({
      uid: 'media:test',
      objectKey: 'uploads/2026/09/test.png',
      title: 'Test image',
      category: 'admin',
      mimeType: 'image/png',
      size: 128,
      storageKind: 'local',
      status: 'active',
      checksum: 'abc',
      updatedAt: '2026-09-06T00:00:00.000Z',
    })).toEqual({
      uid: 'media:test',
      object_key: 'uploads/2026/09/test.png',
      title: 'Test image',
      category: 'admin',
      mime_type: 'image/png',
      size: 128,
      storage_kind: 'local',
      status: 'active',
      checksum: 'abc',
      updated_at: '2026-09-06T00:00:00.000Z',
    })
  })
})
