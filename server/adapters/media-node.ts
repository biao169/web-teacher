import type { H3Event } from 'h3'
import { parse, resolve, sep } from 'node:path'
import type { MediaRuntimeConfig } from '../media/config'
import { LocalMediaStore } from '../media/local-store'
import type { MediaStoreSet } from '../services/media/media-service'

let cached: { signature: string; stores: MediaStoreSet } | undefined

function contains(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

export function resolveNodeMediaRoots(config: Pick<MediaRuntimeConfig, 'mediaRoot' | 'staticMediaRoot' | 'maxObjectBytes'>): {
  mediaRoot: string
  staticRoot: string
  signature: string
} {
  const mediaRoot = resolve(config.mediaRoot)
  const staticRoot = resolve(config.staticMediaRoot)
  const applicationRoot = resolve('.')
  if (mediaRoot === parse(mediaRoot).root || contains(mediaRoot, applicationRoot)) {
    throw new Error('Managed media root must be a dedicated directory outside the application root itself')
  }
  if (contains(mediaRoot, staticRoot) || contains(staticRoot, mediaRoot)) {
    throw new Error('Managed and static media roots must not overlap')
  }
  return { mediaRoot, staticRoot, signature: JSON.stringify([mediaRoot, staticRoot, config.maxObjectBytes]) }
}

export function getPlatformMediaStores(_event: H3Event, config: MediaRuntimeConfig): MediaStoreSet {
  const { mediaRoot, staticRoot, signature } = resolveNodeMediaRoots(config)
  if (cached && cached.signature !== signature) throw new Error('Media storage configuration cannot change within one process')
  cached ??= {
    signature,
    stores: {
      local: new LocalMediaStore(mediaRoot, { maxObjectBytes: config.maxObjectBytes }),
      static: new LocalMediaStore(staticRoot, { kind: 'static', readOnly: true, maxObjectBytes: config.maxObjectBytes }),
    },
  }
  return cached.stores
}
