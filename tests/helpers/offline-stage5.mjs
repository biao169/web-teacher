if (process.env.STAGE5_CORE_OUTPUT) process.env.STAGE4_CORE_OUTPUT = process.env.STAGE5_CORE_OUTPUT
const base = await import('./offline-stage4.mjs')

export const { root, load, migrations, createHarness, recordingAdapter, insert, iso, seedPublicHome } = base
export const core = Object.assign(base.core, {
  ...base.load('shared/contracts/public-content.js'),
  ...base.load('server/services/public/public-query.js'),
  ...base.load('server/services/public/public-page.js'),
  ...base.load('server/services/public/public-values.js'),
  ...base.load('server/services/public/public-content-blocks.js'),
  ...base.load('server/services/public/public-content-store.js'),
  ...base.load('server/services/public/public-shell-store.js'),
  ...base.load('server/services/public/public-shell-service.js'),
  ...base.load('server/services/public/modules/team.js'),
  ...base.load('server/services/public/modules/publications.js'),
  ...base.load('server/services/public/modules/projects.js'),
  ...base.load('server/services/public/modules/patents.js'),
  ...base.load('server/services/public/modules/students.js'),
  ...base.load('server/services/public/modules/research.js'),
  ...base.load('server/services/public/modules/news.js'),
  ...base.load('server/services/public/modules/courses.js'),
})

