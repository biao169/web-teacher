import type { DatabaseAdapter, RawRow, SqlCommand } from '../../../db/contracts'
import { write } from '../../../db/query'
import { PublicInteractionError } from '../../interactions/errors'

export type PublicAction = 'registration' | 'contact'
export type PublicActionScope = 'identity' | 'network'

export interface PublicActionThrottleEntry {
  keyHash: string
  action: PublicAction
  scope: PublicActionScope
  limit: number
}

export interface PublicActionThrottleState {
  keyHash: string
  action: PublicAction
  scope: PublicActionScope
  attempts: number
  blockedUntil: string | null
}

function required(row: RawRow, name: string): string | number | null {
  if (!Object.hasOwn(row, name)) throw new PublicInteractionError('INTERACTION_PROTOCOL', `Throttle row is missing ${name}`)
  return row[name]!
}

function text(row: RawRow, name: string): string {
  const value = required(row, name)
  if (typeof value !== 'string') throw new PublicInteractionError('INTERACTION_PROTOCOL', `Throttle field ${name} is invalid`)
  return value
}

function integer(row: RawRow, name: string): number {
  const value = required(row, name)
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new PublicInteractionError('INTERACTION_PROTOCOL', `Throttle field ${name} is invalid`)
  return value
}

function nullableTimestamp(row: RawRow, name: string): string | null {
  const value = required(row, name)
  if (value === null) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || new Date(value).toISOString() !== value) {
    throw new PublicInteractionError('INTERACTION_PROTOCOL', `Throttle field ${name} is invalid`)
  }
  return value
}

function parse(row: RawRow): PublicActionThrottleState {
  const action = text(row, 'action')
  const scope = text(row, 'scope')
  if (action !== 'registration' && action !== 'contact') throw new PublicInteractionError('INTERACTION_PROTOCOL', 'Stored throttle action is invalid')
  if (scope !== 'identity' && scope !== 'network') throw new PublicInteractionError('INTERACTION_PROTOCOL', 'Stored throttle scope is invalid')
  const keyHash = text(row, 'key_hash')
  const attempts = integer(row, 'attempts')
  if (!/^[a-f0-9]{64}$/u.test(keyHash) || attempts < 0 || attempts > 1_000_000) {
    throw new PublicInteractionError('INTERACTION_PROTOCOL', 'Stored throttle value is invalid')
  }
  return Object.freeze({ keyHash, action, scope, attempts, blockedUntil: nullableTimestamp(row, 'blocked_until') })
}

export class PublicActionThrottleStore {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async consume(
    entries: readonly PublicActionThrottleEntry[],
    at: string,
    resetBefore: string,
    blockUntil: string,
    expiresAt: string,
  ): Promise<readonly PublicActionThrottleState[]> {
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 2) {
      throw new PublicInteractionError('INTERACTION_INPUT', 'Invalid public action throttle set')
    }
    const commands: SqlCommand[] = entries.map((entry) => {
      if (!/^[a-f0-9]{64}$/u.test(entry.keyHash)
        || !Number.isSafeInteger(entry.limit) || entry.limit < 1 || entry.limit > 1000) {
        throw new PublicInteractionError('INTERACTION_PROTOCOL', 'Invalid public action throttle input')
      }
      return write(`INSERT INTO public_action_throttles (
          key_hash, action, scope, attempts, window_started_at, blocked_until, updated_at, expires_at
        ) VALUES (?, ?, ?, 1, ?, NULL, ?, ?)
        ON CONFLICT(key_hash) DO UPDATE SET
          attempts = CASE
            WHEN public_action_throttles.blocked_until IS NOT NULL
              AND public_action_throttles.blocked_until > excluded.updated_at
              THEN public_action_throttles.attempts
            WHEN public_action_throttles.window_started_at <= ?
              OR public_action_throttles.expires_at <= excluded.updated_at
              THEN 1
            ELSE min(public_action_throttles.attempts + 1, 1000000)
          END,
          window_started_at = CASE
            WHEN public_action_throttles.blocked_until IS NOT NULL
              AND public_action_throttles.blocked_until > excluded.updated_at
              THEN public_action_throttles.window_started_at
            WHEN public_action_throttles.window_started_at <= ?
              OR public_action_throttles.expires_at <= excluded.updated_at
              THEN excluded.window_started_at
            ELSE public_action_throttles.window_started_at
          END,
          blocked_until = CASE
            WHEN public_action_throttles.blocked_until IS NOT NULL
              AND public_action_throttles.blocked_until > excluded.updated_at
              THEN public_action_throttles.blocked_until
            WHEN public_action_throttles.window_started_at <= ?
              OR public_action_throttles.expires_at <= excluded.updated_at
              THEN NULL
            WHEN public_action_throttles.attempts + 1 > ? THEN ?
            ELSE NULL
          END,
          updated_at = excluded.updated_at,
          expires_at = CASE
            WHEN public_action_throttles.expires_at > excluded.expires_at
              THEN public_action_throttles.expires_at
            ELSE excluded.expires_at
          END
        WHERE public_action_throttles.action = excluded.action
          AND public_action_throttles.scope = excluded.scope
        RETURNING key_hash, action, scope, attempts, blocked_until`, [
        entry.keyHash, entry.action, entry.scope, at, at, expiresAt,
        resetBefore, resetBefore, resetBefore, entry.limit, blockUntil,
      ], true)
    })
    const results = await this.adapter.batch(commands)
    if (results.length !== entries.length) throw new PublicInteractionError('INTERACTION_PROTOCOL', 'Throttle batch result is incomplete')
    return results.map((result) => {
      if (result.rows.length !== 1) throw new PublicInteractionError('INTERACTION_PROTOCOL', 'Throttle state collision or missing result')
      return parse(result.rows[0]!)
    })
  }

  async cleanupExpired(at: string): Promise<number> {
    return (await this.adapter.execute(write('DELETE FROM public_action_throttles WHERE expires_at <= ?', [at]))).changes
  }
}
