import 'h3'
import type { DatabaseContext } from '../../db/context'
import type { ActiveSession } from '../services/auth/session-service'
import type { TranslationBatchReader } from '../services/i18n/translation-reader'
import type { AuthRuntime } from '../utils/auth-runtime'
import type { CacheRuntime } from '../utils/cache-runtime'
import type { MediaRuntime } from '../utils/media-runtime'
import type { PublicRuntime } from '../utils/public-runtime'

declare module 'h3' {
  interface H3EventContext {
    requestId: string
    databaseContext?: DatabaseContext
    authRuntime?: AuthRuntime
    authSessionPromise?: Promise<ActiveSession | null>
    authSession?: ActiveSession
    cacheRuntime?: CacheRuntime
    mediaRuntime?: MediaRuntime
    translationReader?: TranslationBatchReader
    publicRuntime?: PublicRuntime
    cloudflare?: {
      env?: Record<string, unknown>
      context?: { waitUntil?: (task: Promise<unknown>) => void }
    }
  }
}

export {}
