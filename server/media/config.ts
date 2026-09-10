import { hasUnpairedSurrogate } from '../../shared/utils/unicode'
import { utf8Length } from '../security/bytes'
import { MediaError } from './errors'

export interface MediaRuntimeConfig {
  grantSecret: string
  publicGrantSeconds: number
  privateGrantSeconds: number
  routeBase: string
  mediaRoot: string
  staticMediaRoot: string
  maxObjectBytes: number
}

function text(value: unknown, fallback: string, name: string): string {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string' || value !== value.trim() || !value || hasUnpairedSurrogate(value)
    || /[\u0000-\u001f\u007f]/u.test(value) || utf8Length(value) > 4096) {
    throw new MediaError('MEDIA_CONFIG', `Invalid ${name}`)
  }
  return value
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number, name: string): number {
  let candidate: number
  if (value === '' || value === null || value === undefined) candidate = fallback
  else if (typeof value === 'number') candidate = value
  else if (typeof value === 'string' && value === value.trim() && /^(?:0|[1-9][0-9]*)$/u.test(value)) candidate = Number(value)
  else throw new MediaError('MEDIA_CONFIG', `Invalid ${name}`)
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) throw new MediaError('MEDIA_CONFIG', `Invalid ${name}`)
  return candidate
}


export function mediaGrantConfigurationIdentity(
  config: Pick<MediaRuntimeConfig, 'grantSecret' | 'publicGrantSeconds' | 'privateGrantSeconds'>,
): string {
  return JSON.stringify([config.grantSecret, config.publicGrantSeconds, config.privateGrantSeconds])
}

export function parseMediaConfig(raw: Record<string, unknown>): MediaRuntimeConfig {
  const grantSecret = typeof raw.mediaGrantSecret === 'string' ? raw.mediaGrantSecret : ''
  if (utf8Length(grantSecret) < 32 || utf8Length(grantSecret) > 4096) throw new MediaError('MEDIA_CONFIG', 'NUXT_MEDIA_GRANT_SECRET must contain at least 32 UTF-8 bytes')
  const routeBase = text(raw.mediaRouteBase, '/media', 'media route base')
  if (!/^\/[a-z0-9/_-]*[a-z0-9_-]$/u.test(routeBase)) throw new MediaError('MEDIA_CONFIG', 'Invalid media route base')
  return {
    grantSecret,
    publicGrantSeconds: integer(raw.mediaPublicGrantSeconds, 300, 30, 3600, 'public media grant lifetime'),
    privateGrantSeconds: integer(raw.mediaPrivateGrantSeconds, 120, 30, 3600, 'private media grant lifetime'),
    routeBase,
    mediaRoot: text(raw.mediaRoot, 'media', 'media root'),
    staticMediaRoot: text(raw.staticMediaRoot, 'public', 'static media root'),
    maxObjectBytes: integer(raw.mediaMaxObjectBytes, 100 * 1024 * 1024, 1, 1024 * 1024 * 1024, 'media object size limit'),
  }
}
