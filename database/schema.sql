-- Canonical empty-database schema; existing databases use explicit migrations.
CREATE TABLE _cms_migrations (name TEXT PRIMARY KEY NOT NULL, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));

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
  "checksum" TEXT, original_filename TEXT CHECK (original_filename IS NULL OR length(original_filename)<=255),
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
  "sort_order" INTEGER NOT NULL DEFAULT 0, "orcid_value" INTEGER CHECK ("orcid_value" IS NULL OR (typeof("orcid_value") = 'integer' AND "orcid_value" BETWEEN 0 AND 9007199254740991)), "personal_homepage_value" INTEGER CHECK ("personal_homepage_value" IS NULL OR (typeof("personal_homepage_value") = 'integer' AND "personal_homepage_value" BETWEEN 0 AND 9007199254740991)), "google_scholar_value" INTEGER CHECK ("google_scholar_value" IS NULL OR (typeof("google_scholar_value") = 'integer' AND "google_scholar_value" BETWEEN 0 AND 9007199254740991)), "dblp_value" INTEGER CHECK ("dblp_value" IS NULL OR (typeof("dblp_value") = 'integer' AND "dblp_value" BETWEEN 0 AND 9007199254740991)), "github_value" INTEGER CHECK ("github_value" IS NULL OR (typeof("github_value") = 'integer' AND "github_value" BETWEEN 0 AND 9007199254740991)), "cnki_value" INTEGER CHECK ("cnki_value" IS NULL OR (typeof("cnki_value") = 'integer' AND "cnki_value" BETWEEN 0 AND 9007199254740991)),
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
  "homepage_news_limit" INTEGER NOT NULL DEFAULT 5, homepage_project_limit INTEGER NOT NULL DEFAULT 10 CHECK (typeof(homepage_project_limit) = 'integer' AND homepage_project_limit >= 0), homepage_student_limit INTEGER NOT NULL DEFAULT 0 CHECK (typeof(homepage_student_limit) = 'integer' AND homepage_student_limit >= 0), homepage_patent_limit INTEGER NOT NULL DEFAULT 0 CHECK (typeof(homepage_patent_limit) = 'integer' AND homepage_patent_limit >= 0), publication_citation_style TEXT NOT NULL DEFAULT 'gbt' CHECK (publication_citation_style IN ('gbt','elsevier','apa','ieee')),
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

