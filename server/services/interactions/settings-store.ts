import type { DatabaseAdapter, RawRow } from '../../../db/contracts'
import { read } from '../../../db/query'
import { PublicInteractionError } from '../../interactions/errors'

export interface InteractionSettings {
  allowPublicRegistration: boolean
  allowAnonymousMessages: boolean
  notifyEmail: string | null
  updatedAt: string | null
}

function flag(value: unknown, name: string): boolean {
  if (value !== 0 && value !== 1) throw new PublicInteractionError('INTERACTION_PROTOCOL', `Invalid global setting ${name}`)
  return value === 1
}

function optionalText(value: unknown, name: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw new PublicInteractionError('INTERACTION_PROTOCOL', `Invalid global setting ${name}`)
  const normalized = value.normalize('NFC').trim()
  return normalized || null
}

function parse(row: RawRow | undefined): InteractionSettings {
  if (!row) return Object.freeze({
    allowPublicRegistration: false,
    allowAnonymousMessages: false,
    notifyEmail: null,
    updatedAt: null,
  })
  const updatedAt = optionalText(row.updated_at, 'updated_at')
  if (!updatedAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(updatedAt) || new Date(updatedAt).toISOString() !== updatedAt) {
    throw new PublicInteractionError('INTERACTION_PROTOCOL', 'Invalid global settings timestamp')
  }
  return Object.freeze({
    allowPublicRegistration: flag(row.allow_public_registration, 'allow_public_registration'),
    allowAnonymousMessages: flag(row.allow_anonymous_messages, 'allow_anonymous_messages'),
    notifyEmail: optionalText(row.notify_email, 'notify_email'),
    updatedAt,
  })
}

export class InteractionSettingsStore {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async current(): Promise<InteractionSettings> {
    const result = await this.adapter.execute(read(`SELECT
        allow_public_registration, allow_anonymous_messages, notify_email, updated_at
      FROM global_settings
      ORDER BY updated_at DESC, id DESC
      LIMIT 1`))
    if (result.rows.length > 1) throw new PublicInteractionError('INTERACTION_PROTOCOL', 'Global settings query returned too many rows')
    return parse(result.rows[0])
  }
}
