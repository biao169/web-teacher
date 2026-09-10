import type { AdminMediaRow } from './media'

export interface AdminUploadedMedia {
  uid: string
  objectKey: string
  title: string
  category: string
  mimeType: string
  size: number
  storageKind: 'local' | 'r2' | 'static' | 'external'
  status: 'active'
  checksum: string
  updatedAt: string
}

export interface AdminUploadedMediaRow extends AdminMediaRow {
  title: string
  category: string
  mime_type: string
  status: 'active'
  checksum: string
}

/** Convert the upload endpoint's API shape into the row shape used by media lists. */
export function adminUploadedMediaRow(media: AdminUploadedMedia): AdminUploadedMediaRow {
  return {
    uid: media.uid,
    object_key: media.objectKey,
    title: media.title,
    category: media.category,
    mime_type: media.mimeType,
    size: media.size,
    storage_kind: media.storageKind,
    status: media.status,
    checksum: media.checksum,
    updated_at: media.updatedAt,
  }
}
