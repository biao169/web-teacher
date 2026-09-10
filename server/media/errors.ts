export type MediaErrorCode =
  | 'MEDIA_INPUT'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_FORBIDDEN'
  | 'MEDIA_CONFLICT'
  | 'MEDIA_PRECONDITION'
  | 'MEDIA_RANGE'
  | 'MEDIA_LIMIT'
  | 'MEDIA_PROTOCOL'
  | 'MEDIA_STORAGE'
  | 'MEDIA_CONFIG'

export class MediaError extends Error {
  constructor(readonly code: MediaErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MediaError'
  }
}

export function mediaStorageError(error: unknown): MediaError {
  if (error instanceof MediaError) return error
  return new MediaError('MEDIA_STORAGE', 'Media storage operation failed', error instanceof Error ? { cause: error } : undefined)
}
