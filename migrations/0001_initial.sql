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
  highlight_gbt TEXT,
  highlight_elsevier TEXT,
  highlight_apa TEXT,
  highlight_ieee TEXT,
  publication_type TEXT,
  author_role TEXT,
  corresponding_authors TEXT,
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
  storage_kind TEXT DEFAULT 'static',
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

CREATE INDEX IF NOT EXISTS idx_navigation_enabled_location_sort ON navigation_items(enabled, location, sort_order);
CREATE INDEX IF NOT EXISTS idx_navigation_kind_location ON navigation_items(kind, location);
CREATE INDEX IF NOT EXISTS idx_profiles_admin_sort ON profiles(is_active, is_featured, sort_order);
CREATE INDEX IF NOT EXISTS idx_profiles_role_title ON profiles(role, title, organization, lab);
CREATE INDEX IF NOT EXISTS idx_research_visibility_sort ON research_interests(visibility, sort_order);
CREATE INDEX IF NOT EXISTS idx_publications_admin_filters ON publications(visibility, year, publication_type, author_role, index_type);
CREATE INDEX IF NOT EXISTS idx_publications_venue_year ON publications(venue, year);
CREATE INDEX IF NOT EXISTS idx_publications_featured_year ON publications(is_featured, year);
CREATE INDEX IF NOT EXISTS idx_projects_admin_filters ON projects(visibility, status, source, is_featured, sort_order);
CREATE INDEX IF NOT EXISTS idx_projects_fund_sort ON projects(fund_name, sort_order);
CREATE INDEX IF NOT EXISTS idx_patents_admin_filters ON patents(visibility, patent_type, legal_status, is_featured, sort_order);
CREATE INDEX IF NOT EXISTS idx_patents_country_sort ON patents(country, sort_order);
CREATE INDEX IF NOT EXISTS idx_students_admin_filters ON students(visibility, degree, category, grade, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_students_featured_sort ON students(is_featured, sort_order);
CREATE INDEX IF NOT EXISTS idx_student_category_enabled_order ON student_category_displays(enabled, display_order);
CREATE INDEX IF NOT EXISTS idx_news_admin_filters ON news(visibility, category, content_format, is_featured, published_at);
CREATE INDEX IF NOT EXISTS idx_news_slug ON news(slug);
CREATE INDEX IF NOT EXISTS idx_courses_admin_filters ON courses(visibility, semester, audience, is_featured, sort_order);
CREATE INDEX IF NOT EXISTS idx_courses_material_visibility ON courses(material_visibility, sort_order);
CREATE INDEX IF NOT EXISTS idx_messages_admin_filters ON messages(visibility, message_type, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_storage_status ON media_assets(storage_kind, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_status_updated ON media_assets(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_status_mime ON media_assets(status, mime_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_mime_status ON media_assets(mime_type, status);
CREATE INDEX IF NOT EXISTS idx_translation_cache_lookup ON translation_cache(source_ref_key, target_lang, is_current);
CREATE INDEX IF NOT EXISTS idx_translation_cache_status_updated ON translation_cache(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_auth_roles_level ON auth_roles(is_active, level);
CREATE INDEX IF NOT EXISTS idx_auth_permissions_module ON auth_permissions(module, sort_order);

-- Minimal bootstrap data for fresh deployments.

-- This keeps a brand-new site configurable and navigable without importing private/demo content.

INSERT OR IGNORE INTO site_settings (
  uid, is_active, site_name, site_name_en, hero_title, hero_subtitle, logo_key, favicon_key, og_image_key, seo_title, seo_description, seo_keywords, footer_text, homepage_profile_uid, homepage_publication_limit, homepage_news_limit
) VALUES (
  'site-default', 1, '教师个人主页', 'Academic Research Website', '机械工程与智能制造', '面向机械装备、智能制造与可靠人工智能的教学科研网站。', 'default/site-logo-ai-256.png', 'default/site-logo-ai-256.png', 'default/site-logo.png', '教师个人主页 | 机械工程与人工智能', '机械工程、智能制造、人工智能与可靠系统方向的教师个人主页。', '机械工程,智能制造,人工智能,可靠系统,学术主页', '<div class="site-footer-mini"><span>Academic Research Website</span><span>Mechanical Engineering · Intelligent Manufacturing · AI</span></div>', '', 5, 4
);

INSERT OR IGNORE INTO global_settings (
  uid, allow_public_registration, allow_anonymous_messages, upload_max_size_mb, upload_allowed_extensions, media_trash_retention_days, news_pdf_engine, news_pdf_allow_download, news_pdf_watermark, translation_provider, translation_providers, libretranslate_url, libretranslate_api_key, deepl_api_key, google_translate_api_key, microsoft_translator_key, microsoft_translator_region, microsoft_translator_endpoint, mymemory_email, translation_batch_size, translation_worker_count, translation_timeout_seconds, translation_job_state, publication_metadata_provider, publication_metadata_providers, publication_display_style, publication_suggestion_cache_seconds, profile_suggestion_cache_seconds, project_suggestion_cache_seconds, patent_suggestion_cache_seconds, student_suggestion_cache_seconds, news_suggestion_cache_seconds, course_suggestion_cache_seconds, patent_metadata_providers, patentsview_api_key, epo_ops_client_id, epo_ops_client_secret, notify_email
) VALUES (
  'global-default', 0, 1, 10, '.jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.mp4,.webm,.mp3,.wav', 30, 'native', 1, '', 'auto', 'auto,libretranslate,deepl_free,google_translate,microsoft_translator,mymemory,argos_local', 'https://translate.terraprint.co', '', '', '', '', '', 'https://api.cognitive.microsofttranslator.com', '', 10, 4, 12, '{}', 'crossref', 'crossref,openalex,semantic_scholar', 'gbt', 30, 30, 30, 30, 30, 30, 30, 'patentsview,epo_ops', '', '', '', ''
);



UPDATE global_settings
SET libretranslate_url = 'https://translate.terraprint.co'
WHERE uid = 'global-default'
  AND (libretranslate_url IS NULL OR TRIM(libretranslate_url) = '');

INSERT OR IGNORE INTO navigation_items (
  uid, title, title_en, kind, url_name, path, fragment, icon, style, location, visibility, enabled, sort_order
) VALUES
  ('nav-home', '首页', 'Home', 'route', 'home', '/', '', '', 'link', 'header', 'public', 1, 10),
  ('nav-team', '团队', 'Team', 'route', 'team', '/team', '', '', 'link', 'header', 'public', 1, 20),
  ('nav-projects', '项目', 'Projects', 'route', 'projects', '/projects', '', '', 'link', 'header', 'public', 1, 30),
  ('nav-featured-publications', '代表论文', 'Featured Papers', 'route', 'featured_publications', '/featured-publications', '', '', 'link', 'header', 'public', 1, 40),
  ('nav-publications', '论文', 'Publications', 'route', 'publications', '/publications', '', '', 'link', 'header', 'public', 1, 50),
  ('nav-patents', '专利与软著', 'Patents & Software', 'route', 'patents', '/patents', '', '', 'link', 'header', 'public', 1, 60),
  ('nav-students', '学生', 'Students', 'route', 'students', '/students', '', '', 'link', 'header', 'public', 1, 70),
  ('nav-news', '动态', 'News', 'route', 'news', '/news', '', '', 'link', 'header', 'public', 1, 80),
  ('nav-courses', '课程', 'Courses', 'route', 'courses', '/courses', '', '', 'link', 'header', 'public', 1, 90),
  ('nav-transfer-site', '文件传输', 'File Transfer', 'route', 'transfer', '/transfer', '', 'send', 'link', 'header', 'authenticated', 1, 95),
  ('nav-contact', '联系', 'Contact', 'route', 'contact', '/contact', '', '', 'link', 'header', 'public', 1, 100),
  ('nav-admin-transfer-site', '文件传输控制', 'Transfer Control', 'route', 'admin-transfer', '/admin/transfer', '', 'upload-cloud', 'link', 'admin_sidebar', 'staff', 1, 95);

INSERT OR IGNORE INTO media_assets (
  uid, object_key, title, category, mime_type, size, storage_kind, status, checksum
) VALUES
  ('media-default-logo-ai', 'default/site-logo-ai-256.png', '默认 AI Logo', 'branding', 'image/png', 84326, 'static', 'active', ''),
  ('media-default-logo', 'default/site-logo.png', '默认站点 Logo', 'branding', 'image/png', 80518, 'static', 'active', ''),
  ('media-default-logo-alt', 'default/site-logo2.png', '默认站点 Logo 备选', 'branding', 'image/png', 252635, 'static', 'active', ''),
  ('media-default-teacher-male', 'default/teacher-male-avatar.png', '默认男性教师头像', 'avatar', 'image/png', 18025, 'static', 'active', ''),
  ('media-default-teacher-female', 'default/teacher-female-avatar.png', '默认女性教师头像', 'avatar', 'image/png', 21382, 'static', 'active', ''),
  ('media-default-student-male', 'default/student-male-avatar.png', '默认男性学生头像', 'avatar', 'image/png', 18588, 'static', 'active', ''),
  ('media-default-student-female', 'default/student-female-avatar.png', '默认女性学生头像', 'avatar', 'image/png', 20604, 'static', 'active', '');

INSERT OR IGNORE INTO auth_roles (
  uid, name, level, description, visibility_scopes, is_system, is_active, sort_order
) VALUES
  ('role-super-admin', '高级管理员', 100, '拥有站点、权限、内容、媒体、导出等全部后台权限。', 'public,authenticated,staff,owner', 1, 1, 10),
  ('role-admin', '普通管理员', 80, '默认可维护主要内容与媒体，不默认管理账号权限。', 'public,authenticated,staff', 1, 1, 20),
  ('role-staff', '员工', 40, '默认可查看后台并维护动态、留言、学生等日常内容。', 'public,authenticated,staff', 1, 1, 30),
  ('role-visitor', '访客用户', 10, '用于登录后查看受限前台内容，默认不能进入后台。', 'public,authenticated', 1, 1, 40);

-- Permission defaults are generated from the same role/module policy as ensure_auth_defaults().

INSERT OR IGNORE INTO auth_permissions (
  uid, role_uid, module, can_view, can_create, can_edit, can_delete, can_export, sort_order
) VALUES
  ('perm-67d19b548697', 'role-super-admin', 'admin', 1, 1, 1, 1, 1, 1),
  ('perm-51d531c21946', 'role-super-admin', 'export', 1, 1, 1, 1, 1, 2),
  ('perm-2faf1f3dfea2', 'role-super-admin', 'media_tools', 1, 1, 1, 1, 1, 3),
  ('perm-284c9f34c147', 'role-super-admin', 'site_settings', 1, 1, 1, 1, 1, 4),
  ('perm-59917d9ea1c6', 'role-super-admin', 'global_settings', 1, 1, 1, 1, 1, 5),
  ('perm-672faa8cf00e', 'role-super-admin', 'navigation_items', 1, 1, 1, 1, 1, 6),
  ('perm-bcb6a66f4681', 'role-super-admin', 'profiles', 1, 1, 1, 1, 1, 7),
  ('perm-42ba239fdd63', 'role-super-admin', 'research_interests', 1, 1, 1, 1, 1, 8),
  ('perm-fb1c31f44b5f', 'role-super-admin', 'publications', 1, 1, 1, 1, 1, 9),
  ('perm-6bea0eda0346', 'role-super-admin', 'projects', 1, 1, 1, 1, 1, 10),
  ('perm-3b470ea7b4af', 'role-super-admin', 'patents', 1, 1, 1, 1, 1, 11),
  ('perm-8543defe4366', 'role-super-admin', 'students', 1, 1, 1, 1, 1, 12),
  ('perm-e32474da81f1', 'role-super-admin', 'student_category_displays', 1, 1, 1, 1, 1, 13),
  ('perm-a5f858ac002b', 'role-super-admin', 'news', 1, 1, 1, 1, 1, 14),
  ('perm-6530b47441e1', 'role-super-admin', 'courses', 1, 1, 1, 1, 1, 15),
  ('perm-f4d8cc993c46', 'role-super-admin', 'messages', 1, 1, 1, 1, 1, 16),
  ('perm-323a66d24ea9', 'role-super-admin', 'media_assets', 1, 1, 1, 1, 1, 17),
  ('perm-83e528ae11b3', 'role-super-admin', 'translation_cache', 1, 1, 1, 1, 1, 18),
  ('perm-06c2a4fba9e9', 'role-super-admin', 'operation_logs', 1, 1, 1, 1, 1, 20),
  ('perm-13b3eb0243c3', 'role-super-admin', 'auth_roles', 1, 1, 1, 1, 1, 21),
  ('perm-d7b19f9a430c', 'role-super-admin', 'auth_users', 1, 1, 1, 1, 1, 22),
  ('perm-f3b776cd402e', 'role-super-admin', 'auth_permissions', 1, 1, 1, 1, 1, 23),
  ('perm-e320410854bf', 'role-admin', 'admin', 1, 0, 0, 0, 0, 1),
  ('perm-4a858c15f8c9', 'role-admin', 'export', 1, 0, 0, 0, 1, 2),
  ('perm-8884719678e3', 'role-admin', 'media_tools', 1, 0, 0, 0, 0, 3),
  ('perm-6d15dde1741a', 'role-admin', 'site_settings', 0, 0, 0, 0, 0, 4),
  ('perm-c5b45d44fdf6', 'role-admin', 'global_settings', 0, 0, 0, 0, 0, 5),
  ('perm-00db4b3ef09a', 'role-admin', 'navigation_items', 1, 1, 1, 1, 0, 6),
  ('perm-109c5ace7015', 'role-admin', 'profiles', 1, 1, 1, 1, 0, 7),
  ('perm-1dba743e1069', 'role-admin', 'research_interests', 1, 1, 1, 1, 0, 8),
  ('perm-4759e06c823f', 'role-admin', 'publications', 1, 1, 1, 1, 0, 9),
  ('perm-12a574d46d0b', 'role-admin', 'projects', 1, 1, 1, 1, 0, 10),
  ('perm-f346d27d54ba', 'role-admin', 'patents', 1, 1, 1, 1, 0, 11),
  ('perm-a877bb01e356', 'role-admin', 'students', 1, 1, 1, 1, 0, 12),
  ('perm-b3703443a4bb', 'role-admin', 'student_category_displays', 1, 1, 1, 1, 0, 13),
  ('perm-bbf8727dc18f', 'role-admin', 'news', 1, 1, 1, 1, 0, 14),
  ('perm-905e4685bd01', 'role-admin', 'courses', 1, 1, 1, 1, 0, 15),
  ('perm-bdc6577bbf0b', 'role-admin', 'messages', 1, 1, 1, 1, 0, 16),
  ('perm-dbce9f72cea0', 'role-admin', 'media_assets', 1, 1, 1, 1, 0, 17),
  ('perm-2f39fd579906', 'role-admin', 'translation_cache', 1, 1, 1, 0, 0, 18),
  ('perm-01a5443430a9', 'role-admin', 'operation_logs', 0, 0, 0, 0, 0, 20),
  ('perm-b85787ab6348', 'role-admin', 'auth_roles', 0, 0, 0, 0, 0, 21),
  ('perm-c8b94ea461d6', 'role-admin', 'auth_users', 0, 0, 0, 0, 0, 22),
  ('perm-6b4393ea0c18', 'role-admin', 'auth_permissions', 0, 0, 0, 0, 0, 23),
  ('perm-38319c375640', 'role-staff', 'admin', 1, 0, 0, 0, 0, 1),
  ('perm-c2f80be4653c', 'role-staff', 'export', 0, 0, 0, 0, 0, 2),
  ('perm-45b187698cdc', 'role-staff', 'media_tools', 1, 0, 0, 0, 0, 3),
  ('perm-62efb7969136', 'role-staff', 'site_settings', 0, 0, 0, 0, 0, 4),
  ('perm-e1a944174d12', 'role-staff', 'global_settings', 0, 0, 0, 0, 0, 5),
  ('perm-f1011298e2c6', 'role-staff', 'navigation_items', 0, 0, 0, 0, 0, 6),
  ('perm-2029e46d4a1b', 'role-staff', 'profiles', 0, 0, 0, 0, 0, 7),
  ('perm-38781cc720e4', 'role-staff', 'research_interests', 0, 0, 0, 0, 0, 8),
  ('perm-e79a4eabccb2', 'role-staff', 'publications', 0, 0, 0, 0, 0, 9),
  ('perm-f919636c5c05', 'role-staff', 'projects', 0, 0, 0, 0, 0, 10),
  ('perm-9b23b897543b', 'role-staff', 'patents', 0, 0, 0, 0, 0, 11),
  ('perm-6cf7140d2ff1', 'role-staff', 'students', 1, 0, 1, 0, 0, 12),
  ('perm-3a6e171bc0bf', 'role-staff', 'student_category_displays', 1, 0, 1, 0, 0, 13),
  ('perm-9a24314cd22e', 'role-staff', 'news', 1, 1, 1, 0, 0, 14),
  ('perm-263897d9bc01', 'role-staff', 'courses', 0, 0, 0, 0, 0, 15),
  ('perm-442dc313873c', 'role-staff', 'messages', 1, 0, 1, 0, 0, 16),
  ('perm-9d0fa3dc8306', 'role-staff', 'media_assets', 1, 1, 1, 0, 0, 17),
  ('perm-239e936cdd30', 'role-staff', 'translation_cache', 0, 0, 0, 0, 0, 18),
  ('perm-a4f3b90d7eb1', 'role-staff', 'operation_logs', 0, 0, 0, 0, 0, 20),
  ('perm-083e7510ac9c', 'role-staff', 'auth_roles', 0, 0, 0, 0, 0, 21),
  ('perm-60034c156055', 'role-staff', 'auth_users', 0, 0, 0, 0, 0, 22),
  ('perm-a456d0b294bb', 'role-staff', 'auth_permissions', 0, 0, 0, 0, 0, 23),
  ('perm-15b898cfbf5d', 'role-visitor', 'admin', 0, 0, 0, 0, 0, 1),
  ('perm-66165b516691', 'role-visitor', 'export', 0, 0, 0, 0, 0, 2),
  ('perm-90912b7bf3b7', 'role-visitor', 'media_tools', 0, 0, 0, 0, 0, 3),
  ('perm-b792bc0d4d69', 'role-visitor', 'site_settings', 0, 0, 0, 0, 0, 4),
  ('perm-27fa9887b901', 'role-visitor', 'global_settings', 0, 0, 0, 0, 0, 5),
  ('perm-ee170fe6d429', 'role-visitor', 'navigation_items', 0, 0, 0, 0, 0, 6),
  ('perm-db9b495f25d2', 'role-visitor', 'profiles', 0, 0, 0, 0, 0, 7),
  ('perm-6025d807a548', 'role-visitor', 'research_interests', 0, 0, 0, 0, 0, 8),
  ('perm-d9fca704a91a', 'role-visitor', 'publications', 0, 0, 0, 0, 0, 9),
  ('perm-57925c6dd5b7', 'role-visitor', 'projects', 0, 0, 0, 0, 0, 10),
  ('perm-27a02d30fd20', 'role-visitor', 'patents', 0, 0, 0, 0, 0, 11),
  ('perm-f6a6fed662aa', 'role-visitor', 'students', 0, 0, 0, 0, 0, 12),
  ('perm-3dc8255f5c2a', 'role-visitor', 'student_category_displays', 0, 0, 0, 0, 0, 13),
  ('perm-a088c8ef266c', 'role-visitor', 'news', 0, 0, 0, 0, 0, 14),
  ('perm-b453224e35cb', 'role-visitor', 'courses', 0, 0, 0, 0, 0, 15),
  ('perm-f9c42c693471', 'role-visitor', 'messages', 0, 0, 0, 0, 0, 16),
  ('perm-4134da1e3805', 'role-visitor', 'media_assets', 0, 0, 0, 0, 0, 17),
  ('perm-d2673ef02283', 'role-visitor', 'translation_cache', 0, 0, 0, 0, 0, 18),
  ('perm-4f4ef8f0c700', 'role-visitor', 'operation_logs', 0, 0, 0, 0, 0, 20),
  ('perm-08ec45ca190c', 'role-visitor', 'auth_roles', 0, 0, 0, 0, 0, 21),
  ('perm-243ce2e26db3', 'role-visitor', 'auth_users', 0, 0, 0, 0, 0, 22),
  ('perm-d9a1e1b5161b', 'role-visitor', 'auth_permissions', 0, 0, 0, 0, 0, 23);
