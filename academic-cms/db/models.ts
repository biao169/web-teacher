// Generated from db/schema-spec.json. Edit the spec, then run db:generate.
import type { JsonValue } from './schema-types'

export interface MediaAssetsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  object_key: string
  title: string | null
  category: string | null
  mime_type: string | null
  size: number
  storage_kind: "static" | "local" | "r2" | "external"
  status: "active" | "trash"
  checksum: string | null
}

export interface MediaAssetsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  object_key: string
  title?: string | null
  category?: string | null
  mime_type?: string | null
  size?: number
  storage_kind?: "static" | "local" | "r2" | "external"
  status?: "active" | "trash"
  checksum?: string | null
}

export interface AuthRolesRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  name: string
  level: number
  description: string | null
  visibility_scopes: JsonValue
  is_system: boolean
  is_active: boolean
  sort_order: number
}

export interface AuthRolesInput {
  uid?: string
  created_at?: string
  updated_at?: string
  name: string
  level?: number
  description?: string | null
  visibility_scopes?: JsonValue
  is_system?: boolean
  is_active?: boolean
  sort_order?: number
}

export interface AuthUsersRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  username: string
  password_hash: string
  display_name: string | null
  email: string | null
  role_uid: string
  status: "active" | "disabled" | "locked"
  must_change_password: boolean
  last_login_at: string | null
  visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
}

export interface AuthUsersInput {
  uid?: string
  created_at?: string
  updated_at?: string
  username: string
  password_hash: string
  display_name?: string | null
  email?: string | null
  role_uid: string
  status?: "active" | "disabled" | "locked"
  must_change_password?: boolean
  last_login_at?: string | null
  visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
}

export interface AuthPermissionsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  role_uid: string
  module: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  can_export: boolean
  sort_order: number
}

export interface AuthPermissionsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  role_uid: string
  module: string
  can_view?: boolean
  can_create?: boolean
  can_edit?: boolean
  can_delete?: boolean
  can_export?: boolean
  sort_order?: number
}

export interface ProfilesRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  name: string
  name_en: string | null
  role: string | null
  title: string | null
  organization: string | null
  lab: string | null
  avatar_key: string | null
  email: string | null
  phone: string | null
  office: string | null
  bio: string | null
  bio_en: string | null
  education: string | null
  experience: string | null
  recruiting: string | null
  orcid: string | null
  personal_homepage: string | null
  google_scholar: string | null
  dblp: string | null
  github: string | null
  cnki: string | null
  contact_visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_active: boolean
  is_featured: boolean
  sort_order: number
  orcid_value: number | null
  personal_homepage_value: number | null
  google_scholar_value: number | null
  dblp_value: number | null
  github_value: number | null
  cnki_value: number | null
}

export interface ProfilesInput {
  uid?: string
  created_at?: string
  updated_at?: string
  name: string
  name_en?: string | null
  role?: string | null
  title?: string | null
  organization?: string | null
  lab?: string | null
  avatar_key?: string | null
  email?: string | null
  phone?: string | null
  office?: string | null
  bio?: string | null
  bio_en?: string | null
  education?: string | null
  experience?: string | null
  recruiting?: string | null
  orcid?: string | null
  personal_homepage?: string | null
  google_scholar?: string | null
  dblp?: string | null
  github?: string | null
  cnki?: string | null
  contact_visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_active?: boolean
  is_featured?: boolean
  sort_order?: number
  orcid_value?: number | null
  personal_homepage_value?: number | null
  google_scholar_value?: number | null
  dblp_value?: number | null
  github_value?: number | null
  cnki_value?: number | null
}

export interface SiteSettingsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  is_active: boolean
  site_name: string
  site_name_en: string | null
  hero_title: string | null
  hero_subtitle: string | null
  logo_key: string | null
  favicon_key: string | null
  og_image_key: string | null
  seo_title: string | null
  seo_description: string | null
  seo_keywords: string | null
  footer_text: string | null
  homepage_profile_uid: string | null
  homepage_publication_limit: number
  homepage_news_limit: number
}

export interface SiteSettingsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  is_active?: boolean
  site_name: string
  site_name_en?: string | null
  hero_title?: string | null
  hero_subtitle?: string | null
  logo_key?: string | null
  favicon_key?: string | null
  og_image_key?: string | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  footer_text?: string | null
  homepage_profile_uid?: string | null
  homepage_publication_limit?: number
  homepage_news_limit?: number
}

