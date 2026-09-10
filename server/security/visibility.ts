import { isVisibilityScope, VISIBILITY_SCOPES, type VisibilityScope } from '../../shared/enums/auth'
import type { AuthenticatedPrincipal } from './permissions'

export interface VisibilityDecisionInput {
  visibility: VisibilityScope
  principal: AuthenticatedPrincipal | null
  ownerUid?: string | null
}

/** Hidden is an administrator scope. Owner requires an exact user UID match. */
export function canAccessVisibility({ visibility, principal, ownerUid = null }: VisibilityDecisionInput): boolean {
  if (!isVisibilityScope(visibility)) return false
  if (visibility === 'public') return true
  if (!principal || principal.mustChangePassword) return false
  if (!principal.visibilityScopes.has(visibility)) return false
  if (visibility === 'owner') return ownerUid !== null && ownerUid === principal.userUid
  return true
}

/** Database-safe non-owner scopes. Owner rows still need an explicit owner UID predicate. */
export function readableNonOwnerScopes(principal: AuthenticatedPrincipal | null): readonly VisibilityScope[] {
  if (!principal || principal.mustChangePassword) return ['public']
  return VISIBILITY_SCOPES.filter(scope => scope !== 'owner' && (scope === 'public' || principal.visibilityScopes.has(scope)))
}

export function filterByVisibility<T>(
  rows: readonly T[],
  principal: AuthenticatedPrincipal | null,
  visibilityOf: (row: T) => VisibilityScope,
  ownerOf?: (row: T) => string | null,
): T[] {
  return rows.filter(row => canAccessVisibility({
    visibility: visibilityOf(row),
    principal,
    ownerUid: ownerOf?.(row) ?? null,
  }))
}
