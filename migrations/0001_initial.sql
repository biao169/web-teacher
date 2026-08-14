PRAGMA foreign_keys = ON;

CREATE TABLE site_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_name TEXT NOT NULL DEFAULT '默认教师主页',
  is_active INTEGER NOT NULL DEFAULT 1,
  site_name TEXT NOT NULL DEFAULT '科研教师个人主页',
  site_name_en TEXT NOT NULL DEFAULT '',
  hero_title TEXT NOT NULL DEFAULT '',
  hero_title_en TEXT NOT NULL DEFAULT '',
  hero_subtitle TEXT NOT NULL DEFAULT '',
  hero_subtitle_en TEXT NOT NULL DEFAULT '',
  logo_key TEXT NOT NULL DEFAULT '',
  favicon_key TEXT NOT NULL DEFAULT '',
  og_image_key TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_title_en TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  seo_description_en TEXT NOT NULL DEFAULT '',
  seo_keywords TEXT NOT NULL DEFAULT '',
  seo_keywords_en TEXT NOT NULL DEFAULT '',
  footer_text TEXT NOT NULL DEFAULT '',
  footer_text_en TEXT NOT NULL DEFAULT '',
  homepage_profile_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE global_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_provider TEXT NOT NULL DEFAULT 'gtranslate',
  translation_default_source TEXT NOT NULL DEFAULT 'zh-CN',
  translation_default_target TEXT NOT NULL DEFAULT 'en',
  enable_site_translator INTEGER NOT NULL DEFAULT 1,
  allow_public_registration INTEGER NOT NULL DEFAULT 0,
  publication_metadata_provider TEXT NOT NULL DEFAULT 'crossref_openalex',
  publication_metadata_email TEXT NOT NULL DEFAULT '',
  crossref_endpoint TEXT NOT NULL DEFAULT 'https://api.crossref.org/works',
  openalex_endpoint TEXT NOT NULL DEFAULT 'https://api.openalex.org/works',
  publication_metadata_overwrite INTEGER NOT NULL DEFAULT 0,
  upload_max_size_mb INTEGER NOT NULL DEFAULT 20,
  upload_allowed_extensions TEXT NOT NULL DEFAULT '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.mp4,.webm',
  news_pdf_engine TEXT NOT NULL DEFAULT 'pdfjs',
  news_pdf_allow_download INTEGER NOT NULL DEFAULT 1,
  news_pdf_watermark TEXT NOT NULL DEFAULT '{site} · {user} · {date}',
  allow_anonymous_messages INTEGER NOT NULL DEFAULT 0,
  notify_email TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE navigation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  title_en TEXT NOT NULL DEFAULT '',
  url_name TEXT NOT NULL,
  fragment TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',
  organization_en TEXT NOT NULL DEFAULT '',
  lab TEXT NOT NULL DEFAULT '',
  lab_en TEXT NOT NULL DEFAULT '',
  avatar_key TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  office TEXT NOT NULL DEFAULT '',
  office_en TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  bio_en TEXT NOT NULL DEFAULT '',
  education TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  recruiting TEXT NOT NULL DEFAULT '',
  orcid TEXT NOT NULL DEFAULT '',
  personal_homepage TEXT NOT NULL DEFAULT '',
  google_scholar TEXT NOT NULL DEFAULT '',
  researchgate TEXT NOT NULL DEFAULT '',
  dblp TEXT NOT NULL DEFAULT '',
  github TEXT NOT NULL DEFAULT '',
  cnki TEXT NOT NULL DEFAULT '',
  contact_visibility TEXT NOT NULL DEFAULT 'authenticated',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE research_interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  source_citation TEXT NOT NULL DEFAULT '',
  citation_source_format TEXT NOT NULL DEFAULT 'auto',
  citation_style TEXT NOT NULL DEFAULT 'gbt',
  authors TEXT NOT NULL DEFAULT '',
  venue TEXT NOT NULL DEFAULT '',
  year INTEGER,
  volume TEXT NOT NULL DEFAULT '',
  issue TEXT NOT NULL DEFAULT '',
  pages TEXT NOT NULL DEFAULT '',
  doi TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  pdf_key TEXT NOT NULL DEFAULT '',
  bibtex TEXT NOT NULL DEFAULT '',
  citation TEXT NOT NULL DEFAULT '',
  publication_type TEXT NOT NULL DEFAULT '',
  author_role TEXT NOT NULL DEFAULT '',
  index_type TEXT NOT NULL DEFAULT '',
  abstract TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  pdf_visibility TEXT NOT NULL DEFAULT 'hidden',
  visibility TEXT NOT NULL DEFAULT 'public',
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_publications_year ON publications(year);
CREATE INDEX idx_publications_doi ON publications(doi);
CREATE INDEX idx_publications_featured ON publications(is_featured);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  fund_name TEXT NOT NULL DEFAULT '',
  project_number TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  principal TEXT NOT NULL DEFAULT '',
  members TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT '',
  amount REAL,
  amount_visibility TEXT NOT NULL DEFAULT 'owner',
  contract_number TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public',
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE patents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  patent_type TEXT NOT NULL DEFAULT '',
  application_number TEXT NOT NULL DEFAULT '',
  grant_number TEXT NOT NULL DEFAULT '',
  application_date TEXT,
  grant_date TEXT,
  inventors TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  legal_status TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  certificate_key TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public',
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  avatar_key TEXT NOT NULL DEFAULT '',
  student_id TEXT NOT NULL DEFAULT '',
  degree TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  homepage TEXT NOT NULL DEFAULT '',
  enrollment_date TEXT,
  graduation_date TEXT,
  destination TEXT NOT NULL DEFAULT '',
  awards TEXT NOT NULL DEFAULT '',
  contact_visibility TEXT NOT NULL DEFAULT 'owner',
  visibility TEXT NOT NULL DEFAULT 'public',
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE student_category_displays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  label_en TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT '',
  cover_key TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  content_format TEXT NOT NULL DEFAULT 'plain',
  allow_comments INTEGER NOT NULL DEFAULT 1,
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  visibility TEXT NOT NULL DEFAULT 'public',
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE news_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES news_comments(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  is_approved INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  semester TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  syllabus_key TEXT NOT NULL DEFAULT '',
  material_key TEXT NOT NULL DEFAULT '',
  material_visibility TEXT NOT NULL DEFAULT 'authenticated',
  references_text TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public',
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'other',
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  attachment_key TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE translation_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_hash TEXT NOT NULL,
  source_ref_key TEXT NOT NULL DEFAULT '',
  source_text TEXT NOT NULL,
  source_lang TEXT NOT NULL DEFAULT 'zh-CN',
  target_lang TEXT NOT NULL DEFAULT 'en',
  translated_text TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  is_manual INTEGER NOT NULL DEFAULT 0,
  is_current INTEGER NOT NULL DEFAULT 1,
  source_refs TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_hash, target_lang, source_ref_key)
);

CREATE TABLE autofetch_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  query TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  changes_json TEXT NOT NULL DEFAULT '[]',
  reverted_at TEXT,
  publication_id INTEGER REFERENCES publications(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