export interface GlobalSettingsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  allow_public_registration: boolean
  allow_anonymous_messages: boolean
  upload_max_size_mb: number
  upload_allowed_extensions: JsonValue
  media_trash_retention_days: number
  news_pdf_engine: string | null
  news_pdf_allow_download: boolean
  news_pdf_watermark: string | null
  translation_provider: string | null
  translation_providers: JsonValue
  libretranslate_url: string | null
  libretranslate_api_key: string | null
  deepl_api_key: string | null
  google_translate_api_key: string | null
  microsoft_translator_key: string | null
  microsoft_translator_region: string | null
  microsoft_translator_endpoint: string | null
  mymemory_email: string | null
  translation_batch_size: number
  translation_worker_count: number
  translation_timeout_seconds: number
  translation_job_state: JsonValue
  publication_metadata_provider: string | null
  publication_metadata_providers: JsonValue
  publication_display_style: string | null
  publication_suggestion_cache_seconds: number
  profile_suggestion_cache_seconds: number
  project_suggestion_cache_seconds: number
  patent_suggestion_cache_seconds: number
  student_suggestion_cache_seconds: number
  news_suggestion_cache_seconds: number
  course_suggestion_cache_seconds: number
  patent_metadata_providers: JsonValue
  patentsview_api_key: string | null
  epo_ops_client_id: string | null
  epo_ops_client_secret: string | null
  notify_email: string | null
}

export interface GlobalSettingsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  allow_public_registration?: boolean
  allow_anonymous_messages?: boolean
  upload_max_size_mb?: number
  upload_allowed_extensions?: JsonValue
  media_trash_retention_days?: number
  news_pdf_engine?: string | null
  news_pdf_allow_download?: boolean
  news_pdf_watermark?: string | null
  translation_provider?: string | null
  translation_providers?: JsonValue
  libretranslate_url?: string | null
  libretranslate_api_key?: string | null
  deepl_api_key?: string | null
  google_translate_api_key?: string | null
  microsoft_translator_key?: string | null
  microsoft_translator_region?: string | null
  microsoft_translator_endpoint?: string | null
  mymemory_email?: string | null
  translation_batch_size?: number
  translation_worker_count?: number
  translation_timeout_seconds?: number
  translation_job_state?: JsonValue
  publication_metadata_provider?: string | null
  publication_metadata_providers?: JsonValue
  publication_display_style?: string | null
  publication_suggestion_cache_seconds?: number
  profile_suggestion_cache_seconds?: number
  project_suggestion_cache_seconds?: number
  patent_suggestion_cache_seconds?: number
  student_suggestion_cache_seconds?: number
  news_suggestion_cache_seconds?: number
  course_suggestion_cache_seconds?: number
  patent_metadata_providers?: JsonValue
  patentsview_api_key?: string | null
  epo_ops_client_id?: string | null
  epo_ops_client_secret?: string | null
  notify_email?: string | null
}

export interface NavigationItemsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  title: string
  title_en: string | null
  kind: string | null
  url_name: string | null
  path: string | null
  fragment: string | null
  icon: string | null
  style: string | null
  location: string | null
  visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  enabled: boolean
  sort_order: number
}

export interface NavigationItemsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  title: string
  title_en?: string | null
  kind?: string | null
  url_name?: string | null
  path?: string | null
  fragment?: string | null
  icon?: string | null
  style?: string | null
  location?: string | null
  visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  enabled?: boolean
  sort_order?: number
}

export interface ResearchInterestsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  name: string
  name_en: string | null
  description: string | null
  sort_order: number
  visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
}

export interface ResearchInterestsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  name: string
  name_en?: string | null
  description?: string | null
  sort_order?: number
  visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
}

export interface PublicationsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  title: string
  source_citation: string | null
  authors: string | null
  venue: string | null
  year: number | null
  volume: string | null
  issue: string | null
  pages: string | null
  doi: string | null
  url: string | null
  pdf_key: string | null
  bibtex: string | null
  citation_gbt: string | null
  citation_elsevier: string | null
  citation_apa: string | null
  citation_ieee: string | null
  highlight_gbt: string | null
  highlight_elsevier: string | null
  highlight_apa: string | null
  highlight_ieee: string | null
  publication_type: string | null
  author_role: string | null
  corresponding_authors: string | null
  index_type: string | null
  display_tags: string | null
  abstract: string | null
  keywords: string | null
  pdf_visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured: boolean
  sort_order: number
}

