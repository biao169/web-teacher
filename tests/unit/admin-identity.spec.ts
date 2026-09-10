import { describe, expect, it } from 'vitest'
import {
  ADMIN_IDENTITY_RESOURCES,
  adminDuplicateRule,
  adminIdentityEditPath,
  normalizeAdminUid,
  suggestedAdminUid,
} from '../../shared/admin/identity'

describe('admin stable identities', () => {
  it('generates a valid, resource-specific UID for every supported create flow', () => {
    for (const resource of Object.keys(ADMIN_IDENTITY_RESOURCES) as (keyof typeof ADMIN_IDENTITY_RESOURCES)[]) {
      const uid = suggestedAdminUid(resource, '550e8400-e29b-41d4-a716-446655440000')
      expect(normalizeAdminUid(uid)).toBe(uid)
      expect(uid.startsWith(`${ADMIN_IDENTITY_RESOURCES[resource].prefix}:`)).toBe(true)
      expect(uid.length).toBeLessThanOrEqual(128)
    }
  })

  it('rejects unsafe or non-portable identifiers', () => {
    for (const uid of ['', 'uid value', '中文标识', 'uid/child', 'uid?query', `uid:${'x'.repeat(128)}`]) {
      expect(() => normalizeAdminUid(uid)).toThrow('INVALID_UID')
    }
  })

  it('marks database constraints as hard and editorial similarities as warnings', () => {
    expect(adminDuplicateRule('student_category_displays', 'key')?.mode).toBe('hard')
    expect(adminDuplicateRule('news', 'slug')?.mode).toBe('hard')
    expect(adminDuplicateRule('auth-users', 'username')?.mode).toBe('hard')
    expect(adminDuplicateRule('publications', 'doi')?.mode).toBe('warning')
    expect(adminDuplicateRule('projects', 'name')?.mode).toBe('warning')
    expect(adminDuplicateRule('courses', 'unknown')).toBeNull()
  })

  it('builds direct new-tab editor locations without losing UID characters', () => {
    expect(adminIdentityEditPath('publications', 'publications:item.1')).toBe('/admin/publications/publications%3Aitem.1')
    expect(adminIdentityEditPath('news', 'news:item.1')).toBe('/admin/news?edit=news%3Aitem.1')
    expect(adminIdentityEditPath('auth-roles', 'role:item.1')).toBe('/admin/auth?tab=roles&edit=role%3Aitem.1')
  })
})