export async function seedPublicContent(h, options = {}) {
  await base.seedPublicHome(h, options)
  const at = options.at ?? iso()
  const future = iso(Date.parse(at) + 86_400_000)
  const media = [
    ['media:paper', 'publications/paper-one.pdf', 'Paper PDF', 'application/pdf', 1000],
    ['media:certificate', 'patents/certificate.pdf', 'Patent certificate', 'application/pdf', 800],
    ['media:student', 'students/student-one.jpg', 'Student avatar', 'image/jpeg', 1200],
    ['media:syllabus', 'courses/syllabus.pdf', 'Course syllabus', 'application/pdf', 700],
    ['media:material', 'courses/material.zip', 'Course materials', 'application/zip', 1800],
  ]
  for (const [uid, key, title, mime, size] of media) {
    insert(h.db, `INSERT INTO media_assets
      (uid, created_at, updated_at, object_key, title, mime_type, size, storage_kind, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'local', 'active')`, uid, at, at, key, title, mime, size)
  }
  insert(h.db, `UPDATE profiles SET email = 'lead@example.edu', phone = '+86 10 1234 5678', office = 'Science 301',
    education = '示例大学博士', experience = '长期从事系统研究', recruiting = '欢迎可靠系统方向学生',
    orcid = '0000-0002-1825-0097', personal_homepage = 'https://example.edu/lead', github = 'https://github.com/example',
    contact_visibility = 'public', lab = '可靠系统实验室' WHERE uid = 'profile:lead'`)
  insert(h.db, `INSERT INTO profiles
    (uid, created_at, updated_at, name, name_en, role, title, organization, lab, bio, contact_visibility, visibility, is_active, is_featured, sort_order)
    VALUES ('profile:member', ?, ?, '李华', 'Hua Li', '研究人员', '副教授', '示例大学', '可靠系统实验室', '研究边缘数据库。', 'hidden', 'public', 1, 0, 2)`, at, at)
  insert(h.db, `INSERT INTO profiles
    (uid, created_at, updated_at, name, role, contact_visibility, visibility, is_active, is_featured, sort_order)
    VALUES ('profile:inactive', ?, ?, '停用成员', '研究人员', 'hidden', 'public', 0, 0, 3)`, at, at)

  insert(h.db, `UPDATE publications SET source_citation = 'Zhang M, Li H. Edge consistency.', volume='12', issue='3', pages='1-20',
    pdf_key='publications/paper-one.pdf', bibtex='@article{edge2026,title={Edge Consistency}}',
    citation_gbt='张明, 李华. 边缘环境中的一致性协议[J]. 系统学报, 2026.', citation_apa='Zhang, M., & Li, H. (2026). Edge consistency.',
    highlight_gbt='张明', highlight_apa='Zhang, M.', corresponding_authors='张明', index_type='SCI, EI',
    abstract='研究边缘系统的一致性协议与可验证实现。', keywords='一致性, 边缘计算, 可验证系统', pdf_visibility='public'
    WHERE uid='publication:one'`)
  insert(h.db, `INSERT INTO publications
    (uid, created_at, updated_at, title, authors, venue, year, publication_type, index_type, pdf_visibility, visibility, is_featured, sort_order)
    VALUES ('publication:two', ?, ?, '分布式测试方法', '李华', '软件学报', 2025, '期刊论文', '中文核心', 'hidden', 'public', 1, 2)`, at, at)

  insert(h.db, `UPDATE projects SET project_number='NSFC-001', principal='张明', members='张明; 李华', start_date='2025-01-01', end_date='2028-12-31', amount='1200000.50' WHERE uid='project:one'`)
  insert(h.db, `INSERT INTO projects
    (uid, created_at, updated_at, name, source, status, start_date, visibility, is_featured, sort_order)
    VALUES ('project:two', ?, ?, '开放数据平台', '校级项目', '结题', '2022-01-01', 'public', 0, 2)`, at, at)

  insert(h.db, `INSERT INTO patents
    (uid, created_at, updated_at, name, country, patent_type, application_number, grant_number, application_date, grant_date,
     inventors, owner, legal_status, summary, certificate_key, visibility, is_featured, sort_order)
    VALUES ('patent:one', ?, ?, '一种一致性验证方法', '中国', '发明专利', 'CN202410001', 'CN1199999', '2024-01-10', '2026-06-20',
      '张明; 李华', '示例大学', '已授权', '用于验证分布式协议的一致性。', 'patents/certificate.pdf', 'public', 1, 1)`, at, at)
  insert(h.db, `INSERT INTO patents
    (uid, created_at, updated_at, name, country, patent_type, visibility, is_featured, sort_order)
    VALUES ('patent:hidden', ?, ?, '内部专利', '中国', '发明专利', 'hidden', 1, 2)`, at, at)

  insert(h.db, `INSERT INTO student_category_displays
    (uid, created_at, updated_at, key, label, label_en, keywords, enabled, display_order)
    VALUES ('student-category:doctoral', ?, ?, 'doctoral', '博士生', 'Doctoral students', '博士, PhD', 1, 1)`, at, at)
  insert(h.db, `INSERT INTO student_category_displays
    (uid, created_at, updated_at, key, label, label_en, keywords, enabled, display_order)
    VALUES ('student-category:master', ?, ?, 'master', '硕士生', 'Master students', '硕士, Master', 1, 2)`, at, at)
  insert(h.db, `INSERT INTO students
    (uid, created_at, updated_at, name, name_en, avatar_key, student_id, degree, category, grade, direction, status, email, homepage,
     enrollment_date, awards, bio, contact_visibility, visibility, is_featured, sort_order)
    VALUES ('student:one', ?, ?, '王芳', 'Fang Wang', 'students/student-one.jpg', 'S2025001', '博士', '博士生', '2025', '可靠数据库', '在读',
      'student@example.edu', 'https://example.edu/student', '2025-09-01', '优秀研究生奖', '研究事务与一致性。', 'public', 'public', 1, 1)`, at, at)
  insert(h.db, `INSERT INTO students
    (uid, created_at, updated_at, name, degree, category, status, contact_visibility, visibility, is_featured, sort_order)
    VALUES ('student:hidden', ?, ?, '隐藏学生', '硕士', '硕士生', '在读', 'hidden', 'hidden', 1, 2)`, at, at)

  insert(h.db, `UPDATE news SET content='# 开放数据集\n\n数据集现已开放。\n\n- 数据\n- 文档\n\n<script>alert(1)</script>', content_format='markdown',
    allow_comments=1, related_publication_uid='publication:one', related_project_uid='project:one', related_student_uid='student:one'
    WHERE uid='news:one'`)
  insert(h.db, `INSERT INTO news
    (uid, created_at, updated_at, title, slug, category, content, content_format, published_at, visibility, is_featured, sort_order)
    VALUES ('news:two', ?, ?, '项目顺利结题', 'project-complete', '团队动态', '<h2>结题</h2><p>项目完成。</p>', 'html', ?, 'public', 0, 2)`, at, at, at)

  insert(h.db, `INSERT INTO courses
    (uid, created_at, updated_at, name, semester, audience, summary, syllabus_key, material_key, material_visibility,
     references_text, visibility, is_featured, sort_order)
    VALUES ('course:one', ?, ?, '分布式系统', '2026春', '研究生', '介绍分布式系统原理与工程实践。', 'courses/syllabus.pdf', 'courses/material.zip', 'public',
      'Designing Data-Intensive Applications', 'public', 1, 1)`, at, at)
  insert(h.db, `INSERT INTO courses
    (uid, created_at, updated_at, name, semester, audience, material_visibility, visibility, is_featured, sort_order)
    VALUES ('course:private-material', ?, ?, '系统研讨', '2026秋', '博士生', 'authenticated', 'public', 0, 2)`, at, at)
  insert(h.db, `INSERT INTO courses
    (uid, created_at, updated_at, name, material_visibility, visibility, is_featured, sort_order)
    VALUES ('course:hidden', ?, ?, '隐藏课程', 'public', 'hidden', 1, 3)`, at, at)

  const translations = [
    ['profiles', 'profile:lead', 'role', '负责人', 'Principal investigator'],
    ['profiles', 'profile:lead', 'education', '示例大学博士', 'PhD, Example University'],
    ['publications', 'publication:one', 'abstract', '研究边缘系统的一致性协议与可验证实现。', 'Consistency protocols and verifiable implementations for edge systems.'],
    ['projects', 'project:one', 'summary', '研究资源受限边缘环境中的可靠计算基础。', 'Foundations of reliable computing in resource-constrained edge environments.'],
    ['patents', 'patent:one', 'name', '一种一致性验证方法', 'A method for consistency verification'],
    ['students', 'student:one', 'bio', '研究事务与一致性。', 'Research on transactions and consistency.'],
    ['courses', 'course:one', 'name', '分布式系统', 'Distributed Systems'],
    ['news', 'news:one', 'content', '# 开放数据集\n\n数据集现已开放。\n\n- 数据\n- 文档\n\n<script>alert(1)</script>', '# Open dataset\n\nThe dataset is now available.\n\n- Data\n- Documentation'],
  ]
  for (const [entity, uid, field, source, translated] of translations) {
    const ref = core.buildSourceRefKey({ entity, uid, field })
    const hash = await core.translationSourceHash(source)
    insert(h.db, `INSERT INTO translation_cache
      (uid, created_at, updated_at, source_hash, source_ref_key, source_text, source_lang, target_lang,
       translated_text, provider, status, is_manual, is_current, source_refs)
      VALUES (?, ?, ?, ?, ?, ?, 'zh', 'en', ?, 'fixture', 'success', 0, 1, '[]')`,
    `stage5:${entity}:${uid}:${field}`, at, at, hash, ref, source, translated)
  }
  return { at, future }
}

