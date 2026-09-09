import { useRuntimeConfig } from '#imports'
import { getPlatformMediaStores } from '#media-platform'
import type { H3Event } from 'h3'
import { mediaGrantConfigurationIdentity, parseMediaConfig, type MediaRuntimeConfig } from '../media/config'
import { MediaError } from '../media/errors'
import { MediaGrantService } from '../media/grants'
import { MediaCatalogStore } from '../services/media/media-catalog-store'
import { MediaService } from '../services/media/media-service'
import { useDatabase } from './database'

export interface MediaRuntime {
  config: MediaRuntimeConfig
  service: MediaService
}

let cachedGrantSignature: string | undefined
let cachedGrantService: MediaGrantService | undefined

function grantService(config: MediaRuntimeConfig): MediaGrantService {
  const signature = mediaGrantConfigurationIdentity(config)
  if (cachedGrantService) {
    if (cachedGrantSignature !== signature) throw new MediaError('MEDIA_CONFIG', 'Media grant configuration cannot change within one process')
    return cachedGrantService
  }
  cachedGrantSignature = signature
  cachedGrantService = new MediaGrantService(config.grantSecret, {
    publicSeconds: config.publicGrantSeconds,
    privateSeconds: config.privateGrantSeconds,
  })
  return cachedGrantService
}

export function useMediaRuntime(event: H3Event): MediaRuntime {
  if (event.context.mediaRuntime) return event.context.mediaRuntime
  const config = parseMediaConfig(useRuntimeConfig(event) as unknown as Record<string, unknown>)
  const service = new MediaService(
    new MediaCatalogStore(useDatabase(event).adapter),
    getPlatformMediaStores(event, config),
    grantService(config),
    { routeBase: config.routeBase },
  )
  const runtime = { config, service }
  event.context.mediaRuntime = runtime
  return runtime
}
