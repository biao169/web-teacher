-- 后台完整性与高频查询约束
-- 根据现有业务表增加唯一性和管理查询索引。

DELETE FROM auth_permissions WHERE id NOT IN (SELECT MAX(id) FROM auth_permissions GROUP BY role_uid, module);
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_permissions_role_module ON auth_permissions(role_uid, module);

CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_users_username_nocase ON auth_users(username COLLATE NOCASE);

UPDATE site_settings SET is_active = 0 WHERE is_active = 1 AND id <> (SELECT id FROM site_settings WHERE is_active = 1 ORDER BY updated_at DESC, id DESC LIMIT 1);
CREATE UNIQUE INDEX IF NOT EXISTS ux_site_settings_single_active ON site_settings(is_active) WHERE is_active = 1;

CREATE INDEX IF NOT EXISTS idx_media_assets_admin_status_updated ON media_assets(status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_translation_cache_admin_status_updated ON translation_cache(status, is_current, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active_expiry ON auth_sessions(user_uid, revoked_at, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_module_created ON operation_logs(module, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status_created ON messages(status, created_at DESC, id DESC);


CREATE TABLE IF NOT EXISTS admin_mutation_guards (
  uid TEXT PRIMARY KEY,
  expected_changes INTEGER NOT NULL,
  actual_changes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (expected_changes >= 0),
  CHECK (actual_changes = expected_changes)
);
CREATE INDEX IF NOT EXISTS idx_admin_mutation_guards_created
  ON admin_mutation_guards(created_at);
