-- Normalize permission module identifiers written by the legacy account UI.
-- Authentication treats unknown modules as a protocol error, so existing
-- sessions for affected roles are revoked before the rows are repaired.

UPDATE auth_sessions
SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    revoke_reason = 'security_policy',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE revoked_at IS NULL
  AND user_uid IN (
    SELECT u.uid
    FROM auth_users u
    JOIN auth_permissions p ON p.role_uid = u.role_uid
    WHERE p.module NOT IN (
      'dashboard','site_settings','global_settings','navigation_items','profiles',
      'research_interests','publications','projects','patents','students',
      'student_category_displays','news','courses','messages','media_assets',
      'translation_cache','operation_logs','auth','import_export'
    )
  );

INSERT INTO auth_permissions (
  uid, role_uid, module, can_view, can_create, can_edit, can_delete, can_export,
  sort_order, created_at, updated_at
)
SELECT
  'permission:migrated:' || lower(hex(randomblob(16))), role_uid, 'navigation_items',
  can_view, can_create, can_edit, can_delete, can_export, sort_order, created_at, updated_at
FROM auth_permissions WHERE module = 'navigation'
ON CONFLICT(role_uid, module) DO UPDATE SET
  can_view = MAX(auth_permissions.can_view, excluded.can_view),
  can_create = MAX(auth_permissions.can_create, excluded.can_create),
  can_edit = MAX(auth_permissions.can_edit, excluded.can_edit),
  can_delete = MAX(auth_permissions.can_delete, excluded.can_delete),
  can_export = MAX(auth_permissions.can_export, excluded.can_export),
  updated_at = MAX(auth_permissions.updated_at, excluded.updated_at);

INSERT INTO auth_permissions (
  uid, role_uid, module, can_view, can_create, can_edit, can_delete, can_export,
  sort_order, created_at, updated_at
)
SELECT
  'permission:migrated:' || lower(hex(randomblob(16))), role_uid, 'media_assets',
  can_view, can_create, can_edit, can_delete, can_export, sort_order, created_at, updated_at
FROM auth_permissions WHERE module = 'media'
ON CONFLICT(role_uid, module) DO UPDATE SET
  can_view = MAX(auth_permissions.can_view, excluded.can_view),
  can_create = MAX(auth_permissions.can_create, excluded.can_create),
  can_edit = MAX(auth_permissions.can_edit, excluded.can_edit),
  can_delete = MAX(auth_permissions.can_delete, excluded.can_delete),
  can_export = MAX(auth_permissions.can_export, excluded.can_export),
  updated_at = MAX(auth_permissions.updated_at, excluded.updated_at);

INSERT INTO auth_permissions (
  uid, role_uid, module, can_view, can_create, can_edit, can_delete, can_export,
  sort_order, created_at, updated_at
)
SELECT
  'permission:migrated:' || lower(hex(randomblob(16))), role_uid, 'translation_cache',
  can_view, can_create, can_edit, can_delete, can_export, sort_order, created_at, updated_at
FROM auth_permissions WHERE module = 'translation'
ON CONFLICT(role_uid, module) DO UPDATE SET
  can_view = MAX(auth_permissions.can_view, excluded.can_view),
  can_create = MAX(auth_permissions.can_create, excluded.can_create),
  can_edit = MAX(auth_permissions.can_edit, excluded.can_edit),
  can_delete = MAX(auth_permissions.can_delete, excluded.can_delete),
  can_export = MAX(auth_permissions.can_export, excluded.can_export),
  updated_at = MAX(auth_permissions.updated_at, excluded.updated_at);

DELETE FROM auth_permissions
WHERE module NOT IN (
  'dashboard','site_settings','global_settings','navigation_items','profiles',
  'research_interests','publications','projects','patents','students',
  'student_category_displays','news','courses','messages','media_assets',
  'translation_cache','operation_logs','auth','import_export'
);