CREATE TABLE "cache_generations" (
  "tag" TEXT PRIMARY KEY NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "ck_cache_generations_tag" CHECK (length(trim("tag")) > 0 AND length("tag") <= 128),
  CONSTRAINT "ck_cache_generations_generation" CHECK ("generation" >= 1 AND "generation" <= 9007199254740990),
  CONSTRAINT "ck_cache_generations_updated_at" CHECK (length("updated_at") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at", '+0 seconds') = "updated_at", 0))
) STRICT;

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

CREATE TABLE "admin_mutation_guards" (
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

CREATE INDEX "idx_media_assets_status_category_mime" ON "media_assets" ("status", "category", "mime_type", "id");

CREATE INDEX "idx_auth_users_role_uid" ON "auth_users" ("role_uid");

CREATE UNIQUE INDEX "idx_auth_users_username_nocase" ON "auth_users" ("username" COLLATE NOCASE);

CREATE INDEX "idx_auth_permissions_role_uid" ON "auth_permissions" ("role_uid");

CREATE UNIQUE INDEX "idx_auth_permissions_role_module" ON "auth_permissions" ("role_uid", "module");

CREATE INDEX "idx_profiles_visibility_sort" ON "profiles" ("visibility", "sort_order", "id");

CREATE INDEX "idx_profiles_featured" ON "profiles" ("visibility", "is_featured", "sort_order", "id");

CREATE INDEX "idx_profiles_avatar_key" ON "profiles" ("avatar_key");

CREATE INDEX "idx_site_settings_logo_key" ON "site_settings" ("logo_key");

CREATE INDEX "idx_site_settings_favicon_key" ON "site_settings" ("favicon_key");

CREATE INDEX "idx_site_settings_og_image_key" ON "site_settings" ("og_image_key");

CREATE INDEX "idx_site_settings_homepage_profile_uid" ON "site_settings" ("homepage_profile_uid");

CREATE UNIQUE INDEX "idx_site_settings_one_active" ON "site_settings" ("is_active") WHERE "is_active" = 1;

CREATE INDEX "idx_navigation_items_visibility_sort" ON "navigation_items" ("visibility", "sort_order", "id");

CREATE INDEX "idx_navigation_items_location" ON "navigation_items" ("location", "enabled", "visibility", "sort_order", "id");

CREATE INDEX "idx_research_interests_visibility_sort" ON "research_interests" ("visibility", "sort_order", "id");

CREATE INDEX "idx_publications_visibility_sort" ON "publications" ("visibility", "sort_order", "id");

CREATE INDEX "idx_publications_featured" ON "publications" ("visibility", "is_featured", "sort_order", "id");

CREATE INDEX "idx_publications_pdf_key" ON "publications" ("pdf_key");

CREATE INDEX "idx_publications_visibility_year" ON "publications" ("visibility", "year" DESC, "sort_order", "id");

CREATE INDEX "idx_projects_visibility_sort" ON "projects" ("visibility", "sort_order", "id");

CREATE INDEX "idx_projects_featured" ON "projects" ("visibility", "is_featured", "sort_order", "id");

CREATE INDEX "idx_patents_visibility_sort" ON "patents" ("visibility", "sort_order", "id");

CREATE INDEX "idx_patents_featured" ON "patents" ("visibility", "is_featured", "sort_order", "id");

CREATE INDEX "idx_patents_certificate_key" ON "patents" ("certificate_key");

CREATE INDEX "idx_students_visibility_sort" ON "students" ("visibility", "sort_order", "id");

CREATE INDEX "idx_students_featured" ON "students" ("visibility", "is_featured", "sort_order", "id");

CREATE INDEX "idx_students_avatar_key" ON "students" ("avatar_key");

CREATE INDEX "idx_students_group" ON "students" ("visibility", "category", "status", "sort_order", "id");

CREATE INDEX "idx_news_visibility_sort" ON "news" ("visibility", "sort_order", "id");

CREATE INDEX "idx_news_featured" ON "news" ("visibility", "is_featured", "sort_order", "id");

CREATE INDEX "idx_news_cover_key" ON "news" ("cover_key");

CREATE INDEX "idx_news_related_publication_uid" ON "news" ("related_publication_uid");

CREATE INDEX "idx_news_related_project_uid" ON "news" ("related_project_uid");

CREATE INDEX "idx_news_related_student_uid" ON "news" ("related_student_uid");

CREATE INDEX "idx_news_published" ON "news" ("visibility", "published_at" DESC, "sort_order", "id");

CREATE INDEX "idx_courses_visibility_sort" ON "courses" ("visibility", "sort_order", "id");

CREATE INDEX "idx_courses_featured" ON "courses" ("visibility", "is_featured", "sort_order", "id");

CREATE INDEX "idx_courses_syllabus_key" ON "courses" ("syllabus_key");

CREATE INDEX "idx_courses_material_key" ON "courses" ("material_key");

CREATE INDEX "idx_messages_attachment_key" ON "messages" ("attachment_key");

CREATE INDEX "idx_messages_status_created" ON "messages" ("status", "created_at" DESC, "id");

CREATE INDEX "idx_translation_cache_hash_language" ON "translation_cache" ("source_hash", "target_lang", "is_current");

CREATE INDEX "idx_translation_cache_ref_language" ON "translation_cache" ("source_ref_key", "target_lang", "is_current");

CREATE UNIQUE INDEX "idx_translation_cache_one_current" ON "translation_cache" ("source_ref_key", "target_lang") WHERE "is_current" = 1 AND "status" = 'success';

CREATE INDEX "idx_operation_logs_module_created" ON "operation_logs" ("module", "created_at" DESC, "id");

CREATE UNIQUE INDEX "idx_auth_sessions_token_hash" ON "auth_sessions" ("token_hash");

CREATE INDEX "idx_auth_sessions_user_active" ON "auth_sessions" ("user_uid", "revoked_at", "created_at", "id");

CREATE INDEX "idx_auth_sessions_expiry" ON "auth_sessions" ("expires_at", "idle_expires_at", "id");

CREATE INDEX "idx_auth_sessions_revoked" ON "auth_sessions" ("revoked_at", "id");

CREATE INDEX "idx_auth_login_throttles_expiry" ON "auth_login_throttles" ("expires_at", "key_hash");

CREATE INDEX "idx_profiles_visibility_active_sort"
  ON "profiles" ("visibility", "is_active", "sort_order", "id");

CREATE INDEX "idx_projects_visibility_start_date"
  ON "projects" ("visibility", "start_date" DESC, "sort_order", "id");

CREATE INDEX "idx_courses_visibility_semester"
  ON "courses" ("visibility", "semester" DESC, "sort_order", "id");

CREATE INDEX "idx_public_action_throttles_expiry"
  ON "public_action_throttles" ("expires_at", "key_hash");

CREATE INDEX "idx_public_action_throttles_action_scope"
  ON "public_action_throttles" ("action", "scope", "updated_at");

CREATE INDEX "idx_global_settings_updated"
  ON "global_settings" ("updated_at" DESC, "id" DESC);

CREATE INDEX "idx_operation_logs_created_desc"
  ON "operation_logs" ("created_at" DESC, "id" DESC);

CREATE INDEX "idx_admin_mutation_guards_created_at"
  ON "admin_mutation_guards" ("created_at");

CREATE INDEX "idx_profiles_admin_updated"
  ON "profiles" ("updated_at" DESC, "id" DESC);

CREATE INDEX "idx_publications_admin_updated"
  ON "publications" ("updated_at" DESC, "id" DESC);

CREATE INDEX "idx_projects_admin_updated"
  ON "projects" ("updated_at" DESC, "id" DESC);

CREATE INDEX "idx_patents_admin_updated"
  ON "patents" ("updated_at" DESC, "id" DESC);

CREATE INDEX "idx_students_admin_updated"
  ON "students" ("updated_at" DESC, "id" DESC);

CREATE INDEX "idx_news_admin_updated"
  ON "news" ("updated_at" DESC, "id" DESC);

CREATE INDEX "idx_courses_admin_updated"
  ON "courses" ("updated_at" DESC, "id" DESC);

CREATE INDEX "idx_messages_admin_status_created"
  ON "messages" ("status", "created_at" DESC, "id" DESC);

CREATE UNIQUE INDEX ux_auth_permissions_role_module ON auth_permissions(role_uid, module);

CREATE UNIQUE INDEX ux_auth_users_username_nocase ON auth_users(username COLLATE NOCASE);

CREATE UNIQUE INDEX ux_site_settings_single_active ON site_settings(is_active) WHERE is_active = 1;

CREATE INDEX idx_media_assets_admin_status_updated ON media_assets(status, updated_at DESC, id DESC);

CREATE INDEX idx_translation_cache_admin_status_updated ON translation_cache(status, is_current, updated_at DESC, id DESC);

CREATE INDEX idx_auth_sessions_user_active_expiry ON auth_sessions(user_uid, revoked_at, expires_at DESC);

CREATE INDEX idx_admin_mutation_guards_created
  ON admin_mutation_guards(created_at);

-- v0.15.66: shared transfer tables
-- Canonical final schema from original source. Fresh initialization only.
CREATE TABLE service_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;

CREATE TABLE admin_grants (user_uid TEXT PRIMARY KEY, granted_at TEXT NOT NULL, granted_by TEXT NOT NULL) STRICT;

CREATE TABLE bridge_nonces (jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL) STRICT;

CREATE TABLE tool_settings (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, document TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL) STRICT;

CREATE TABLE settings_audit (revision INTEGER PRIMARY KEY, changed_at TEXT NOT NULL, changed_by TEXT NOT NULL, action TEXT NOT NULL) STRICT;

CREATE TABLE transfer_allowances (
    task TEXT NOT NULL, member TEXT NOT NULL, identity_key TEXT NOT NULL, kind TEXT NOT NULL,
    bytes TEXT NOT NULL, created_at INTEGER NOT NULL, authorized_at INTEGER,
    expires_at INTEGER NOT NULL, finished_at INTEGER, outcome TEXT,
    PRIMARY KEY(task, member)
  ) STRICT;

CREATE TABLE vpn_state(id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL) STRICT;

CREATE TABLE vpn_grants(token_hash TEXT PRIMARY KEY, revision INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      rx_max TEXT NOT NULL, tx_max TEXT NOT NULL, overhead INTEGER NOT NULL, rx_issued TEXT NOT NULL, tx_issued TEXT NOT NULL,
      sequence INTEGER NOT NULL, closed_at INTEGER, reconciled_at INTEGER) STRICT;

CREATE TABLE vpn_audit(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL) STRICT;

CREATE TABLE temporary_shares(id TEXT PRIMARY KEY,owner TEXT NOT NULL,secret_hash TEXT UNIQUE NOT NULL,summary TEXT NOT NULL,manifest TEXT,reserved_bytes TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,max_downloads INTEGER NOT NULL,downloads INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL) STRICT;

CREATE TABLE recovery_tasks(id TEXT PRIMARY KEY,transport TEXT NOT NULL,summary TEXT NOT NULL,note TEXT NOT NULL,point TEXT NOT NULL,extra TEXT NOT NULL,state TEXT NOT NULL,expires_at INTEGER NOT NULL,updated_at INTEGER NOT NULL) STRICT;

CREATE TABLE recovery_members(task TEXT NOT NULL REFERENCES recovery_tasks(id) ON DELETE CASCADE,member TEXT NOT NULL,identity_key TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,PRIMARY KEY(task,member)) STRICT;

CREATE INDEX bridge_nonce_expiry ON bridge_nonces(expires_at);

CREATE INDEX allowance_identity ON transfer_allowances(identity_key, authorized_at);

CREATE INDEX allowance_kind ON transfer_allowances(kind, authorized_at);

CREATE INDEX allowance_expiry ON transfer_allowances(expires_at);

CREATE INDEX vpn_grants_expiry ON vpn_grants(expires_at);

CREATE INDEX share_expiry ON temporary_shares(expires_at);

CREATE INDEX recovery_expiry ON recovery_tasks(expires_at);

-- v0.15.67: bounded chunk indexes and receive windows
CREATE TABLE transfer_chunks (
 task TEXT NOT NULL REFERENCES recovery_tasks(id) ON DELETE CASCADE,
 offset INTEGER NOT NULL CHECK(offset>=0), size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 1048576),
 key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 PRIMARY KEY(task,offset)
) STRICT;
CREATE TABLE transfer_receivers (
 id TEXT PRIMARY KEY, task TEXT NOT NULL REFERENCES recovery_tasks(id) ON DELETE CASCADE,
 secret_hash TEXT NOT NULL, identity_key TEXT NOT NULL, stamp INTEGER NOT NULL,
 offset INTEGER NOT NULL DEFAULT 0, pending INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
 offered_bytes INTEGER NOT NULL DEFAULT 0, not_before INTEGER NOT NULL DEFAULT 0,
 expires_at INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','complete','cancelled'))
) STRICT;
CREATE INDEX receiver_expiry ON transfer_receivers(expires_at);
CREATE INDEX receiver_task ON transfer_receivers(task,state);

-- Unified short receive codes; revoked/expired codes retain a reuse cooldown.
CREATE TABLE transfer_codes (
 id TEXT PRIMARY KEY,
 code TEXT NOT NULL UNIQUE CHECK (code GLOB '[A-Z][A-Z][0-9][0-9][0-9][0-9]' AND length(code)=6),
 mode TEXT NOT NULL CHECK (mode IN ('lan','relay','offline')),
 target TEXT NOT NULL,
 instance TEXT NOT NULL,
 state TEXT NOT NULL CHECK (state IN ('active','expired','revoked')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX transfer_code_target ON transfer_codes(mode,target,instance) WHERE state='active';
CREATE INDEX transfer_code_expiry ON transfer_codes(expires_at);


-- v0.15.120: internal synchronization previews; excluded from business export/catalog.

-- Redesigned site synchronization (v0.16.001).
-- Sole initialization SQL for the independent sync module.
-- Merge into the website's canonical database/schema.sql at integration; never run a second initializer.
CREATE TABLE sync_schema (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 version INTEGER NOT NULL CHECK(version>0),
 maintenance INTEGER NOT NULL DEFAULT 0 CHECK(maintenance IN (0,1))
) STRICT;
INSERT INTO sync_schema(singleton,version) VALUES(1,4);
CREATE TABLE sync_peers (
 peer_id TEXT PRIMARY KEY,
 origin TEXT NOT NULL,
 secret_ref TEXT NOT NULL,
 revision TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
) STRICT;
CREATE TABLE sync_grants (
 grant_id TEXT PRIMARY KEY,
 principal_id TEXT NOT NULL,
 revision TEXT NOT NULL,
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 scopes_json TEXT NOT NULL CHECK(json_valid(scopes_json) AND length(CAST(scopes_json AS BLOB))<=16384),
 can_write INTEGER NOT NULL CHECK(can_write IN (0,1)),
 can_delete INTEGER NOT NULL CHECK(can_delete IN (0,1)),
 expires_at INTEGER NOT NULL CHECK(expires_at>=0)
) STRICT;
CREATE TABLE sync_tasks (
  delete_requested INTEGER NOT NULL DEFAULT 0 CHECK(delete_requested IN (0,1)),
 task_id TEXT PRIMARY KEY,
 peer_id TEXT NOT NULL REFERENCES sync_peers(peer_id),
 peer_revision TEXT NOT NULL,
 direction TEXT NOT NULL CHECK(direction IN ('pull','proposal')),
 phase TEXT NOT NULL DEFAULT 'discover' CHECK(phase IN ('discover','await_confirmation','transfer','apply','cleanup','done')),
 status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','running','waiting','paused','cancel_requested','cancelled','done')),
 grant_revision TEXT NOT NULL,
 grant_enabled INTEGER NOT NULL DEFAULT 0 CHECK(grant_enabled IN (0,1)),
 scope_json TEXT NOT NULL CHECK(json_valid(scope_json) AND length(CAST(scope_json AS BLOB))<=16384),
 progress_seq INTEGER NOT NULL DEFAULT 0 CHECK(progress_seq>=0),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 lease_token TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0 CHECK(lease_until>=0),
 attempt_id TEXT,
 attempt_start_seq INTEGER NOT NULL DEFAULT 0,
 reconciled_attempt_id TEXT,
 next_run_at INTEGER NOT NULL DEFAULT 0 CHECK(next_run_at>=0),
 no_progress_count INTEGER NOT NULL DEFAULT 0 CHECK(no_progress_count>=0),
 total_errors INTEGER NOT NULL DEFAULT 0 CHECK(total_errors>=0),
 fast_retries INTEGER NOT NULL DEFAULT 30 CHECK(fast_retries BETWEEN 0 AND 1000),
 slice_bytes INTEGER NOT NULL DEFAULT 32768 CHECK(slice_bytes BETWEEN 4096 AND 4194304),
 min_slice_bytes INTEGER NOT NULL DEFAULT 4096 CHECK(min_slice_bytes BETWEEN 4096 AND slice_bytes),
 initial_slice_bytes INTEGER NOT NULL DEFAULT 32768 CHECK(initial_slice_bytes BETWEEN 4096 AND 4194304),
 auto_shrink INTEGER NOT NULL DEFAULT 1 CHECK(auto_shrink IN (0,1)),
 slow_retry_seconds INTEGER NOT NULL DEFAULT 3600 CHECK(slow_retry_seconds BETWEEN 60 AND 86400),
 last_error TEXT CHECK(last_error IS NULL OR length(last_error)<=500),
 created_at INTEGER NOT NULL,
 last_progress_at INTEGER,
 operation_id TEXT NOT NULL UNIQUE,
 grant_id TEXT REFERENCES sync_grants(grant_id),
 mode TEXT NOT NULL DEFAULT 'manual' CHECK(mode IN ('manual','scheduled','proposal')),
 write_authorized INTEGER NOT NULL DEFAULT 0 CHECK(write_authorized IN (0,1)),
 auto_confirm INTEGER NOT NULL DEFAULT 0 CHECK(auto_confirm IN (0,1)),
 auto_delete INTEGER NOT NULL DEFAULT 0 CHECK(auto_delete IN (0,1)),
 confirmation_id TEXT,
 cancel_intent INTEGER NOT NULL DEFAULT 0 CHECK(cancel_intent IN (0,1)),
 last_dispatched_at INTEGER NOT NULL DEFAULT 0,
 discovery_cursor TEXT CHECK(discovery_cursor IS NULL OR (json_valid(discovery_cursor) AND length(CAST(discovery_cursor AS BLOB))<=2048))
) STRICT;
CREATE INDEX sync_tasks_due ON sync_tasks(status,next_run_at,created_at,task_id);
CREATE TABLE sync_items (
 task_id TEXT NOT NULL REFERENCES sync_tasks(task_id) ON DELETE CASCADE,
 item_id TEXT NOT NULL,
 module TEXT NOT NULL,
 record_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('upsert','delete')),
 source_version TEXT NOT NULL,
 target_version TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','staged','applied','conflict')),
 staged_bytes INTEGER NOT NULL DEFAULT 0 CHECK(staged_bytes BETWEEN 0 AND 1048576),
 apply_key TEXT NOT NULL UNIQUE,
 selected INTEGER NOT NULL DEFAULT 0 CHECK(selected IN (0,1)),
 manifest_json TEXT CHECK(manifest_json IS NULL OR (json_valid(manifest_json) AND length(CAST(manifest_json AS BLOB))<=8192)),
 PRIMARY KEY(task_id,item_id),
 UNIQUE(task_id,module,record_id)
) STRICT;
CREATE TABLE sync_parts (
 task_id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 field TEXT NOT NULL,
 offset INTEGER NOT NULL CHECK(offset>=0),
 data BLOB NOT NULL CHECK(length(data) BETWEEN 1 AND 4194304),
 PRIMARY KEY(task_id,item_id,field,offset),
 FOREIGN KEY(task_id,item_id) REFERENCES sync_items(task_id,item_id) ON DELETE CASCADE
) STRICT;
CREATE TABLE sync_files (
 task_id TEXT NOT NULL REFERENCES sync_tasks(task_id) ON DELETE CASCADE,
 file_id TEXT NOT NULL,
 source_version TEXT NOT NULL,
 total_bytes INTEGER NOT NULL CHECK(total_bytes BETWEEN 0 AND 1073741824),
 committed_bytes INTEGER NOT NULL DEFAULT 0 CHECK(committed_bytes BETWEEN 0 AND total_bytes),
 storage_kind TEXT NOT NULL CHECK(storage_kind IN ('local','r2')),
 staging_key TEXT NOT NULL UNIQUE,
 operation_id TEXT NOT NULL UNIQUE,
 upload_id TEXT,
 part_bytes INTEGER NOT NULL CHECK(part_bytes>0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','transferring','uploaded','published','cleanup','done')),
 item_id TEXT,
 source_file_id TEXT,
 CHECK(storage_kind!='r2' OR part_bytes>=5242880),
 PRIMARY KEY(task_id,file_id)
) STRICT;
CREATE TABLE sync_file_parts (
 task_id TEXT NOT NULL,
 file_id TEXT NOT NULL,
 part_number INTEGER NOT NULL CHECK(part_number BETWEEN 1 AND 10000),
 offset INTEGER NOT NULL CHECK(offset>=0),
 length INTEGER NOT NULL CHECK(length>0),
 etag TEXT NOT NULL,
 PRIMARY KEY(task_id,file_id,part_number),
 FOREIGN KEY(task_id,file_id) REFERENCES sync_files(task_id,file_id) ON DELETE CASCADE
) STRICT;
CREATE TABLE sync_schedules (
 schedule_id TEXT PRIMARY KEY,
 peer_id TEXT NOT NULL REFERENCES sync_peers(peer_id),
 grant_id TEXT NOT NULL REFERENCES sync_grants(grant_id),
 scope_json TEXT NOT NULL CHECK(json_valid(scope_json) AND length(CAST(scope_json AS BLOB))<=16384),
 interval_seconds INTEGER NOT NULL CHECK(interval_seconds BETWEEN 60 AND 2592000),
 next_run_at INTEGER NOT NULL CHECK(next_run_at>=0),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 revision TEXT NOT NULL,
 last_task_id TEXT REFERENCES sync_tasks(task_id),
 settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json) AND length(settings_json)<=2048)
) STRICT;
CREATE INDEX sync_schedules_due ON sync_schedules(enabled,next_run_at,schedule_id);

CREATE TABLE sync_connections(peer_id TEXT PRIMARY KEY REFERENCES sync_peers(peer_id) ON DELETE CASCADE,owner_uid TEXT NOT NULL REFERENCES auth_users(uid) ON DELETE CASCADE,export_scope_json TEXT NOT NULL CHECK(json_valid(export_scope_json)),incoming_auto_scope TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(incoming_auto_scope)),incoming_auto_delete INTEGER NOT NULL DEFAULT 0 CHECK(incoming_auto_delete IN (0,1))) STRICT;
CREATE TABLE sync_tombstones(module TEXT NOT NULL,record_id TEXT NOT NULL,version TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(module,record_id)) STRICT;
CREATE INDEX sync_tombstones_latest ON sync_tombstones(module,updated DESC,record_id);
CREATE TABLE sync_exports(request_id TEXT NOT NULL DEFAULT '' CHECK(length(request_id)<=128),module TEXT NOT NULL,record_id TEXT NOT NULL,version TEXT NOT NULL,body BLOB NOT NULL CHECK(length(body)<=1048576),body_sha256 TEXT CHECK(body_sha256 IS NULL OR length(body_sha256)=64),files_json TEXT NOT NULL CHECK(json_valid(files_json) AND length(files_json)<=16000),expires_at INTEGER NOT NULL,PRIMARY KEY(module,record_id,version,request_id)) STRICT;
CREATE INDEX sync_exports_expiry ON sync_exports(expires_at);
CREATE TABLE sync_media_versions(peer_id TEXT NOT NULL,source_uid TEXT NOT NULL,source_version TEXT NOT NULL,target_uid TEXT NOT NULL REFERENCES media_assets(uid) ON DELETE CASCADE,PRIMARY KEY(peer_id,source_uid,source_version)) STRICT;