export interface PublicationsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  title: string
  source_citation?: string | null
  authors?: string | null
  venue?: string | null
  year?: number | null
  volume?: string | null
  issue?: string | null
  pages?: string | null
  doi?: string | null
  url?: string | null
  pdf_key?: string | null
  bibtex?: string | null
  citation_gbt?: string | null
  citation_elsevier?: string | null
  citation_apa?: string | null
  citation_ieee?: string | null
  highlight_gbt?: string | null
  highlight_elsevier?: string | null
  highlight_apa?: string | null
  highlight_ieee?: string | null
  publication_type?: string | null
  author_role?: string | null
  corresponding_authors?: string | null
  index_type?: string | null
  display_tags?: string | null
  abstract?: string | null
  keywords?: string | null
  pdf_visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured?: boolean
  sort_order?: number
}

export interface ProjectsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  name: string
  source: string | null
  fund_name: string | null
  project_number: string | null
  project_role: string | null
  principal: string | null
  members: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  amount: string | null
  summary: string | null
  visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured: boolean
  sort_order: number
}

export interface ProjectsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  name: string
  source?: string | null
  fund_name?: string | null
  project_number?: string | null
  project_role?: string | null
  principal?: string | null
  members?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
  amount?: string | null
  summary?: string | null
  visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured?: boolean
  sort_order?: number
}

export interface PatentsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  name: string
  country: string | null
  patent_type: string | null
  application_number: string | null
  grant_number: string | null
  application_date: string | null
  grant_date: string | null
  inventors: string | null
  owner: string | null
  legal_status: string | null
  summary: string | null
  certificate_key: string | null
  visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured: boolean
  sort_order: number
}

export interface PatentsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  name: string
  country?: string | null
  patent_type?: string | null
  application_number?: string | null
  grant_number?: string | null
  application_date?: string | null
  grant_date?: string | null
  inventors?: string | null
  owner?: string | null
  legal_status?: string | null
  summary?: string | null
  certificate_key?: string | null
  visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured?: boolean
  sort_order?: number
}

export interface StudentsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  name: string
  name_en: string | null
  avatar_key: string | null
  student_id: string | null
  degree: string | null
  category: string | null
  grade: string | null
  direction: string | null
  status: string | null
  email: string | null
  homepage: string | null
  enrollment_date: string | null
  graduation_date: string | null
  destination: string | null
  awards: string | null
  bio: string | null
  contact_visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured: boolean
  sort_order: number
}

export interface StudentsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  name: string
  name_en?: string | null
  avatar_key?: string | null
  student_id?: string | null
  degree?: string | null
  category?: string | null
  grade?: string | null
  direction?: string | null
  status?: string | null
  email?: string | null
  homepage?: string | null
  enrollment_date?: string | null
  graduation_date?: string | null
  destination?: string | null
  awards?: string | null
  bio?: string | null
  contact_visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured?: boolean
  sort_order?: number
}

export interface StudentCategoryDisplaysRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  key: string
  label: string
  label_en: string | null
  keywords: string | null
  enabled: boolean
  display_order: number
}

export interface StudentCategoryDisplaysInput {
  uid?: string
  created_at?: string
  updated_at?: string
  key: string
  label: string
  label_en?: string | null
  keywords?: string | null
  enabled?: boolean
  display_order?: number
}

export interface NewsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  title: string
  slug: string
  category: string | null
  cover_key: string | null
  content: string | null
  content_format: "plain" | "html" | "markdown"
  related_publication_uid: string | null
  related_project_uid: string | null
  related_student_uid: string | null
  allow_comments: boolean
  published_at: string | null
  visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured: boolean
  sort_order: number
}

export interface NewsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  title: string
  slug: string
  category?: string | null
  cover_key?: string | null
  content?: string | null
  content_format?: "plain" | "html" | "markdown"
  related_publication_uid?: string | null
  related_project_uid?: string | null
  related_student_uid?: string | null
  allow_comments?: boolean
  published_at?: string | null
  visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured?: boolean
  sort_order?: number
}

