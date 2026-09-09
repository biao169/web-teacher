import type { AuthTokenService } from '../../security/tokens'
import { canonicalNow } from '../../security/identity'
import { PublicInteractionError } from '../../interactions/errors'
import type { PublicAction, PublicActionThrottleEntry, PublicActionThrottleStore } from './action-throttle-store'

export interface PublicActionThrottlePolicy {
  windowSeconds: number
  blockSeconds: number
  identityLimit: number
  networkLimit: number
  retentionSeconds?: number
}

export interface ConsumePublicActionInput {
  action: PublicAction
  identity: string
  network: string | null
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new PublicInteractionError('INTERACTION_PROTOCOL', `Invalid ${name}`)
  }
  return value
}

export class PublicActionThrottleService {
  private readonly clock: () => Date

  constructor(
    private readonly store: PublicActionThrottleStore,
    private readonly tokens: AuthTokenService,
    private readonly policy: PublicActionThrottlePolicy,
    clock?: () => Date,
  ) {
    this.clock = clock ?? (() => new Date())
    boundedInteger(policy.windowSeconds, 60, 86_400, 'public action window')
    boundedInteger(policy.blockSeconds, 60, 86_400, 'public action block duration')
    boundedInteger(policy.identityLimit, 1, 1000, 'public action identity limit')
    boundedInteger(policy.networkLimit, 1, 1000, 'public action network limit')
    if (policy.retentionSeconds !== undefined) boundedInteger(policy.retentionSeconds, 300, 604_800, 'public action retention')
  }

  async consume(input: ConsumePublicActionInput): Promise<void> {
    const now = this.clock()
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PublicInteractionError('INTERACTION_PROTOCOL', 'Public action clock is invalid')
    }
    const identity = input.identity.normalize('NFC').trim()
    if (!identity || new TextEncoder().encode(identity).byteLength > 512) {
      throw new PublicInteractionError('INTERACTION_INPUT', 'Public action identity is invalid')
    }
    const entries: PublicActionThrottleEntry[] = [{
      keyHash: await this.tokens.actionThrottleKey(input.action, 'identity', identity),
      action: input.action,
      scope: 'identity',
      limit: this.policy.identityLimit,
    }]
    if (input.network) {
      entries.push({
        keyHash: await this.tokens.actionThrottleKey(input.action, 'network', input.network),
        action: input.action,
        scope: 'network',
        limit: this.policy.networkLimit,
      })
    }
    const at = canonicalNow(now)
    const resetBefore = canonicalNow(new Date(now.getTime() - this.policy.windowSeconds * 1000))
    const blockUntil = canonicalNow(new Date(now.getTime() + this.policy.blockSeconds * 1000))
    const retentionSeconds = this.policy.retentionSeconds ?? 86_400
    const expiresAt = canonicalNow(new Date(Math.max(
      now.getTime() + retentionSeconds * 1000,
      Date.parse(blockUntil),
    )))
    const states = await this.store.consume(entries, at, resetBefore, blockUntil, expiresAt)
    let retryAfter = 0
    for (const state of states) {
      if (!state.blockedUntil) continue
      retryAfter = Math.max(retryAfter, Math.ceil((Date.parse(state.blockedUntil) - now.getTime()) / 1000))
    }
    if (retryAfter > 0) {
      throw new PublicInteractionError('INTERACTION_THROTTLED', 'Public action throttle is active', {
        retryAfterSeconds: retryAfter,
      })
    }
  }
}
