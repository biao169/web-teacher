-- Stage 6 public registration/contact throttling and development seed marker.
-- Transaction ownership belongs to the migration runner.

CREATE TABLE "public_action_throttles" (
  "key_hash" TEXT PRIMARY KEY NOT NULL,
  "action" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "window_started_at" TEXT NOT NULL,
  "blocked_until" TEXT,
  "updated_at" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  CONSTRAINT "ck_public_action_throttles_key_hash" CHECK (length("key_hash") = 64 AND "key_hash" NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_public_action_throttles_action" CHECK ("action" IN ('registration', 'contact')),
  CONSTRAINT "ck_public_action_throttles_scope" CHECK ("scope" IN ('identity', 'network')),
  CONSTRAINT "ck_public_action_throttles_attempts" CHECK (typeof("attempts") = 'integer' AND "attempts" BETWEEN 0 AND 1000000),
  CONSTRAINT "ck_public_action_throttles_window_started_at" CHECK (length("window_started_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "window_started_at", '+0 seconds') = "window_started_at", 0)),
  CONSTRAINT "ck_public_action_throttles_blocked_until" CHECK ("blocked_until" IS NULL OR (length("blocked_until") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "blocked_until", '+0 seconds') = "blocked_until", 0))),
  CONSTRAINT "ck_public_action_throttles_updated_at" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_public_action_throttles_expires_at" CHECK (length("expires_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "expires_at", '+0 seconds') = "expires_at", 0)),
  CONSTRAINT "ck_public_action_throttles_time_order" CHECK (
    "updated_at" >= "window_started_at" AND
    "expires_at" >= "updated_at" AND
    ("blocked_until" IS NULL OR ("blocked_until" >= "updated_at" AND "expires_at" >= "blocked_until"))
  )
) STRICT;

CREATE INDEX "idx_public_action_throttles_expiry"
  ON "public_action_throttles" ("expires_at", "key_hash");
CREATE INDEX "idx_public_action_throttles_action_scope"
  ON "public_action_throttles" ("action", "scope", "updated_at");

-- This marker makes the sample dataset atomic, repeatable and impossible to
-- mistake for production content. Its singleton shape is intentional.
CREATE TABLE "demo_seed_state" (
  "id" INTEGER PRIMARY KEY NOT NULL,
  "dataset_version" TEXT NOT NULL,
  "seeded_at" TEXT NOT NULL,
  "seed_digest" TEXT NOT NULL,
  CONSTRAINT "ck_demo_seed_state_singleton" CHECK ("id" = 1),
  CONSTRAINT "ck_demo_seed_state_dataset_version" CHECK (length(trim("dataset_version")) BETWEEN 1 AND 64),
  CONSTRAINT "ck_demo_seed_state_seeded_at" CHECK (length("seeded_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "seeded_at", '+0 seconds') = "seeded_at", 0)),
  CONSTRAINT "ck_demo_seed_state_seed_digest" CHECK (length("seed_digest") = 64 AND "seed_digest" NOT GLOB '*[^0-9a-f]*')
) STRICT;

CREATE INDEX "idx_global_settings_updated"
  ON "global_settings" ("updated_at" DESC, "id" DESC);