export function createPublicServices(adapter, clock, options = {}) {
  const translations = new core.TranslationBatchReader(new core.TranslationStore(adapter))
  const media = new core.MediaService(
    new core.MediaCatalogStore(adapter), {},
    new core.MediaGrantService('m'.repeat(64), { publicSeconds: options.publicGrantSeconds ?? 180, privateSeconds: 60, clock: () => new Date(clock.value) }),
  )
  const memory = new core.MemoryCacheAdapter({ now: () => clock.value, maxEntries: 256, maxBytes: 8_000_000, maxEntryBytes: 1_000_000 })
  const cache = new core.PublicCacheService(memory, new core.CacheGenerationStore(adapter), { now: () => new Date(clock.value), coordinator: core.createPublicCacheCoordinator(), valueCache: new core.PublicValueCache() })
  const args = [adapter, translations, media, cache, options.publicGrantSeconds ?? 180, () => new Date(clock.value)]
  return {
    store: new core.PublicContentStore(adapter),
    shell: new core.PublicShellService(adapter, translations, media, cache, { defaultSiteName: 'Academic CMS', publicMediaGrantSeconds: options.publicGrantSeconds ?? 180, now: () => new Date(clock.value) }),
    team: new core.PublicTeamService(...args), publications: new core.PublicPublicationsService(...args), projects: new core.PublicProjectsService(...args),
    patents: new core.PublicPatentsService(...args), students: new core.PublicStudentsService(...args), research: new core.PublicResearchService(...args),
    news: new core.PublicNewsService(...args), courses: new core.PublicCoursesService(...args), memory, cache,
  }
}

export function request(locale = 'zh', overrides = {}) {
  return { locale, page: 1, pageSize: 12, search: null, filters: Object.freeze({}), ...overrides }
}