CREATE INDEX sync_latest_profiles ON "profiles"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_profiles AFTER DELETE ON "profiles" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('profiles',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_profiles AFTER INSERT ON "profiles" BEGIN DELETE FROM sync_tombstones WHERE module='profiles' AND record_id=NEW.uid; END;

CREATE INDEX sync_latest_students ON "students"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_students AFTER DELETE ON "students" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('students',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_students AFTER INSERT ON "students" BEGIN DELETE FROM sync_tombstones WHERE module='students' AND record_id=NEW.uid; END;

CREATE INDEX sync_latest_research_interests ON "research_interests"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_research_interests AFTER DELETE ON "research_interests" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('research_interests',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_research_interests AFTER INSERT ON "research_interests" BEGIN DELETE FROM sync_tombstones WHERE module='research_interests' AND record_id=NEW.uid; END;

CREATE INDEX sync_latest_projects ON "projects"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_projects AFTER DELETE ON "projects" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('projects',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_projects AFTER INSERT ON "projects" BEGIN DELETE FROM sync_tombstones WHERE module='projects' AND record_id=NEW.uid; END;

CREATE INDEX sync_latest_publications ON "publications"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_publications AFTER DELETE ON "publications" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('publications',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_publications AFTER INSERT ON "publications" BEGIN DELETE FROM sync_tombstones WHERE module='publications' AND record_id=NEW.uid; END;

CREATE INDEX sync_latest_patents ON "patents"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_patents AFTER DELETE ON "patents" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('patents',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_patents AFTER INSERT ON "patents" BEGIN DELETE FROM sync_tombstones WHERE module='patents' AND record_id=NEW.uid; END;

CREATE INDEX sync_latest_courses ON "courses"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_courses AFTER DELETE ON "courses" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('courses',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_courses AFTER INSERT ON "courses" BEGIN DELETE FROM sync_tombstones WHERE module='courses' AND record_id=NEW.uid; END;

CREATE INDEX sync_latest_news ON "news"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_news AFTER DELETE ON "news" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('news',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_news AFTER INSERT ON "news" BEGIN DELETE FROM sync_tombstones WHERE module='news' AND record_id=NEW.uid; END;

CREATE INDEX sync_latest_student_category_displays ON "student_category_displays"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_student_category_displays AFTER DELETE ON "student_category_displays" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('student_category_displays',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_student_category_displays AFTER INSERT ON "student_category_displays" BEGIN DELETE FROM sync_tombstones WHERE module='student_category_displays' AND record_id=NEW.uid; END;

CREATE INDEX sync_latest_navigation_items ON "navigation_items"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_navigation_items AFTER DELETE ON "navigation_items" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('navigation_items',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_navigation_items AFTER INSERT ON "navigation_items" BEGIN DELETE FROM sync_tombstones WHERE module='navigation_items' AND record_id=NEW.uid; END;

CREATE INDEX sync_latest_site_settings ON "site_settings"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_site_settings AFTER DELETE ON "site_settings" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('site_settings',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_site_settings AFTER INSERT ON "site_settings" BEGIN DELETE FROM sync_tombstones WHERE module='site_settings' AND record_id=NEW.uid; END;

CREATE INDEX sync_latest_translation_cache ON "translation_cache"(updated_at DESC,uid);
CREATE TRIGGER sync_deleted_translation_cache AFTER DELETE ON "translation_cache" BEGIN
 INSERT INTO sync_tombstones(module,record_id,version,updated) VALUES('translation_cache',OLD.uid,strftime('%Y-%m-%dT%H:%M:%fZ','now'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(module,record_id) DO UPDATE SET version=excluded.version,updated=excluded.updated;
END;
CREATE TRIGGER sync_revived_translation_cache AFTER INSERT ON "translation_cache" BEGIN DELETE FROM sync_tombstones WHERE module='translation_cache' AND record_id=NEW.uid; END;

CREATE TRIGGER sync_revoke_auth_users_update AFTER UPDATE OF status,role_uid,must_change_password,password_hash ON auth_users BEGIN UPDATE sync_grants SET enabled=0 WHERE principal_id=OLD.uid; END;

CREATE TRIGGER sync_revoke_auth_users_delete AFTER DELETE ON auth_users BEGIN UPDATE sync_grants SET enabled=0 WHERE principal_id=OLD.uid; END;

CREATE TRIGGER sync_revoke_auth_roles_update AFTER UPDATE ON auth_roles BEGIN UPDATE sync_grants SET enabled=0 WHERE principal_id IN (SELECT uid FROM auth_users WHERE role_uid=OLD.uid); END;

CREATE TRIGGER sync_revoke_auth_roles_delete AFTER DELETE ON auth_roles BEGIN UPDATE sync_grants SET enabled=0 WHERE principal_id IN (SELECT uid FROM auth_users WHERE role_uid=OLD.uid); END;

CREATE TRIGGER sync_revoke_auth_permissions_update AFTER UPDATE ON auth_permissions BEGIN UPDATE sync_grants SET enabled=0 WHERE principal_id IN (SELECT uid FROM auth_users WHERE role_uid=OLD.role_uid); END;

CREATE TRIGGER sync_revoke_auth_permissions_delete AFTER DELETE ON auth_permissions BEGIN UPDATE sync_grants SET enabled=0 WHERE principal_id IN (SELECT uid FROM auth_users WHERE role_uid=OLD.role_uid); END;

CREATE TABLE sync_record_receipts(task_id TEXT NOT NULL REFERENCES sync_tasks(task_id) ON DELETE CASCADE,module TEXT NOT NULL,record_id TEXT NOT NULL,version TEXT NOT NULL,PRIMARY KEY(task_id,module,record_id)) STRICT;

-- Bounded operational history: metadata only, no bodies, tokens or credentials.
CREATE TABLE sync_events (
 event_id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES sync_tasks(task_id),
 occurred_at INTEGER NOT NULL, kind TEXT NOT NULL, level TEXT NOT NULL,
 phase TEXT NOT NULL, status TEXT NOT NULL, progress_seq INTEGER NOT NULL,
 next_run_at INTEGER NOT NULL, slice_bytes INTEGER NOT NULL, attempt_id TEXT,
 detail TEXT NOT NULL CHECK(json_valid(detail) AND length(detail)<=6000)
) STRICT;
CREATE INDEX sync_events_task ON sync_events(task_id,event_id DESC);
CREATE INDEX sync_tasks_delete ON sync_tasks(delete_requested,status);

-- Lightweight admin summary pagination; no runtime task changes.
CREATE INDEX sync_tasks_monitor ON sync_tasks(grant_id,created_at DESC,task_id DESC);
CREATE INDEX sync_tasks_monitor_status ON sync_tasks(grant_id,status,created_at DESC,task_id DESC);
