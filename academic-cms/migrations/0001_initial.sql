-- Consolidated initial migration for Academic CMS.

-- Source migrations: 0001_initial.sql, 0002_auth_security.sql, 0003_media_i18n_cache.sql, 0004_public_content_indexes.sql, 0005_public_interactions_and_demo_seed.sql, 0006_admin_shell.sql, 0007_admin_content_management.sql, 0008_complete_admin_integrity.sql, 0009_auth_management_integrity.sql, 0010_profile_link_values.sql, 0011_media_full_scan.sql

-- Transaction ownership belongs to scripts/db/migrations.mjs.



-- ============================================================================
-- Source: 0001_initial.sql
-- ============================================================================

-- Initial application schema. Immutable after first deployment.
-- Shared by Cloudflare D1 and SQLite; transactions are owned by the migration runner.

CREATE TABLE "media_assets" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "object_key" TEXT NOT NULL UNIQUE,
  "title" TEXT,
  "category" TEXT,
  "mime_type" TEXT,
  "size" INTEGER NOT NULL DEFAULT 0,
  "storage_kind" TEXT NOT NULL DEFAULT 'local',
  "status" TEXT NOT NULL DEFAULT 'active',
  "checksum" TEXT,
  CONSTRAINT "ck_media_assets_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_media_assets_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_media_assets_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_media_assets_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_media_assets_object_key_0" CHECK (length(trim("object_key")) > 0),
  CONSTRAINT "ck_media_assets_size_0" CHECK (typeof("size") = 'integer' AND "size" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_media_assets_size_1" CHECK ("size" >= 0),
  CONSTRAINT "ck_media_assets_storage_kind_0" CHECK ("storage_kind" IN ('static', 'local', 'r2', 'external')),
  CONSTRAINT "ck_media_assets_status_0" CHECK ("status" IN ('active', 'trash'))
);

CREATE INDEX "idx_media_assets_status_category_mime" ON "media_assets" ("status", "category", "mime_type", "id");

CREATE TABLE "auth_roles" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "name" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT,
  "visibility_scopes" TEXT NOT NULL DEFAULT '["public"]',
  "is_system" INTEGER NOT NULL DEFAULT 0,
  "is_active" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ck_auth_roles_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_auth_roles_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_auth_roles_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_auth_roles_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_auth_roles_name_0" CHECK (length(trim("name")) > 0),
  CONSTRAINT "ck_auth_roles_level_0" CHECK (typeof("level") = 'integer' AND "level" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_auth_roles_level_1" CHECK ("level" >= 0),
  CONSTRAINT "ck_auth_roles_visibility_scopes_0" CHECK (CASE WHEN json_valid("visibility_scopes") THEN json_type("visibility_scopes") = 'array' ELSE 0 END),
  CONSTRAINT "ck_auth_roles_is_system_0" CHECK ("is_system" IN (0, 1)),
  CONSTRAINT "ck_auth_roles_is_active_0" CHECK ("is_active" IN (0, 1)),
  CONSTRAINT "ck_auth_roles_sort_order_0" CHECK (typeof("sort_order") = 'integer' AND "sort_order" BETWEEN -9007199254740991 AND 9007199254740991)
);


