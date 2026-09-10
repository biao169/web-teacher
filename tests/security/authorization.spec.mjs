import test from 'node:test'
import assert from 'node:assert/strict'
import { security } from '../helpers/offline-security.mjs'

function principal(overrides = {}) {
  const permissions = security.emptyPermissionRecord()
  permissions.publications = security.permissionFlags({ view: true, create: true, edit: true, delete: false, export: true })
  permissions.auth = security.permissionFlags({ view: true, create: false, edit: true, delete: false, export: false })
  return {
    sessionUid: 'session:test', userUid: 'user:one', username: 'one', displayName: null, email: null,
    roleUid: 'role:editor', roleName: 'Editor', roleLevel: 50, roleIsSystem: false,
    visibilityScopes: new Set(['public', 'authenticated', 'staff', 'owner']),
    permissions: Object.freeze(permissions),
    mustChangePassword: false,
    ...overrides,
  }
}

test('permissions are explicit and default deny', () => {
  const actor = principal()
  assert.equal(security.hasPermission(actor, 'publications', 'view'), true)
  assert.equal(security.hasPermission(actor, 'publications', 'delete'), false)
  assert.equal(security.hasPermission(actor, 'projects', 'view'), false)
  assert.equal(security.hasPermission(null, 'publications', 'view'), false)
  assert.throws(() => security.requirePermission(actor, 'projects', 'view'), error => error.code === 'AUTH_FORBIDDEN')
})

test('must-change-password gate blocks every generic module permission and restricted visibility', () => {
  const actor = principal({ mustChangePassword: true })
  assert.equal(security.hasPermission(actor, 'auth', 'view'), false)
  assert.equal(security.hasPermission(actor, 'auth', 'edit'), false)
  assert.throws(() => security.requirePermission(actor, 'publications', 'view'), error => error.code === 'AUTH_PASSWORD_CHANGE_REQUIRED')
  assert.throws(() => security.requirePermission(actor, 'auth', 'view'), error => error.code === 'AUTH_PASSWORD_CHANGE_REQUIRED')
  assert.throws(() => security.requirePermission(actor, 'auth', 'edit'), error => error.code === 'AUTH_PASSWORD_CHANGE_REQUIRED')
  assert.equal(security.canAccessVisibility({ visibility: 'public', principal: actor }), true)
  assert.equal(security.canAccessVisibility({ visibility: 'authenticated', principal: actor }), false)
  assert.equal(security.canAccessVisibility({ visibility: 'staff', principal: actor }), false)
  assert.equal(security.canAccessVisibility({ visibility: 'owner', principal: actor, ownerUid: actor.userUid }), false)
  assert.deepEqual(security.readableNonOwnerScopes(actor), ['public'])
  assert.deepEqual(security.toSafeUserView(actor).permissions, {})
})

test('role levels constrain role administration and never imply module access', () => {
  const actor = principal()
  assert.equal(security.canManageRole(actor, { uid: 'role:lower', level: 10, isSystem: false }), true)
  assert.equal(security.canManageRole(actor, { uid: 'role:equal', level: 50, isSystem: false }), false)
  assert.equal(security.canManageRole(actor, { uid: 'role:system', level: 10, isSystem: true }), false)
  const noPermission = principal({ roleLevel: 999, permissions: Object.freeze(security.emptyPermissionRecord()) })
  assert.equal(security.canManageRole(noPermission, { uid: 'role:lower', level: 1, isSystem: false }), false)
})

test('visibility evaluates public, authenticated, staff, exact owner and hidden distinctly', () => {
  const actor = principal()
  assert.equal(security.canAccessVisibility({ visibility: 'public', principal: null }), true)
  assert.equal(security.canAccessVisibility({ visibility: 'authenticated', principal: actor }), true)
  assert.equal(security.canAccessVisibility({ visibility: 'staff', principal: actor }), true)
  assert.equal(security.canAccessVisibility({ visibility: 'owner', principal: actor, ownerUid: 'user:one' }), true)
  assert.equal(security.canAccessVisibility({ visibility: 'owner', principal: actor, ownerUid: 'user:two' }), false)
  assert.equal(security.canAccessVisibility({ visibility: 'hidden', principal: actor }), false)
  assert.equal(security.canAccessVisibility({ visibility: 'hidden', principal: principal({ visibilityScopes: new Set(['public', 'hidden']) }) }), true)
})

test('role visibility scopes are an explicit allow-list rather than an inferred hierarchy', () => {
  const publicOnly = principal({ visibilityScopes: new Set(['public']) })
  assert.equal(security.canAccessVisibility({ visibility: 'authenticated', principal: publicOnly }), false)
  assert.equal(security.canAccessVisibility({ visibility: 'staff', principal: publicOnly }), false)
  assert.equal(security.canAccessVisibility({ visibility: 'owner', principal: publicOnly, ownerUid: 'user:one' }), false)
  const hiddenOnly = principal({ visibilityScopes: new Set(['public', 'hidden']) })
  assert.equal(security.canAccessVisibility({ visibility: 'staff', principal: hiddenOnly }), false)
  assert.deepEqual(security.readableNonOwnerScopes(hiddenOnly), ['public', 'hidden'])
})

test('system administrator bootstrap grants every module but keeps protected delete flags false', () => {
  const permissions = security.systemAdministratorPermissions()
  assert.deepEqual(Object.keys(permissions), [...security.AUTH_MODULES])
  assert.equal(permissions.publications.delete, true)
  assert.equal(permissions.operation_logs.delete, false)
  assert.equal(permissions.site_settings.delete, false)
  assert.equal(permissions.auth.delete, false)
})
