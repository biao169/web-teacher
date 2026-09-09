import type { AuthModule, VisibilityScope } from '../enums/auth'
import type { MediaDisposition, MediaPurpose } from '../enums/media'

export type PublicMediaFallback = 'initials' | 'placeholder' | 'none'

/** Context supplied by an already-authorized page/service when projecting media. */
export interface MediaProjectionRequest {
  objectKey: string | null
  module: AuthModule
  recordUid: string
  visibility: VisibilityScope
  secondaryVisibility?: VisibilityScope | null
  ownerUid?: string | null
  purpose: MediaPurpose
  /** Parent row updated_at or a stable content fingerprint. */
  referenceRevision: string
  alt?: string | null
  title?: string | null
  width?: number | null
  height?: number | null
  disposition?: MediaDisposition
  allowDownload?: boolean
  fallback?: PublicMediaFallback
}

export interface MissingMediaViewModel {
  available: false
  fallback: PublicMediaFallback
  alt: string
  kind: 'image' | 'video' | 'pdf' | 'file'
}

export interface AvailableMediaViewModel {
  available: true
  url: string
  alt: string
  title: string | null
  kind: 'image' | 'video' | 'pdf' | 'file'
  mimeType: string
  size: number
  width: number | null
  height: number | null
  disposition: MediaDisposition
  downloadAllowed: boolean
  cacheScope: 'public' | 'private'
  purpose: MediaPurpose
}

export type MediaViewModel = MissingMediaViewModel | AvailableMediaViewModel
export type PublicMediaView = MediaViewModel
export type MissingPublicMediaView = MissingMediaViewModel
export type AvailablePublicMediaView = AvailableMediaViewModel