export interface CoursesRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  name: string
  semester: string | null
  audience: string | null
  summary: string | null
  syllabus_key: string | null
  material_key: string | null
  material_visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  references_text: string | null
  visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured: boolean
  sort_order: number
}

export interface CoursesInput {
  uid?: string
  created_at?: string
  updated_at?: string
  name: string
  semester?: string | null
  audience?: string | null
  summary?: string | null
  syllabus_key?: string | null
  material_key?: string | null
  material_visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  references_text?: string | null
  visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
  is_featured?: boolean
  sort_order?: number
}

export interface MessagesRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  name: string | null
  email: string | null
  message_type: string | null
  subject: string | null
  content: string
  attachment_key: string | null
  status: string
  visibility: "public" | "authenticated" | "staff" | "owner" | "hidden"
}

export interface MessagesInput {
  uid?: string
  created_at?: string
  updated_at?: string
  name?: string | null
  email?: string | null
  message_type?: string | null
  subject?: string | null
  content: string
  attachment_key?: string | null
  status?: string
  visibility?: "public" | "authenticated" | "staff" | "owner" | "hidden"
}

export interface TranslationCacheRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  source_hash: string
  source_ref_key: string
  source_text: string
  source_lang: string
  target_lang: string
  translated_text: string | null
  provider: string | null
  status: "pending" | "success" | "failed"
  is_manual: boolean
  is_current: boolean
  source_refs: JsonValue
  error_message: string | null
}

export interface TranslationCacheInput {
  uid?: string
  created_at?: string
  updated_at?: string
  source_hash: string
  source_ref_key: string
  source_text: string
  source_lang: string
  target_lang: string
  translated_text?: string | null
  provider?: string | null
  status?: "pending" | "success" | "failed"
  is_manual?: boolean
  is_current?: boolean
  source_refs?: JsonValue
  error_message?: string | null
}

export interface OperationLogsRow {
  id: number
  uid: string
  created_at: string
  updated_at: string
  actor_uid: string | null
  actor_name: string | null
  action: string
  module: string
  target_uid: string | null
  summary: string | null
  detail_json: JsonValue
  status: string | null
}

export interface OperationLogsInput {
  uid?: string
  created_at?: string
  updated_at?: string
  actor_uid?: string | null
  actor_name?: string | null
  action: string
  module: string
  target_uid?: string | null
  summary?: string | null
  detail_json?: JsonValue
  status?: string | null
}

export interface TableRows {
  media_assets: MediaAssetsRow
  auth_roles: AuthRolesRow
  auth_users: AuthUsersRow
  auth_permissions: AuthPermissionsRow
  profiles: ProfilesRow
  site_settings: SiteSettingsRow
  global_settings: GlobalSettingsRow
  navigation_items: NavigationItemsRow
  research_interests: ResearchInterestsRow
  publications: PublicationsRow
  projects: ProjectsRow
  patents: PatentsRow
  students: StudentsRow
  student_category_displays: StudentCategoryDisplaysRow
  news: NewsRow
  courses: CoursesRow
  messages: MessagesRow
  translation_cache: TranslationCacheRow
  operation_logs: OperationLogsRow
}

export interface TableInputs {
  media_assets: MediaAssetsInput
  auth_roles: AuthRolesInput
  auth_users: AuthUsersInput
  auth_permissions: AuthPermissionsInput
  profiles: ProfilesInput
  site_settings: SiteSettingsInput
  global_settings: GlobalSettingsInput
  navigation_items: NavigationItemsInput
  research_interests: ResearchInterestsInput
  publications: PublicationsInput
  projects: ProjectsInput
  patents: PatentsInput
  students: StudentsInput
  student_category_displays: StudentCategoryDisplaysInput
  news: NewsInput
  courses: CoursesInput
  messages: MessagesInput
  translation_cache: TranslationCacheInput
  operation_logs: OperationLogsInput
}

export type TableName = keyof TableRows
export type Row<T extends TableName> = TableRows[T]
export type Insert<T extends TableName> = TableInputs[T]
export type Patch<T extends TableName> = Partial<Omit<Row<T>, 'id' | 'uid' | 'created_at' | 'updated_at'>>
