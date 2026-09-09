import { SecurityError } from '../../security/errors'
import { canonicalNow } from '../../security/identity'
import { AuthTokenService } from '../../security/tokens'
import type { AuthStore, ThrottleEntry, ThrottleState } from './auth-store'

export interface LoginThrottlePolicy {
  windowSeconds: number
  blockSeconds: number
  accountFailures: number
  networkFailures: number
  retentionSeconds?: number
}

export interface LoginThrottleKeys {
  account: string
  network: string | null
}

export interface LoginThrottleWindow {
  now: Date
  at: string
  resetBefore: string
  blockUntil: string
  expiresAt: string
}

function validPositiveInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

export class LoginThrottleService {
  private readonly clock: () => Date

  constructor(
    private readonly store: AuthStore,
    private readonly tokens: AuthTokenService,
    private readonly policy: LoginThrottlePolicy,
    clock: (() => Date) | undefined = undefined,
  ) {
    this.clock = clock ?? (() => new Date())
    if (!validPositiveInteger(policy.windowSeconds, 60, 86_400)
      || !validPositiveInteger(policy.blockSeconds, 60, 86_400)
      || !validPositiveInteger(policy.accountFailures, 2, 100)
      || !validPositiveInteger(policy.networkFailures, 5, 1000)
      || (policy.retentionSeconds !== undefined && !validPositiveInteger(policy.retentionSeconds, 300, 604_800))) {
      throw new SecurityError('AUTH_CONFIG', 'Invalid login throttle policy')
    }
  }

  async keys(username: string, network: string | null): Promise<LoginThrottleKeys> {
    return {
      account: await this.tokens.throttleKey('account', username),
      network: network ? await this.tokens.throttleKey('network', network) : null,
    }
  }

  window(): LoginThrottleWindow {
    const now = this.clock()
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new SecurityError('AUTH_CONFIG', 'Invalid throttle clock')
    const retention = this.policy.retentionSeconds ?? 86_400
    const blockUntil = new Date(now.getTime() + this.policy.blockSeconds * 1000)
    const expires = new Date(Math.max(now.getTime() + retention * 1000, blockUntil.getTime()))
    return {
      now: new Date(now.getTime()),
      at: canonicalNow(now),
      resetBefore: canonicalNow(new Date(now.getTime() - this.policy.windowSeconds * 1000)),
      blockUntil: canonicalNow(blockUntil),
      expiresAt: canonicalNow(expires),
    }
  }

  retryAfter(states: readonly ThrottleState[], now: Date): number {
    let retry = 0
    for (const state of states) {
      if (!state.blockedUntil) continue
      const remaining = Math.ceil((Date.parse(state.blockedUntil) - now.getTime()) / 1000)
      if (Number.isFinite(remaining)) retry = Math.max(retry, remaining)
    }
    return Math.max(0, retry)
  }

  async recordFailure(keys: LoginThrottleKeys, window: LoginThrottleWindow): Promise<readonly ThrottleState[]> {
    const entries: ThrottleEntry[] = [
      { keyHash: keys.account, scope: 'account', limit: this.policy.accountFailures },
    ]
    if (keys.network) entries.push({ keyHash: keys.network, scope: 'network', limit: this.policy.networkFailures })
    return this.store.recordThrottleFailures(entries, window.at, window.resetBefore, window.blockUntil, window.expiresAt)
  }
}
