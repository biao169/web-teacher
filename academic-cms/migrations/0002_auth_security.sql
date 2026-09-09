-- Server-side authentication state. Transaction ownership belongs to the migration runner.

CREATE TABLE "auth_bootstrap_state" (
  "id" INTEGER PRIMARY KEY NOT NULL,
  "completed_at" TEXT NOT NULL,
  "user_uid" TEXT NOT NULL,
  CONSTRAINT "ck_auth_bootstrap_state_singleton" CHECK ("id" = 1),
  CONSTRAINT "ck_auth_bootstrap_state_completed_at" CHECK (length("completed_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "completed_at", '+0 seconds') = "completed_at", 0)),
  CONSTRAINT "ck_auth_bootstrap_state_user_uid" CHECK (length(trim("user_uid")) > 0 AND length("user_uid") <= 128)
);

CREATE TABLE "auth_sessions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "user_uid" TEXT NOT NULL REFERENCES "auth_users"("uid") ON UPDATE RESTRICT ON DELETE CASCADE,
  "token_hash" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "last_seen_at" TEXT NOT NULL,
  "idle_expires_at" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "revoked_at" TEXT,
  "revoke_reason" TEXT,
  "user_agent_hash" TEXT,
  CONSTRAINT "ck_auth_sessions_uid" CHECK (length(trim("uid")) > 0 AND length("uid") <= 128),
  CONSTRAINT "ck_auth_sessions_token_hash" CHECK (length("token_hash") = 64 AND "token_hash" NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_auth_sessions_created_at" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_auth_sessions_updated_at" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_auth_sessions_last_seen_at" CHECK (length("last_seen_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "last_seen_at", '+0 seconds') = "last_seen_at", 0)),
  CONSTRAINT "ck_auth_sessions_idle_expires_at" CHECK (length("idle_expires_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "idle_expires_at", '+0 seconds') = "idle_expires_at", 0)),
  CONSTRAINT "ck_auth_sessions_expires_at" CHECK (length("expires_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "expires_at", '+0 seconds') = "expires_at", 0)),
  CONSTRAINT "ck_auth_sessions_revoked_at" CHECK ("revoked_at" IS NULL OR (length("revoked_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "revoked_at", '+0 seconds') = "revoked_at", 0))),
  CONSTRAINT "ck_auth_sessions_revoke_reason" CHECK ("revoke_reason" IS NULL OR "revoke_reason" IN ('logout', 'expired', 'rotated', 'user_disabled', 'role_disabled', 'password_changed', 'admin_revoked', 'security_policy')),
  CONSTRAINT "ck_auth_sessions_revocation_pair" CHECK (("revoked_at" IS NULL) = ("revoke_reason" IS NULL)),
  CONSTRAINT "ck_auth_sessions_user_agent_hash" CHECK ("user_agent_hash" IS NULL OR (length("user_agent_hash") = 64 AND "user_agent_hash" NOT GLOB '*[^0-9a-f]*')),
  CONSTRAINT "ck_auth_sessions_time_order" CHECK (
    "updated_at" >= "created_at" AND
    "last_seen_at" >= "created_at" AND
    "idle_expires_at" > "last_seen_at" AND
    "idle_expires_at" <= "expires_at" AND
    "expires_at" > "created_at" AND
    ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
  )
);

CREATE UNIQUE INDEX "idx_auth_sessions_token_hash" ON "auth_sessions" ("token_hash");
CREATE INDEX "idx_auth_sessions_user_active" ON "auth_sessions" ("user_uid", "revoked_at", "created_at", "id");
CREATE INDEX "idx_auth_sessions_expiry" ON "auth_sessions" ("expires_at", "idle_expires_at", "id");
CREATE INDEX "idx_auth_sessions_revoked" ON "auth_sessions" ("revoked_at", "id");

CREATE TABLE "auth_login_throttles" (
  "key_hash" TEXT PRIMARY KEY NOT NULL,
  "scope" TEXT NOT NULL,
  "failures" INTEGER NOT NULL DEFAULT 0,
  "window_started_at" TEXT NOT NULL,
  "blocked_until" TEXT,
  "updated_at" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  CONSTRAINT "ck_auth_login_throttles_key_hash" CHECK (length("key_hash") = 64 AND "key_hash" NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_auth_login_throttles_scope" CHECK ("scope" IN ('account', 'network')),
  CONSTRAINT "ck_auth_login_throttles_failures" CHECK (typeof("failures") = 'integer' AND "failures" BETWEEN 0 AND 1000000),
  CONSTRAINT "ck_auth_login_throttles_window_started_at" CHECK (length("window_started_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "window_started_at", '+0 seconds') = "window_started_at", 0)),
  CONSTRAINT "ck_auth_login_throttles_blocked_until" CHECK ("blocked_until" IS NULL OR (length("blocked_until") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "blocked_until", '+0 seconds') = "blocked_until", 0))),
  CONSTRAINT "ck_auth_login_throttles_updated_at" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_auth_login_throttles_expires_at" CHECK (length("expires_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "expires_at", '+0 seconds') = "expires_at", 0)),
  CONSTRAINT "ck_auth_login_throttles_time_order" CHECK (
    "updated_at" >= "window_started_at" AND
    "expires_at" >= "updated_at" AND
    ("blocked_until" IS NULL OR ("blocked_until" >= "updated_at" AND "expires_at" >= "blocked_until"))
  )
);

CREATE INDEX "idx_auth_login_throttles_expiry" ON "auth_login_throttles" ("expires_at", "key_hash");
