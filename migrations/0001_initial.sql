-- Teacher academic website database bootstrap for Cloudflare D1 / SQLite.
-- Fresh install only: paste or execute this whole file on an empty database.
-- Generated as a consolidated schema so Cloudflare initialization does not
-- need to run many incremental ALTER TABLE migrations.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  is_active INTEGER,
  site_name TEXT,
  site_name_en TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  logo_key TEXT,
  favicon_key TEXT,
  og_image_key TEXT,
  seo_title TEXT,
  seo_description TEXT,
  seo_keywords TEXT,
  footer_text TEXT,
  homepage_profile_uid TEXT,
  homepage_publication_limit INTEGER,
  homepage_news_limit INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS global_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  allow_public_registration INTEGER,
  allow_anonymous_messages INTEGER,
  upload_max_size_mb INTEGER,
  upload_allowed_extensions TEXT,
  media_trash_retention_days INTEGER DEFAULT 30,
  news_pdf_engine TEXT,
  news_pdf_allow_download INTEGER,
  news_pdf_watermark TEXT,
  translation_provider TEXT,
  translation_providers TEXT,
  libretranslate_url TEXT,
  libretranslate_api_key TEXT,
  deepl_api_key TEXT,
  google_translate_api_key TEXT,
  microsoft_translator_key TEXT,
  microsoft_translator_region TEXT,
  microsoft_translator_endpoint TEXT,
  mymemory_email TEXT,
  translation_batch_size INTEGER,
  translation_worker_count INTEGER,
  translation_timeout_seconds INTEGER,
  translation_job_state TEXT,
  publication_metadata_provider TEXT,
  publication_metadata_providers TEXT,
  publication_display_style TEXT,
  publication_suggestion_cache_seconds INTEGER DEFAULT 30,
  profile_suggestion_cache_seconds INTEGER DEFAULT 30,
  project_suggestion_cache_seconds INTEGER DEFAULT 30,
  patent_suggestion_cache_seconds INTEGER DEFAULT 30,
  student_suggestion_cache_seconds INTEGER DEFAULT 30,
  news_suggestion_cache_seconds INTEGER DEFAULT 30,
  course_suggestion_cache_seconds INTEGER DEFAULT 30,
  patent_metadata_providers TEXT DEFAULT 'patentsview,epo_ops',
  patentsview_api_key TEXT,
  epo_ops_client_id TEXT,
  epo_ops_client_secret TEXT,
  notify_email TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS navigation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  title TEXT,
  title_en TEXT,
  kind TEXT,
  url_name TEXT,
  path TEXT,
  fragment TEXT,
  icon TEXT,
  style TEXT,
  location TEXT,
  visibility TEXT,
  enabled INTEGER,
  sort_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  name TEXT,
  name_en TEXT,
  role TEXT,
  title TEXT,
  organization TEXT,
  lab TEXT,
  avatar_key TEXT,
  email TEXT,
  phone TEXT,
  office TEXT,
  bio TEXT,
  bio_en TEXT,
  education TEXT,
  experience TEXT,
  recruiting TEXT,
  orcid TEXT,
  personal_homepage TEXT,
  google_scholar TEXT,
  dblp TEXT,
  github TEXT,
  cnki TEXT,
  contact_visibility TEXT,
  visibility TEXT,
  is_active INTEGER,
  is_featured INTEGER,
  sort_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS research_interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  name TEXT,
  name_en TEXT,
  description TEXT,
  sort_order INTEGER,
  visibility TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  title TEXT,
  source_citation TEXT,
  authors TEXT,
  venue TEXT,
  year INTEGER,
  volume TEXT,
  issue TEXT,
  pages TEXT,
  doi TEXT,
  url TEXT,
  pdf_key TEXT,
  bibtex TEXT,
  citation_gbt TEXT,
  citation_elsevier TEXT,
  citation_apa TEXT,
  citation_ieee TEXT,
  publication_type TEXT,
  author_role TEXT,
  index_type TEXT,
  display_tags TEXT,
  abstract TEXT,
  keywords TEXT,
  pdf_visibility TEXT,
  visibility TEXT,
  is_featured INTEGER,
  sort_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  name TEXT,
  source TEXT,
  fund_name TEXT,
  project_number TEXT,
  principal TEXT,
  members TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT,
  amount INTEGER,
  summary TEXT,
  visibility TEXT,
  is_featured INTEGER,
  sort_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  name TEXT,
  country TEXT,
  patent_type TEXT,
  application_number TEXT,
  grant_number TEXT,
  application_date TEXT,
  grant_date TEXT,
  inventors TEXT,
  owner TEXT,
  legal_status TEXT,
  summary TEXT,
  certificate_key TEXT,
  visibility TEXT,
  is_featured INTEGER,
  sort_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  name TEXT,
  name_en TEXT,
  avatar_key TEXT,
  student_id TEXT,
  degree TEXT,
  category TEXT,
  grade TEXT,
  direction TEXT,
  status TEXT,
  email TEXT,
  homepage TEXT,
  enrollment_date TEXT,
  graduation_date TEXT,
  destination TEXT,
  awards TEXT,
  bio TEXT,
  contact_visibility TEXT,
  visibility TEXT,
  is_featured INTEGER,
  sort_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_category_displays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  key TEXT,
  label TEXT,
  label_en TEXT,
  keywords TEXT,
  enabled INTEGER,
  display_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  title TEXT,
  slug TEXT UNIQUE,
  category TEXT,
  cover_key TEXT,
  content TEXT,
  content_format TEXT,
  related_publication_uid TEXT,
  related_project_uid TEXT,
  related_student_uid TEXT,
  allow_comments INTEGER,
  published_at TEXT,
  visibility TEXT,
  is_featured INTEGER,
  sort_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  name TEXT,
  semester TEXT,
  audience TEXT,
  summary TEXT,
  syllabus_key TEXT,
  material_key TEXT,
  material_visibility TEXT,
  references_text TEXT,
  visibility TEXT,
  is_featured INTEGER,
  sort_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  name TEXT,
  email TEXT,
  message_type TEXT,
  subject TEXT,
  content TEXT,
  attachment_key TEXT,
  status TEXT,
  visibility TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  object_key TEXT UNIQUE,
  title TEXT,
  category TEXT,
  mime_type TEXT,
  size INTEGER,
  status TEXT DEFAULT 'active',
  checksum TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS translation_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  source_hash TEXT,
  source_ref_key TEXT,
  source_text TEXT,
  source_lang TEXT,
  target_lang TEXT,
  translated_text TEXT,
  provider TEXT,
  status TEXT,
  is_manual INTEGER,
  is_current INTEGER,
  source_refs TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS autofetch_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  source TEXT,
  query TEXT,
  success INTEGER,
  message TEXT,
  changes_json TEXT,
  publication_uid TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE NOT NULL,
  actor_uid TEXT,
  actor_name TEXT,
  action TEXT,
  module TEXT,
  target_uid TEXT,
  summary TEXT,
  detail_json TEXT,
  status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE NOT NULL,
  name TEXT,
  level INTEGER,
  description TEXT,
  visibility_scopes TEXT,
  is_system INTEGER,
  is_active INTEGER,
  sort_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  display_name TEXT,
  email TEXT,
  role_uid TEXT,
  status TEXT,
  must_change_password INTEGER,
  last_login_at TEXT,
  visibility TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE NOT NULL,
  role_uid TEXT,
  module TEXT,
  can_view INTEGER,
  can_create INTEGER,
  can_edit INTEGER,
  can_delete INTEGER,
  can_export INTEGER,
  sort_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_navigation_location ON navigation_items(location, enabled, sort_order);
CREATE INDEX IF NOT EXISTS idx_profiles_visible ON profiles(visibility, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_publications_visible_year ON publications(visibility, year);
CREATE INDEX IF NOT EXISTS idx_news_visible_date ON news(visibility, published_at);
CREATE INDEX IF NOT EXISTS idx_students_visible ON students(visibility, category, sort_order);
CREATE INDEX IF NOT EXISTS idx_media_assets_status ON media_assets(status, category);
CREATE INDEX IF NOT EXISTS idx_translation_cache_current ON translation_cache(is_current, status, source_hash);
CREATE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(username);
CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users(role_uid);
CREATE INDEX IF NOT EXISTS idx_auth_permissions_role_module ON auth_permissions(role_uid, module);
CREATE INDEX IF NOT EXISTS idx_operation_logs_actor ON operation_logs(actor_uid);
CREATE INDEX IF NOT EXISTS idx_operation_logs_module_action ON operation_logs(module, action);
CREATE INDEX IF NOT EXISTS idx_operation_logs_target ON operation_logs(target_uid);
