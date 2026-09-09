import type { VisibilityScope } from './auth'

export const MEDIA_STORAGE_KINDS = ['static', 'local', 'r2', 'external'] as const
export type MediaStorageKind = (typeof MEDIA_STORAGE_KINDS)[number]

export const MEDIA_STATUSES = ['active', 'trash'] as const
export type MediaStatus = (typeof MEDIA_STATUSES)[number]

export const MEDIA_PURPOSES = [
  'avatar',
  'logo',
  'favicon',
  'og_image',
  'cover',
  'publication_pdf',
  'certificate',
  'syllabus',
  'course_material',
  'message_attachment',
  'generic',
] as const
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number]

export const MEDIA_DISPOSITIONS = ['inline', 'attachment'] as const
export type MediaDisposition = (typeof MEDIA_DISPOSITIONS)[number]

export type MediaVisibility = VisibilityScope

const storageKindSet = new Set<string>(MEDIA_STORAGE_KINDS)
const purposeSet = new Set<string>(MEDIA_PURPOSES)
const dispositionSet = new Set<string>(MEDIA_DISPOSITIONS)

export function isMediaStorageKind(value: unknown): value is MediaStorageKind {
  return typeof value === 'string' && storageKindSet.has(value)
}

export function isMediaPurpose(value: unknown): value is MediaPurpose {
  return typeof value === 'string' && purposeSet.has(value)
}

export function isMediaDisposition(value: unknown): value is MediaDisposition {
  return typeof value === 'string' && dispositionSet.has(value)
}
