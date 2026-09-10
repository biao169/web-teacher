/** Shared response shapes for the library, recycle bin and media picker. */
export interface AdminMediaRow {
  readonly [key: string]: unknown
  uid: string
  object_key: string
  title: string | null
  category: string | null
  mime_type: string | null
  size: number
  storage_kind: 'local' | 'r2' | 'static' | 'external'
  status: 'active' | 'trash'
  updated_at: string
}

export interface AdminMediaList {
  rows: AdminMediaRow[]
  total: number
}

export interface AdminMediaPreviews {
  items: Array<{ uid: string; view?: { available: boolean; url?: string; mimeType?: string } }>
}

export interface AdminMediaStats {
  totals: { total: number; active: number; trash: number; bytes: number }
  categories: Array<{ value: string | null; label: string; total: number }>
  policy: { effectiveMaxMb: number; allowedExtensions: string[]; trashRetentionDays: number }
}