CREATE TABLE "auth_users" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "username" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "display_name" TEXT,
  "email" TEXT,
  "role_uid" TEXT NOT NULL REFERENCES "auth_roles"("uid") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'disabled',
  "must_change_password" INTEGER NOT NULL DEFAULT 0,
  "last_login_at" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'hidden',
  CONSTRAINT "ck_auth_users_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_auth_users_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_auth_users_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_auth_users_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_auth_users_username_0" CHECK (length(trim("username")) > 0),
  CONSTRAINT "ck_auth_users_username_1" CHECK (length("username") <= 150),
  CONSTRAINT "ck_auth_users_password_hash_0" CHECK (length(trim("password_hash")) > 0),
  CONSTRAINT "ck_auth_users_role_uid_0" CHECK (length(trim("role_uid")) > 0),
  CONSTRAINT "ck_auth_users_status_0" CHECK ("status" IN ('active', 'disabled', 'locked')),
  CONSTRAINT "ck_auth_users_must_change_password_0" CHECK ("must_change_password" IN (0, 1)),
  CONSTRAINT "ck_auth_users_last_login_at_0" CHECK ("last_login_at" IS NULL OR (length("last_login_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "last_login_at", '+0 seconds') = "last_login_at", 0))),
  CONSTRAINT "ck_auth_users_visibility_0" CHECK ("visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden'))
);

CREATE INDEX "idx_auth_users_role_uid" ON "auth_users" ("role_uid");
CREATE UNIQUE INDEX "idx_auth_users_username_nocase" ON "auth_users" ("username" COLLATE NOCASE);

CREATE TABLE "auth_permissions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "role_uid" TEXT NOT NULL REFERENCES "auth_roles"("uid") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "module" TEXT NOT NULL,
  "can_view" INTEGER NOT NULL DEFAULT 0,
  "can_create" INTEGER NOT NULL DEFAULT 0,
  "can_edit" INTEGER NOT NULL DEFAULT 0,
  "can_delete" INTEGER NOT NULL DEFAULT 0,
  "can_export" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ck_auth_permissions_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_auth_permissions_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_auth_permissions_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_auth_permissions_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_auth_permissions_role_uid_0" CHECK (length(trim("role_uid")) > 0),
  CONSTRAINT "ck_auth_permissions_module_0" CHECK (length(trim("module")) > 0),
  CONSTRAINT "ck_auth_permissions_can_view_0" CHECK ("can_view" IN (0, 1)),
  CONSTRAINT "ck_auth_permissions_can_create_0" CHECK ("can_create" IN (0, 1)),
  CONSTRAINT "ck_auth_permissions_can_edit_0" CHECK ("can_edit" IN (0, 1)),
  CONSTRAINT "ck_auth_permissions_can_delete_0" CHECK ("can_delete" IN (0, 1)),
  CONSTRAINT "ck_auth_permissions_can_export_0" CHECK ("can_export" IN (0, 1)),
  CONSTRAINT "ck_auth_permissions_sort_order_0" CHECK (typeof("sort_order") = 'integer' AND "sort_order" BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX "idx_auth_permissions_role_uid" ON "auth_permissions" ("role_uid");
CREATE UNIQUE INDEX "idx_auth_permissions_role_module" ON "auth_permissions" ("role_uid", "module");

CREATE TABLE "profiles" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "name" TEXT NOT NULL,
  "name_en" TEXT,
  "role" TEXT,
  "title" TEXT,
  "organization" TEXT,
  "lab" TEXT,
  "avatar_key" TEXT REFERENCES "media_assets"("object_key") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "email" TEXT,
  "phone" TEXT,
  "office" TEXT,
  "bio" TEXT,
  "bio_en" TEXT,
  "education" TEXT,
  "experience" TEXT,
  "recruiting" TEXT,
  "orcid" TEXT,
  "personal_homepage" TEXT,
  "google_scholar" TEXT,
  "dblp" TEXT,
  "github" TEXT,
  "cnki" TEXT,
  "contact_visibility" TEXT NOT NULL DEFAULT 'hidden',
  "visibility" TEXT NOT NULL DEFAULT 'hidden',
  "is_active" INTEGER NOT NULL DEFAULT 0,
  "is_featured" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ck_profiles_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_profiles_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_profiles_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_profiles_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_profiles_name_0" CHECK (length(trim("name")) > 0),
  CONSTRAINT "ck_profiles_contact_visibility_0" CHECK ("contact_visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_profiles_visibility_0" CHECK ("visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_profiles_is_active_0" CHECK ("is_active" IN (0, 1)),
  CONSTRAINT "ck_profiles_is_featured_0" CHECK ("is_featured" IN (0, 1)),
  CONSTRAINT "ck_profiles_sort_order_0" CHECK (typeof("sort_order") = 'integer' AND "sort_order" BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX "idx_profiles_visibility_sort" ON "profiles" ("visibility", "sort_order", "id");
CREATE INDEX "idx_profiles_featured" ON "profiles" ("visibility", "is_featured", "sort_order", "id");
CREATE INDEX "idx_profiles_avatar_key" ON "profiles" ("avatar_key");

CREATE TABLE "site_settings" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "is_active" INTEGER NOT NULL DEFAULT 0,
  "site_name" TEXT NOT NULL,
  "site_name_en" TEXT,
  "hero_title" TEXT,
  "hero_subtitle" TEXT,
  "logo_key" TEXT REFERENCES "media_assets"("object_key") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "favicon_key" TEXT REFERENCES "media_assets"("object_key") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "og_image_key" TEXT REFERENCES "media_assets"("object_key") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "seo_title" TEXT,
  "seo_description" TEXT,
  "seo_keywords" TEXT,
  "footer_text" TEXT,
  "homepage_profile_uid" TEXT REFERENCES "profiles"("uid") ON UPDATE RESTRICT ON DELETE SET NULL,
  "homepage_publication_limit" INTEGER NOT NULL DEFAULT 6,
  "homepage_news_limit" INTEGER NOT NULL DEFAULT 5,
  CONSTRAINT "ck_site_settings_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_site_settings_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_site_settings_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_site_settings_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_site_settings_is_active_0" CHECK ("is_active" IN (0, 1)),
  CONSTRAINT "ck_site_settings_site_name_0" CHECK (length(trim("site_name")) > 0),
  CONSTRAINT "ck_site_settings_homepage_publication_limit_0" CHECK (typeof("homepage_publication_limit") = 'integer' AND "homepage_publication_limit" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_site_settings_homepage_publication_limit_1" CHECK ("homepage_publication_limit" >= 0),
  CONSTRAINT "ck_site_settings_homepage_news_limit_0" CHECK (typeof("homepage_news_limit") = 'integer' AND "homepage_news_limit" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_site_settings_homepage_news_limit_1" CHECK ("homepage_news_limit" >= 0)
);

CREATE INDEX "idx_site_settings_logo_key" ON "site_settings" ("logo_key");
CREATE INDEX "idx_site_settings_favicon_key" ON "site_settings" ("favicon_key");
CREATE INDEX "idx_site_settings_og_image_key" ON "site_settings" ("og_image_key");
CREATE INDEX "idx_site_settings_homepage_profile_uid" ON "site_settings" ("homepage_profile_uid");
CREATE UNIQUE INDEX "idx_site_settings_one_active" ON "site_settings" ("is_active") WHERE "is_active" = 1;

CREATE TABLE "global_settings" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "allow_public_registration" INTEGER NOT NULL DEFAULT 0,
  "allow_anonymous_messages" INTEGER NOT NULL DEFAULT 0,
  "upload_max_size_mb" INTEGER NOT NULL DEFAULT 20,
  "upload_allowed_extensions" TEXT NOT NULL DEFAULT '["jpg","jpeg","png","webp","pdf"]',
  "media_trash_retention_days" INTEGER NOT NULL DEFAULT 30,
  "news_pdf_engine" TEXT,
  "news_pdf_allow_download" INTEGER NOT NULL DEFAULT 0,
  "news_pdf_watermark" TEXT,
  "translation_provider" TEXT,
  "translation_providers" TEXT NOT NULL DEFAULT '[]',
  "libretranslate_url" TEXT,
  "libretranslate_api_key" TEXT,
  "deepl_api_key" TEXT,
  "google_translate_api_key" TEXT,
  "microsoft_translator_key" TEXT,
  "microsoft_translator_region" TEXT,
  "microsoft_translator_endpoint" TEXT,
  "mymemory_email" TEXT,
  "translation_batch_size" INTEGER NOT NULL DEFAULT 10,
  "translation_worker_count" INTEGER NOT NULL DEFAULT 2,
  "translation_timeout_seconds" INTEGER NOT NULL DEFAULT 15,
  "translation_job_state" TEXT NOT NULL DEFAULT '{}',
  "publication_metadata_provider" TEXT,
  "publication_metadata_providers" TEXT NOT NULL DEFAULT '[]',
  "publication_display_style" TEXT,
  "publication_suggestion_cache_seconds" INTEGER NOT NULL DEFAULT 60,
  "profile_suggestion_cache_seconds" INTEGER NOT NULL DEFAULT 60,
  "project_suggestion_cache_seconds" INTEGER NOT NULL DEFAULT 60,
  "patent_suggestion_cache_seconds" INTEGER NOT NULL DEFAULT 60,
  "student_suggestion_cache_seconds" INTEGER NOT NULL DEFAULT 60,
  "news_suggestion_cache_seconds" INTEGER NOT NULL DEFAULT 60,
  "course_suggestion_cache_seconds" INTEGER NOT NULL DEFAULT 60,
  "patent_metadata_providers" TEXT NOT NULL DEFAULT '[]',
  "patentsview_api_key" TEXT,
  "epo_ops_client_id" TEXT,
  "epo_ops_client_secret" TEXT,
  "notify_email" TEXT,
  CONSTRAINT "ck_global_settings_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_global_settings_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_global_settings_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_global_settings_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_global_settings_allow_public_registration_0" CHECK ("allow_public_registration" IN (0, 1)),
  CONSTRAINT "ck_global_settings_allow_anonymous_messages_0" CHECK ("allow_anonymous_messages" IN (0, 1)),
  CONSTRAINT "ck_global_settings_upload_max_size_mb_0" CHECK (typeof("upload_max_size_mb") = 'integer' AND "upload_max_size_mb" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_upload_max_size_mb_1" CHECK ("upload_max_size_mb" >= 1),
  CONSTRAINT "ck_global_settings_upload_allowed_extensions_0" CHECK (CASE WHEN json_valid("upload_allowed_extensions") THEN json_type("upload_allowed_extensions") = 'array' ELSE 0 END),
  CONSTRAINT "ck_global_settings_media_trash_retention_days_0" CHECK (typeof("media_trash_retention_days") = 'integer' AND "media_trash_retention_days" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_media_trash_retention_days_1" CHECK ("media_trash_retention_days" >= 0),
  CONSTRAINT "ck_global_settings_news_pdf_allow_download_0" CHECK ("news_pdf_allow_download" IN (0, 1)),
  CONSTRAINT "ck_global_settings_translation_providers_0" CHECK (CASE WHEN json_valid("translation_providers") THEN json_type("translation_providers") = 'array' ELSE 0 END),
  CONSTRAINT "ck_global_settings_translation_batch_size_0" CHECK (typeof("translation_batch_size") = 'integer' AND "translation_batch_size" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_translation_batch_size_1" CHECK ("translation_batch_size" >= 1),
  CONSTRAINT "ck_global_settings_translation_batch_size_2" CHECK ("translation_batch_size" <= 50),
  CONSTRAINT "ck_global_settings_translation_worker_count_0" CHECK (typeof("translation_worker_count") = 'integer' AND "translation_worker_count" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_translation_worker_count_1" CHECK ("translation_worker_count" >= 1),
  CONSTRAINT "ck_global_settings_translation_worker_count_2" CHECK ("translation_worker_count" <= 8),
  CONSTRAINT "ck_global_settings_translation_timeout_seconds_0" CHECK (typeof("translation_timeout_seconds") = 'integer' AND "translation_timeout_seconds" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_translation_timeout_seconds_1" CHECK ("translation_timeout_seconds" >= 1),
  CONSTRAINT "ck_global_settings_translation_timeout_seconds_2" CHECK ("translation_timeout_seconds" <= 120),
  CONSTRAINT "ck_global_settings_translation_job_state_0" CHECK (CASE WHEN json_valid("translation_job_state") THEN json_type("translation_job_state") = 'object' ELSE 0 END),
  CONSTRAINT "ck_global_settings_publication_metadata_providers_0" CHECK (CASE WHEN json_valid("publication_metadata_providers") THEN json_type("publication_metadata_providers") = 'array' ELSE 0 END),
  CONSTRAINT "ck_global_settings_publication_suggestion_cache_seconds_0" CHECK (typeof("publication_suggestion_cache_seconds") = 'integer' AND "publication_suggestion_cache_seconds" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_publication_suggestion_cache_seconds_1" CHECK ("publication_suggestion_cache_seconds" >= 0),
  CONSTRAINT "ck_global_settings_profile_suggestion_cache_seconds_0" CHECK (typeof("profile_suggestion_cache_seconds") = 'integer' AND "profile_suggestion_cache_seconds" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_profile_suggestion_cache_seconds_1" CHECK ("profile_suggestion_cache_seconds" >= 0),
  CONSTRAINT "ck_global_settings_project_suggestion_cache_seconds_0" CHECK (typeof("project_suggestion_cache_seconds") = 'integer' AND "project_suggestion_cache_seconds" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_project_suggestion_cache_seconds_1" CHECK ("project_suggestion_cache_seconds" >= 0),
  CONSTRAINT "ck_global_settings_patent_suggestion_cache_seconds_0" CHECK (typeof("patent_suggestion_cache_seconds") = 'integer' AND "patent_suggestion_cache_seconds" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_patent_suggestion_cache_seconds_1" CHECK ("patent_suggestion_cache_seconds" >= 0),
  CONSTRAINT "ck_global_settings_student_suggestion_cache_seconds_0" CHECK (typeof("student_suggestion_cache_seconds") = 'integer' AND "student_suggestion_cache_seconds" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_student_suggestion_cache_seconds_1" CHECK ("student_suggestion_cache_seconds" >= 0),
  CONSTRAINT "ck_global_settings_news_suggestion_cache_seconds_0" CHECK (typeof("news_suggestion_cache_seconds") = 'integer' AND "news_suggestion_cache_seconds" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_news_suggestion_cache_seconds_1" CHECK ("news_suggestion_cache_seconds" >= 0),
  CONSTRAINT "ck_global_settings_course_suggestion_cache_seconds_0" CHECK (typeof("course_suggestion_cache_seconds") = 'integer' AND "course_suggestion_cache_seconds" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_global_settings_course_suggestion_cache_seconds_1" CHECK ("course_suggestion_cache_seconds" >= 0),
  CONSTRAINT "ck_global_settings_patent_metadata_providers_0" CHECK (CASE WHEN json_valid("patent_metadata_providers") THEN json_type("patent_metadata_providers") = 'array' ELSE 0 END)
);


CREATE TABLE "navigation_items" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "title" TEXT NOT NULL,
  "title_en" TEXT,
  "kind" TEXT,
  "url_name" TEXT,
  "path" TEXT,
  "fragment" TEXT,
  "icon" TEXT,
  "style" TEXT,
  "location" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'hidden',
  "enabled" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ck_navigation_items_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_navigation_items_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_navigation_items_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_navigation_items_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_navigation_items_title_0" CHECK (length(trim("title")) > 0),
  CONSTRAINT "ck_navigation_items_visibility_0" CHECK ("visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_navigation_items_enabled_0" CHECK ("enabled" IN (0, 1)),
  CONSTRAINT "ck_navigation_items_sort_order_0" CHECK (typeof("sort_order") = 'integer' AND "sort_order" BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX "idx_navigation_items_visibility_sort" ON "navigation_items" ("visibility", "sort_order", "id");
CREATE INDEX "idx_navigation_items_location" ON "navigation_items" ("location", "enabled", "visibility", "sort_order", "id");

CREATE TABLE "research_interests" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "name" TEXT NOT NULL,
  "name_en" TEXT,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "visibility" TEXT NOT NULL DEFAULT 'hidden',
  CONSTRAINT "ck_research_interests_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_research_interests_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_research_interests_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_research_interests_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_research_interests_name_0" CHECK (length(trim("name")) > 0),
  CONSTRAINT "ck_research_interests_sort_order_0" CHECK (typeof("sort_order") = 'integer' AND "sort_order" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "ck_research_interests_visibility_0" CHECK ("visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden'))
);

CREATE INDEX "idx_research_interests_visibility_sort" ON "research_interests" ("visibility", "sort_order", "id");

CREATE TABLE "publications" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "title" TEXT NOT NULL,
  "source_citation" TEXT,
  "authors" TEXT,
  "venue" TEXT,
  "year" INTEGER,
  "volume" TEXT,
  "issue" TEXT,
  "pages" TEXT,
  "doi" TEXT,
  "url" TEXT,
  "pdf_key" TEXT REFERENCES "media_assets"("object_key") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "bibtex" TEXT,
  "citation_gbt" TEXT,
  "citation_elsevier" TEXT,
  "citation_apa" TEXT,
  "citation_ieee" TEXT,
  "highlight_gbt" TEXT,
  "highlight_elsevier" TEXT,
  "highlight_apa" TEXT,
  "highlight_ieee" TEXT,
  "publication_type" TEXT,
  "author_role" TEXT,
  "corresponding_authors" TEXT,
  "index_type" TEXT,
  "display_tags" TEXT,
  "abstract" TEXT,
  "keywords" TEXT,
  "pdf_visibility" TEXT NOT NULL DEFAULT 'hidden',
  "visibility" TEXT NOT NULL DEFAULT 'hidden',
  "is_featured" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ck_publications_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_publications_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_publications_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_publications_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_publications_title_0" CHECK (length(trim("title")) > 0),
  CONSTRAINT "ck_publications_year_0" CHECK ("year" IS NULL OR (typeof("year") = 'integer' AND "year" BETWEEN -9007199254740991 AND 9007199254740991)),
  CONSTRAINT "ck_publications_year_1" CHECK ("year" IS NULL OR ("year" >= 1)),
  CONSTRAINT "ck_publications_year_2" CHECK ("year" IS NULL OR ("year" <= 9999)),
  CONSTRAINT "ck_publications_pdf_visibility_0" CHECK ("pdf_visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_publications_visibility_0" CHECK ("visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_publications_is_featured_0" CHECK ("is_featured" IN (0, 1)),
  CONSTRAINT "ck_publications_sort_order_0" CHECK (typeof("sort_order") = 'integer' AND "sort_order" BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX "idx_publications_visibility_sort" ON "publications" ("visibility", "sort_order", "id");
CREATE INDEX "idx_publications_featured" ON "publications" ("visibility", "is_featured", "sort_order", "id");
CREATE INDEX "idx_publications_pdf_key" ON "publications" ("pdf_key");
CREATE INDEX "idx_publications_visibility_year" ON "publications" ("visibility", "year" DESC, "sort_order", "id");

CREATE TABLE "projects" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "name" TEXT NOT NULL,
  "source" TEXT,
  "fund_name" TEXT,
  "project_number" TEXT,
  "project_role" TEXT,
  "principal" TEXT,
  "members" TEXT,
  "start_date" TEXT,
  "end_date" TEXT,
  "status" TEXT,
  "amount" TEXT,
  "summary" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'hidden',
  "is_featured" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ck_projects_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_projects_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_projects_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_projects_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_projects_name_0" CHECK (length(trim("name")) > 0),
  CONSTRAINT "ck_projects_start_date_0" CHECK ("start_date" IS NULL OR (length("start_date") = 10 AND COALESCE(strftime('%Y-%m-%d', "start_date", '+0 days') = "start_date", 0))),
  CONSTRAINT "ck_projects_end_date_0" CHECK ("end_date" IS NULL OR (length("end_date") = 10 AND COALESCE(strftime('%Y-%m-%d', "end_date", '+0 days') = "end_date", 0))),
  CONSTRAINT "ck_projects_amount_0" CHECK ("amount" IS NULL OR (length("amount") BETWEEN 1 AND 23 AND "amount" NOT GLOB '*[^0-9.]*' AND "amount" NOT LIKE '%.%.%' AND substr("amount", 1, 1) GLOB '[0-9]' AND substr("amount", -1, 1) GLOB '[0-9]' AND (instr("amount", '.') = 0 AND length("amount") <= 18 OR instr("amount", '.') BETWEEN 2 AND 19 AND length("amount") - instr("amount", '.') BETWEEN 1 AND 4) AND (substr("amount", 1, 1) != '0' OR "amount" = '0' OR substr("amount", 1, 2) = '0.'))),
  CONSTRAINT "ck_projects_visibility_0" CHECK ("visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_projects_is_featured_0" CHECK ("is_featured" IN (0, 1)),
  CONSTRAINT "ck_projects_sort_order_0" CHECK (typeof("sort_order") = 'integer' AND "sort_order" BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX "idx_projects_visibility_sort" ON "projects" ("visibility", "sort_order", "id");
CREATE INDEX "idx_projects_featured" ON "projects" ("visibility", "is_featured", "sort_order", "id");

CREATE TABLE "patents" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "name" TEXT NOT NULL,
  "country" TEXT,
  "patent_type" TEXT,
  "application_number" TEXT,
  "grant_number" TEXT,
  "application_date" TEXT,
  "grant_date" TEXT,
  "inventors" TEXT,
  "owner" TEXT,
  "legal_status" TEXT,
  "summary" TEXT,
  "certificate_key" TEXT REFERENCES "media_assets"("object_key") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "visibility" TEXT NOT NULL DEFAULT 'hidden',
  "is_featured" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ck_patents_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_patents_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_patents_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_patents_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_patents_name_0" CHECK (length(trim("name")) > 0),
  CONSTRAINT "ck_patents_application_date_0" CHECK ("application_date" IS NULL OR (length("application_date") = 10 AND COALESCE(strftime('%Y-%m-%d', "application_date", '+0 days') = "application_date", 0))),
  CONSTRAINT "ck_patents_grant_date_0" CHECK ("grant_date" IS NULL OR (length("grant_date") = 10 AND COALESCE(strftime('%Y-%m-%d', "grant_date", '+0 days') = "grant_date", 0))),
  CONSTRAINT "ck_patents_visibility_0" CHECK ("visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_patents_is_featured_0" CHECK ("is_featured" IN (0, 1)),
  CONSTRAINT "ck_patents_sort_order_0" CHECK (typeof("sort_order") = 'integer' AND "sort_order" BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX "idx_patents_visibility_sort" ON "patents" ("visibility", "sort_order", "id");
CREATE INDEX "idx_patents_featured" ON "patents" ("visibility", "is_featured", "sort_order", "id");
CREATE INDEX "idx_patents_certificate_key" ON "patents" ("certificate_key");

CREATE TABLE "students" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "name" TEXT NOT NULL,
  "name_en" TEXT,
  "avatar_key" TEXT REFERENCES "media_assets"("object_key") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "student_id" TEXT,
  "degree" TEXT,
  "category" TEXT,
  "grade" TEXT,
  "direction" TEXT,
  "status" TEXT,
  "email" TEXT,
  "homepage" TEXT,
  "enrollment_date" TEXT,
  "graduation_date" TEXT,
  "destination" TEXT,
  "awards" TEXT,
  "bio" TEXT,
  "contact_visibility" TEXT NOT NULL DEFAULT 'hidden',
  "visibility" TEXT NOT NULL DEFAULT 'hidden',
  "is_featured" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ck_students_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_students_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_students_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_students_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_students_name_0" CHECK (length(trim("name")) > 0),
  CONSTRAINT "ck_students_enrollment_date_0" CHECK ("enrollment_date" IS NULL OR (length("enrollment_date") = 10 AND COALESCE(strftime('%Y-%m-%d', "enrollment_date", '+0 days') = "enrollment_date", 0))),
  CONSTRAINT "ck_students_graduation_date_0" CHECK ("graduation_date" IS NULL OR (length("graduation_date") = 10 AND COALESCE(strftime('%Y-%m-%d', "graduation_date", '+0 days') = "graduation_date", 0))),
  CONSTRAINT "ck_students_contact_visibility_0" CHECK ("contact_visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_students_visibility_0" CHECK ("visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_students_is_featured_0" CHECK ("is_featured" IN (0, 1)),
  CONSTRAINT "ck_students_sort_order_0" CHECK (typeof("sort_order") = 'integer' AND "sort_order" BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX "idx_students_visibility_sort" ON "students" ("visibility", "sort_order", "id");
CREATE INDEX "idx_students_featured" ON "students" ("visibility", "is_featured", "sort_order", "id");
CREATE INDEX "idx_students_avatar_key" ON "students" ("avatar_key");
CREATE INDEX "idx_students_group" ON "students" ("visibility", "category", "status", "sort_order", "id");

CREATE TABLE "student_category_displays" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "key" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "label_en" TEXT,
  "keywords" TEXT,
  "enabled" INTEGER NOT NULL DEFAULT 0,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ck_student_category_displays_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_student_category_displays_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_student_category_displays_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_student_category_displays_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_student_category_displays_key_0" CHECK (length(trim("key")) > 0),
  CONSTRAINT "ck_student_category_displays_label_0" CHECK (length(trim("label")) > 0),
  CONSTRAINT "ck_student_category_displays_enabled_0" CHECK ("enabled" IN (0, 1)),
  CONSTRAINT "ck_student_category_displays_display_order_0" CHECK (typeof("display_order") = 'integer' AND "display_order" BETWEEN -9007199254740991 AND 9007199254740991)
);


CREATE TABLE "news" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "category" TEXT,
  "cover_key" TEXT REFERENCES "media_assets"("object_key") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "content" TEXT,
  "content_format" TEXT NOT NULL DEFAULT 'plain',
  "related_publication_uid" TEXT REFERENCES "publications"("uid") ON UPDATE RESTRICT ON DELETE SET NULL,
  "related_project_uid" TEXT REFERENCES "projects"("uid") ON UPDATE RESTRICT ON DELETE SET NULL,
  "related_student_uid" TEXT REFERENCES "students"("uid") ON UPDATE RESTRICT ON DELETE SET NULL,
  "allow_comments" INTEGER NOT NULL DEFAULT 0,
  "published_at" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'hidden',
  "is_featured" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ck_news_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_news_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_news_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_news_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_news_title_0" CHECK (length(trim("title")) > 0),
  CONSTRAINT "ck_news_slug_0" CHECK (length(trim("slug")) > 0),
  CONSTRAINT "ck_news_content_format_0" CHECK ("content_format" IN ('plain', 'html', 'markdown')),
  CONSTRAINT "ck_news_allow_comments_0" CHECK ("allow_comments" IN (0, 1)),
  CONSTRAINT "ck_news_published_at_0" CHECK ("published_at" IS NULL OR (length("published_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "published_at", '+0 seconds') = "published_at", 0))),
  CONSTRAINT "ck_news_visibility_0" CHECK ("visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_news_is_featured_0" CHECK ("is_featured" IN (0, 1)),
  CONSTRAINT "ck_news_sort_order_0" CHECK (typeof("sort_order") = 'integer' AND "sort_order" BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX "idx_news_visibility_sort" ON "news" ("visibility", "sort_order", "id");
CREATE INDEX "idx_news_featured" ON "news" ("visibility", "is_featured", "sort_order", "id");
CREATE INDEX "idx_news_cover_key" ON "news" ("cover_key");
CREATE INDEX "idx_news_related_publication_uid" ON "news" ("related_publication_uid");
CREATE INDEX "idx_news_related_project_uid" ON "news" ("related_project_uid");
CREATE INDEX "idx_news_related_student_uid" ON "news" ("related_student_uid");
CREATE INDEX "idx_news_published" ON "news" ("visibility", "published_at" DESC, "sort_order", "id");

CREATE TABLE "courses" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "name" TEXT NOT NULL,
  "semester" TEXT,
  "audience" TEXT,
  "summary" TEXT,
  "syllabus_key" TEXT REFERENCES "media_assets"("object_key") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "material_key" TEXT REFERENCES "media_assets"("object_key") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "material_visibility" TEXT NOT NULL DEFAULT 'hidden',
  "references_text" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'hidden',
  "is_featured" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ck_courses_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_courses_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_courses_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_courses_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_courses_name_0" CHECK (length(trim("name")) > 0),
  CONSTRAINT "ck_courses_material_visibility_0" CHECK ("material_visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_courses_visibility_0" CHECK ("visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden')),
  CONSTRAINT "ck_courses_is_featured_0" CHECK ("is_featured" IN (0, 1)),
  CONSTRAINT "ck_courses_sort_order_0" CHECK (typeof("sort_order") = 'integer' AND "sort_order" BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX "idx_courses_visibility_sort" ON "courses" ("visibility", "sort_order", "id");
CREATE INDEX "idx_courses_featured" ON "courses" ("visibility", "is_featured", "sort_order", "id");
CREATE INDEX "idx_courses_syllabus_key" ON "courses" ("syllabus_key");
CREATE INDEX "idx_courses_material_key" ON "courses" ("material_key");

CREATE TABLE "messages" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "name" TEXT,
  "email" TEXT,
  "message_type" TEXT,
  "subject" TEXT,
  "content" TEXT NOT NULL,
  "attachment_key" TEXT REFERENCES "media_assets"("object_key") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "visibility" TEXT NOT NULL DEFAULT 'hidden',
  CONSTRAINT "ck_messages_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_messages_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_messages_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_messages_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_messages_content_0" CHECK (length(trim("content")) > 0),
  CONSTRAINT "ck_messages_visibility_0" CHECK ("visibility" IN ('public', 'authenticated', 'staff', 'owner', 'hidden'))
);

CREATE INDEX "idx_messages_attachment_key" ON "messages" ("attachment_key");
CREATE INDEX "idx_messages_status_created" ON "messages" ("status", "created_at" DESC, "id");

CREATE TABLE "translation_cache" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "source_hash" TEXT NOT NULL,
  "source_ref_key" TEXT NOT NULL,
  "source_text" TEXT NOT NULL,
  "source_lang" TEXT NOT NULL,
  "target_lang" TEXT NOT NULL,
  "translated_text" TEXT,
  "provider" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "is_manual" INTEGER NOT NULL DEFAULT 0,
  "is_current" INTEGER NOT NULL DEFAULT 0,
  "source_refs" TEXT NOT NULL DEFAULT '[]',
  "error_message" TEXT,
  CONSTRAINT "ck_translation_cache_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_translation_cache_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_translation_cache_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_translation_cache_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_translation_cache_source_hash_0" CHECK (length(trim("source_hash")) > 0),
  CONSTRAINT "ck_translation_cache_source_hash_1" CHECK (length("source_hash") >= 64),
  CONSTRAINT "ck_translation_cache_source_hash_2" CHECK (length("source_hash") <= 64),
  CONSTRAINT "ck_translation_cache_source_ref_key_0" CHECK (length(trim("source_ref_key")) > 0),
  CONSTRAINT "ck_translation_cache_source_text_0" CHECK (length(trim("source_text")) > 0),
  CONSTRAINT "ck_translation_cache_source_lang_0" CHECK (length(trim("source_lang")) > 0),
  CONSTRAINT "ck_translation_cache_target_lang_0" CHECK (length(trim("target_lang")) > 0),
  CONSTRAINT "ck_translation_cache_status_0" CHECK ("status" IN ('pending', 'success', 'failed')),
  CONSTRAINT "ck_translation_cache_is_manual_0" CHECK ("is_manual" IN (0, 1)),
  CONSTRAINT "ck_translation_cache_is_current_0" CHECK ("is_current" IN (0, 1)),
  CONSTRAINT "ck_translation_cache_source_refs_0" CHECK (CASE WHEN json_valid("source_refs") THEN json_type("source_refs") = 'array' ELSE 0 END)
);

CREATE INDEX "idx_translation_cache_hash_language" ON "translation_cache" ("source_hash", "target_lang", "is_current");
CREATE INDEX "idx_translation_cache_ref_language" ON "translation_cache" ("source_ref_key", "target_lang", "is_current");
CREATE UNIQUE INDEX "idx_translation_cache_one_current" ON "translation_cache" ("source_ref_key", "target_lang") WHERE "is_current" = 1 AND "status" = 'success';

CREATE TABLE "operation_logs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "uid" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "actor_uid" TEXT,
  "actor_name" TEXT,
  "action" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "target_uid" TEXT,
  "summary" TEXT,
  "detail_json" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT,
  CONSTRAINT "ck_operation_logs_uid_0" CHECK (length(trim("uid")) > 0),
  CONSTRAINT "ck_operation_logs_uid_1" CHECK (length("uid") <= 128),
  CONSTRAINT "ck_operation_logs_created_at_0" CHECK (length("created_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at", '+0 seconds') = "created_at", 0)),
  CONSTRAINT "ck_operation_logs_updated_at_0" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0)),
  CONSTRAINT "ck_operation_logs_action_0" CHECK (length(trim("action")) > 0),
  CONSTRAINT "ck_operation_logs_module_0" CHECK (length(trim("module")) > 0),
  CONSTRAINT "ck_operation_logs_detail_json_0" CHECK (CASE WHEN json_valid("detail_json") THEN json_type("detail_json") = 'object' ELSE 0 END)
);

CREATE INDEX "idx_operation_logs_module_created" ON "operation_logs" ("module", "created_at" DESC, "id");

-- ============================================================================
-- Source: 0002_auth_security.sql
-- ============================================================================

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

-- ============================================================================
-- Source: 0003_media_i18n_cache.sql
-- ============================================================================

-- Stage 3 technical cache generation table. Transaction ownership belongs to the migration runner.
CREATE TABLE "cache_generations" (
  "tag" TEXT PRIMARY KEY NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "ck_cache_generations_tag" CHECK (length(trim("tag")) > 0 AND length("tag") <= 128),
  CONSTRAINT "ck_cache_generations_generation" CHECK ("generation" >= 1 AND "generation" <= 9007199254740990),
  CONSTRAINT "ck_cache_generations_updated_at" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0))
) STRICT;

-- ============================================================================
-- Source: 0004_public_content_indexes.sql
-- ============================================================================

-- Hot-path ordering indexes for public list pages.
-- This migration is append-only; the immutable initial migration remains unchanged.

CREATE INDEX "idx_profiles_visibility_active_sort"
  ON "profiles" ("visibility", "is_active", "sort_order", "id");

CREATE INDEX "idx_projects_visibility_start_date"
  ON "projects" ("visibility", "start_date" DESC, "sort_order", "id");

CREATE INDEX "idx_courses_visibility_semester"
  ON "courses" ("visibility", "semester" DESC, "sort_order", "id");

-- ============================================================================
-- Source: 0005_public_interactions_and_demo_seed.sql
-- ============================================================================

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

-- ============================================================================
-- Source: 0006_admin_shell.sql
-- ============================================================================

CREATE INDEX IF NOT EXISTS "idx_operation_logs_created_desc"
  ON "operation_logs" ("created_at" DESC, "id" DESC);

-- ============================================================================
-- Source: 0007_admin_content_management.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS "admin_mutation_guards" (
  "uid" TEXT PRIMARY KEY NOT NULL,
  "module" TEXT NOT NULL,
  "target_uid" TEXT NOT NULL,
  "expected_updated_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  CONSTRAINT "ck_admin_mutation_guards_uid" CHECK (length("uid") BETWEEN 1 AND 128),
  CONSTRAINT "ck_admin_mutation_guards_module" CHECK (length("module") BETWEEN 1 AND 128),
  CONSTRAINT "ck_admin_mutation_guards_target" CHECK (length("target_uid") BETWEEN 1 AND 2048),
  CONSTRAINT "ck_admin_mutation_guards_expected" CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', "expected_updated_at") = "expected_updated_at"),
  CONSTRAINT "ck_admin_mutation_guards_created" CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") = "created_at")
);

CREATE INDEX IF NOT EXISTS "idx_admin_mutation_guards_created_at"
  ON "admin_mutation_guards" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_profiles_admin_updated"
  ON "profiles" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_publications_admin_updated"
  ON "publications" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_projects_admin_updated"
  ON "projects" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_patents_admin_updated"
  ON "patents" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_students_admin_updated"
  ON "students" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_news_admin_updated"
  ON "news" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_courses_admin_updated"
  ON "courses" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_messages_admin_status_created"
  ON "messages" ("status", "created_at" DESC, "id" DESC);

-- ============================================================================
-- Source: 0008_complete_admin_integrity.sql
-- ============================================================================

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

-- ============================================================================
-- Source: 0009_auth_management_integrity.sql
-- ============================================================================

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

-- ============================================================================
-- Source: 0010_profile_link_values.sql
-- ============================================================================

-- Optional display values for existing teacher platform links; no existing values are changed.
ALTER TABLE "profiles" ADD COLUMN "orcid_value" INTEGER CHECK ("orcid_value" IS NULL OR (typeof("orcid_value") = 'integer' AND "orcid_value" BETWEEN 0 AND 9007199254740991));
ALTER TABLE "profiles" ADD COLUMN "personal_homepage_value" INTEGER CHECK ("personal_homepage_value" IS NULL OR (typeof("personal_homepage_value") = 'integer' AND "personal_homepage_value" BETWEEN 0 AND 9007199254740991));
ALTER TABLE "profiles" ADD COLUMN "google_scholar_value" INTEGER CHECK ("google_scholar_value" IS NULL OR (typeof("google_scholar_value") = 'integer' AND "google_scholar_value" BETWEEN 0 AND 9007199254740991));
ALTER TABLE "profiles" ADD COLUMN "dblp_value" INTEGER CHECK ("dblp_value" IS NULL OR (typeof("dblp_value") = 'integer' AND "dblp_value" BETWEEN 0 AND 9007199254740991));
ALTER TABLE "profiles" ADD COLUMN "github_value" INTEGER CHECK ("github_value" IS NULL OR (typeof("github_value") = 'integer' AND "github_value" BETWEEN 0 AND 9007199254740991));
ALTER TABLE "profiles" ADD COLUMN "cnki_value" INTEGER CHECK ("cnki_value" IS NULL OR (typeof("cnki_value") = 'integer' AND "cnki_value" BETWEEN 0 AND 9007199254740991));

-- ============================================================================
-- Source: 0011_media_full_scan.sql
-- ============================================================================

-- Last full-scan job and per-media inspection results. Media contents are never deleted.
CREATE TABLE media_scan_jobs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  state_json TEXT NOT NULL CHECK (json_valid(state_json))
);
CREATE TABLE media_inspections (
  media_uid TEXT PRIMARY KEY REFERENCES media_assets(uid) ON DELETE CASCADE,
  result_json TEXT NOT NULL CHECK (json_valid(result_json))
);
