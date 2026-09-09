import type { DatabaseAdapter, SqlCommand, SqlValue } from '../contracts'
import { read, write } from '../query'
import { DUMMY_PASSWORD_HASH } from '../../server/security/password'
import { sha256Hex } from '../../server/view-model/serializer'
import { buildSourceRefKey } from '../../server/i18n/source-ref'
import { translationSourceHash } from '../../server/i18n/fingerprint'
import {
  AUTH_MODULES,
  REGISTERED_USER_ROLE_LEVEL,
  REGISTERED_USER_ROLE_NAME,
  REGISTERED_USER_ROLE_UID,
  REGISTERED_USER_VISIBILITY_SCOPES,
  SYSTEM_ADMIN_ROLE_LEVEL,
  SYSTEM_ADMIN_ROLE_NAME,
  SYSTEM_ADMIN_ROLE_UID,
  systemAdministratorPermissions,
} from '../../shared/enums/auth'

export const SAMPLE_DATASET_VERSION = 'academic-cms-demo-v1'
export const SAMPLE_REPEATABLE_TABLE_MINIMUM = 10
export const SAMPLE_TABLE_COUNTS = Object.freeze({
  media_assets: 20,
  auth_roles: 10,
  auth_users: 10,
  auth_permissions: 20,
  profiles: 12,
  site_settings: 10,
  global_settings: 10,
  navigation_items: 12,
  research_interests: 10,
  publications: 15,
  projects: 12,
  patents: 10,
  students: 20,
  student_category_displays: 10,
  news: 15,
  courses: 10,
  messages: 12,
  translation_cache: 20,
  operation_logs: 20,
  auth_sessions: 10,
  auth_login_throttles: 10,
  cache_generations: 15,
  public_action_throttles: 10,
  auth_bootstrap_state: 1,
  demo_seed_state: 1,
} as const)

export interface SampleSeedOptions {
  passwordHash: string
  seededAt?: Date
  crypto?: Crypto
}

export interface SampleSeedResult {
  datasetVersion: string
  seedDigest: string
  counts: Readonly<Record<string, number>>
}

type SeedRow = Readonly<Record<string, SqlValue>>
interface SeedTable { table: keyof typeof SAMPLE_TABLE_COUNTS; columns: readonly string[]; rows: readonly SeedRow[] }
const TABLE_NAME = /^[a-z][a-z0-9_]*$/u
const COLUMN_NAME = /^[a-z][a-z0-9_]*$/u

function iso(day: number, hour = 9): string {
  return new Date(Date.UTC(2024, 0, 1 + day, hour, 0, 0, 0)).toISOString()
}
function date(day: number): string { return iso(day).slice(0, 10) }
function assertPasswordHash(value: string): string {
  if (typeof value !== 'string' || !/^pbkdf2-sha256\$\d{6,9}\$[A-Za-z0-9_-]{20,}\$[A-Za-z0-9_-]{20,}$/u.test(value)) {
    throw new Error('A valid PBKDF2 demo password hash is required')
  }
  return value
}
function jsonRowsCommand(spec: SeedTable): SqlCommand {
  if (!TABLE_NAME.test(spec.table) || spec.columns.length === 0 || spec.columns.some(column => !COLUMN_NAME.test(column))) {
    throw new Error(`Invalid seed table specification: ${spec.table}`)
  }
  if (spec.rows.length !== SAMPLE_TABLE_COUNTS[spec.table]) throw new Error(`Seed count mismatch for ${spec.table}`)
  for (const row of spec.rows) {
    for (const key of Object.keys(row)) if (!spec.columns.includes(key)) throw new Error(`Unexpected ${spec.table}.${key}`)
  }
  const columns = spec.columns.map(column => `"${column}"`).join(', ')
  const projection = spec.columns.map(column => `json_extract(value, '$.${column}')`).join(', ')
  return write(`INSERT INTO "${spec.table}" (${columns}) SELECT ${projection} FROM json_each(?)`, [JSON.stringify(spec.rows)])
}

export interface SampleAssetFile {
  objectKey: string
  mimeType: 'image/png'
  size: number
  checksum: string
}

const SAMPLE_ASSETS = Object.freeze([
  { objectKey: 'demo/avatars/person-01.png', mimeType: 'image/png', size: 29443, checksum: '520a7ebdea237d256c23da0b3695c7d7113ee4df41b7f948727569dd5a9c9bdb' },
  { objectKey: 'demo/avatars/person-02.png', mimeType: 'image/png', size: 25978, checksum: 'a742b572c4932494ca407d9395c6ff5fc9b5f7240dad844c5868f44f1b98860b' },
  { objectKey: 'demo/avatars/person-03.png', mimeType: 'image/png', size: 25636, checksum: 'bffc56c4c16a68906796978f774674a865188665dcfbdd2978059e9fd4683459' },
  { objectKey: 'demo/avatars/person-04.png', mimeType: 'image/png', size: 22885, checksum: '71bfccc4fac0c90bba308b364321b5c0122ff6827b050573224758f11d52ef7a' },
  { objectKey: 'demo/avatars/person-05.png', mimeType: 'image/png', size: 31067, checksum: 'cd963e2b5b7f3fadad230ceadd9daf67f2efeb594e1d33a9423f4c8310fc7299' },
  { objectKey: 'demo/avatars/person-06.png', mimeType: 'image/png', size: 25888, checksum: 'a6d4018b90f4c1215b894ea822d0eb8fdcb9c84d12218421a7dd329ed9f340b6' },
  { objectKey: 'demo/avatars/person-07.png', mimeType: 'image/png', size: 20810, checksum: '84fd6b0dbc913025cc82ac44e84098105a87ca488ee13b8c991280eadba06b9d' },
  { objectKey: 'demo/avatars/person-08.png', mimeType: 'image/png', size: 27461, checksum: '365aee7ca559a7228db679c5c828a3df6c41120d1fd5621d3905b95368a19170' },
  { objectKey: 'demo/avatars/person-09.png', mimeType: 'image/png', size: 34699, checksum: '14f1e63c69fc2e92596cb1d77d0436538c95f8b2faa63295e6cf785baa0ce2cc' },
  { objectKey: 'demo/avatars/person-10.png', mimeType: 'image/png', size: 27184, checksum: 'b8c0ae7334516ee96370ede36e6eb1e1552ea69bb25cd6a9740b50c338e742ca' },
  { objectKey: 'demo/avatars/person-11.png', mimeType: 'image/png', size: 18566, checksum: '3789df5ea4690fb6029b2359eefd98a2218a564fe4a2bb237bcef7dfcac96881' },
  { objectKey: 'demo/avatars/person-12.png', mimeType: 'image/png', size: 26037, checksum: '9c1c23174ccae657914b35451ccfec25f1baf1f790d1724686eb6669fbe40979' },
  { objectKey: 'demo/covers/research-01.png', mimeType: 'image/png', size: 82431, checksum: 'b0b14b5523ee746e95eba2d39db5891a72a256b3f5771172b6170253a48c7523' },
  { objectKey: 'demo/covers/research-02.png', mimeType: 'image/png', size: 85502, checksum: 'e52f43646ed6ac55f79608b092d568cd2cd589c586ded0551f850390ed1566fa' },
  { objectKey: 'demo/covers/research-03.png', mimeType: 'image/png', size: 93969, checksum: '00f08f9b73bafcf5371fd437f367e82587c3b6eafc87316f7bb39f3c10901d40' },
  { objectKey: 'demo/covers/research-04.png', mimeType: 'image/png', size: 74134, checksum: '03b1cc7906864e9217a8fd1f490d2fe5c5dbc754684a2c507490ec679c1b989a' },
  { objectKey: 'demo/covers/research-05.png', mimeType: 'image/png', size: 94373, checksum: '6b288d410c32cba8177934554f99021a1515b0a70e06fa40ea38bcfb2e4834c4' },
  { objectKey: 'demo/covers/research-06.png', mimeType: 'image/png', size: 94143, checksum: '8972cbafbaf2e070d857317d6e2fb9bf64029b125186be302c28905293a99082' },
  { objectKey: 'demo/brand/logo.png', mimeType: 'image/png', size: 28780, checksum: '2db6ea78b621acf6f0a61575b797c4388b72244e1e1c02c91f83b1a137544ee7' },
  { objectKey: 'demo/brand/share.png', mimeType: 'image/png', size: 73444, checksum: '80586cc6c34b3f9f9323453ffc4996413c32e06a1c336bb947af852cf312af89' },
] as const) satisfies readonly Readonly<SampleAssetFile>[]

export function sampleAssetFiles(): readonly Readonly<SampleAssetFile>[] {
  return SAMPLE_ASSETS
}

function mediaRows(): SeedRow[] {
  return sampleAssetFiles().map((file, index) => ({
    uid: `demo:media:${String(index + 1).padStart(2, '0')}`,
    created_at: iso(index), updated_at: iso(index), object_key: file.objectKey,
    title: index < 12 ? `示例头像 ${index + 1}` : index < 18 ? `示例科研封面 ${index - 11}` : index === 18 ? '示例站点标志' : '示例分享封面',
    category: index < 12 ? 'avatar' : index < 18 ? 'cover' : 'brand', mime_type: file.mimeType,
    size: file.size, storage_kind: 'static', status: 'active', checksum: file.checksum,
  }))
}

function roleRows(): SeedRow[] {
  const roles = [
    [SYSTEM_ADMIN_ROLE_UID, SYSTEM_ADMIN_ROLE_NAME, SYSTEM_ADMIN_ROLE_LEVEL, ['public','authenticated','staff','owner','hidden'], 1, 1],
    ['role:demo-site-editor', 'Site Editor', 500, ['public','authenticated','staff','owner'], 0, 1],
    ['role:demo-content-editor', 'Content Editor', 300, ['public','authenticated','staff','owner'], 0, 1],
    ['role:demo-media-curator', 'Media Curator', 260, ['public','authenticated','staff'], 0, 1],
    ['role:demo-translator', 'Translator', 250, ['public','authenticated','staff'], 0, 1],
    ['role:demo-message-manager', 'Message Manager', 240, ['public','authenticated','staff'], 0, 1],
    ['role:demo-reviewer', 'Reviewer', 200, ['public','authenticated','staff'], 0, 1],
    ['role:demo-reader', 'Authenticated Reader', 20, ['public','authenticated'], 0, 1],
    [REGISTERED_USER_ROLE_UID, REGISTERED_USER_ROLE_NAME, REGISTERED_USER_ROLE_LEVEL, [...REGISTERED_USER_VISIBILITY_SCOPES], 1, 1],
    ['role:demo-inactive', 'Inactive Example Role', 50, ['public'], 0, 0],
  ] as const
  return roles.map((role, index) => ({ uid: role[0], created_at: iso(index), updated_at: iso(index), name: role[1], level: role[2], description: `Development demonstration role ${index + 1}`, visibility_scopes: JSON.stringify(role[3]), is_system: role[4], is_active: role[5], sort_order: index + 1 }))
}

function userRows(passwordHash: string): SeedRow[] {
  const roles = [SYSTEM_ADMIN_ROLE_UID, 'role:demo-site-editor', 'role:demo-content-editor', 'role:demo-media-curator', 'role:demo-translator', 'role:demo-message-manager', 'role:demo-reviewer', 'role:demo-reader', REGISTERED_USER_ROLE_UID, 'role:demo-inactive']
  return roles.map((role_uid, index) => ({
    uid: `demo:user:${String(index + 1).padStart(2, '0')}`, created_at: iso(index), updated_at: iso(index),
    username: index === 0 ? 'demo_admin' : `demo_user_${String(index + 1).padStart(2, '0')}`,
    password_hash: index < 9 ? passwordHash : DUMMY_PASSWORD_HASH,
    display_name: index === 0 ? '演示管理员' : `演示用户 ${index + 1}`,
    email: `demo-user-${index + 1}@example.invalid`, role_uid,
    status: index === 9 ? 'disabled' : 'active', must_change_password: index === 1 ? 1 : 0,
    last_login_at: index < 3 ? iso(120 + index) : null, visibility: 'hidden',
  }))
}

function permissionRows(): SeedRow[] {
  const admin = systemAdministratorPermissions()
  const rows: SeedRow[] = AUTH_MODULES.map((module, index) => ({
    uid: `permission:system-administrator:${module}`, created_at: iso(index), updated_at: iso(index), role_uid: SYSTEM_ADMIN_ROLE_UID, module,
    can_view: admin[module].view ? 1 : 0, can_create: admin[module].create ? 1 : 0, can_edit: admin[module].edit ? 1 : 0,
    can_delete: admin[module].delete ? 1 : 0, can_export: admin[module].export ? 1 : 0, sort_order: index + 1,
  }))
  rows.push({ uid: 'demo:permission:site-editor:dashboard', created_at: iso(20), updated_at: iso(20), role_uid: 'role:demo-site-editor', module: 'dashboard', can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_export: 0, sort_order: 1 })
  return rows
}

function demoOrcid(index: number): string {
  const stem = `000000021825${String(index).padStart(3, '0')}`
  let total = 0
  for (const digit of stem) total = (total + Number(digit)) * 2
  const remainder = (12 - (total % 11)) % 11
  const compact = `${stem}${remainder === 10 ? 'X' : remainder}`
  return compact.match(/.{4}/gu)!.join('-')
}

function profileRows(): SeedRow[] {
  const surnames = ['林','陈','王','周','赵','孙','吴','郑','何','郭','罗','高']
  const given = ['知远','思源','明哲','若澜','景行','清和','博文','致远','雨桐','安然','子墨','嘉宁']
  const roles = ['负责人','教授','副教授','讲师','博士后','研究员']
  return surnames.map((surname, index) => ({
    uid: `demo:profile:${String(index + 1).padStart(2, '0')}`, created_at: iso(index), updated_at: iso(index), name: surname + given[index],
    name_en: `Demo Researcher ${index + 1}`, role: roles[index % roles.length]!, title: index % 3 === 0 ? '教授' : index % 3 === 1 ? '副教授' : '研究员',
    organization: '示例大学信息科学学院', lab: '智能系统与可信计算实验室', avatar_key: `demo/avatars/person-${String(index + 1).padStart(2, '0')}.png`,
    email: `researcher-${index + 1}@example.invalid`, phone: `010-5555-${String(1000 + index)}`, office: `科研楼 ${301 + index} 室`,
    bio: `长期从事${['可信人工智能','数据系统','人机交互','计算机视觉'][index % 4]}研究，关注方法、系统与真实场景之间的协同。`,
    bio_en: `Researcher ${index + 1} studies reliable methods and practical systems for interdisciplinary computing.`,
    education: '示例大学博士；示例理工大学学士', experience: '曾参与多项国家级与产业合作研究项目。', recruiting: index < 4 ? '欢迎对科研和工程实践有热情的学生联系。' : null,
    orcid: demoOrcid(index + 1), personal_homepage: `https://example.org/researcher-${index + 1}`,
    github: `https://github.com/example-${index + 1}`, contact_visibility: index < 6 ? 'public' : 'authenticated', visibility: 'public', is_active: 1, is_featured: index < 3 ? 1 : 0, sort_order: index + 1,
  }))
}

function siteSettingRows(): SeedRow[] {
  return Array.from({ length: 10 }, (_, index) => ({
    uid: `demo:site-settings:${String(index + 1).padStart(2, '0')}`, created_at: iso(index), updated_at: iso(index), is_active: index === 9 ? 1 : 0,
    site_name: index === 9 ? '智能系统与可信计算实验室' : `历史站点配置 ${index + 1}`, site_name_en: index === 9 ? 'Laboratory for Intelligent and Trustworthy Systems' : `Archived Site Configuration ${index + 1}`,
    hero_title: index === 9 ? '面向真实世界的智能与可信计算' : `历史首页标题 ${index + 1}`,
    hero_subtitle: '连接基础研究、系统实现与跨学科应用。', logo_key: 'demo/brand/logo.png', favicon_key: 'demo/brand/logo.png', og_image_key: 'demo/brand/share.png',
    seo_title: '智能系统与可信计算实验室', seo_description: '高校教师与科研团队学术网站演示数据。', seo_keywords: '人工智能,可信计算,数据系统',
    footer_text: '本页面内容均为开发演示数据。', homepage_profile_uid: 'demo:profile:01', homepage_publication_limit: 6, homepage_news_limit: 5,
  }))
}

function globalSettingRows(): SeedRow[] {
  return Array.from({ length: 10 }, (_, index) => ({
    uid: `demo:global-settings:${String(index + 1).padStart(2, '0')}`, created_at: iso(index), updated_at: iso(index),
    allow_public_registration: index === 9 ? 1 : 0, allow_anonymous_messages: index === 9 ? 1 : 0,
    upload_max_size_mb: 20, upload_allowed_extensions: JSON.stringify(['jpg','jpeg','png','webp','mp4','webm','pdf']), media_trash_retention_days: 30,
    news_pdf_allow_download: 1, news_pdf_watermark: 'DEMO', translation_providers: JSON.stringify(['manual']), translation_batch_size: 10, translation_worker_count: 2,
    translation_timeout_seconds: 15, translation_job_state: '{}', publication_metadata_providers: JSON.stringify(['openalex', 'crossref', 'semantic-scholar', 'datacite', 'europe-pmc', 'pubmed']), publication_display_style: 'gbt',
    patent_metadata_providers: '[]', notify_email: index === 9 ? 'demo-notify@example.invalid' : null,
  }))
}

function navigationRows(): SeedRow[] {
  const items = [
    ['首页','Home','/'],['团队','Team','/team'],['研究方向','Research','/research'],['论文','Publications','/publications'],
    ['项目','Projects','/projects'],['专利软著','Patents','/patents'],['学生','Students','/students'],['动态','News','/news'],
    ['课程','Courses','/courses'],['联系','Contact','/contact'],['登录','Sign in','/login'],['账号','Account','/account'],
  ] as const
  return items.map((item,index)=>({ uid:`demo:navigation:${String(index+1).padStart(2,'0')}`, created_at:iso(index), updated_at:iso(index), title:item[0], title_en:item[1], kind:'route', path:item[2], icon:null, style:index===9?'primary':'normal', location:'header', visibility:'public', enabled:1, sort_order:index+1 }))
}

function researchRows(): SeedRow[] {
  const topics = [
    ['可信人工智能','Trustworthy AI'],['智能数据系统','Intelligent Data Systems'],['多模态学习','Multimodal Learning'],['人机协同','Human-AI Collaboration'],['隐私计算','Privacy-preserving Computing'],
    ['知识图谱','Knowledge Graphs'],['边缘智能','Edge Intelligence'],['科学机器学习','Scientific Machine Learning'],['可解释计算','Explainable Computing'],['绿色计算','Sustainable Computing'],
  ] as const
  return topics.map((topic,index)=>({ uid:`demo:research:${String(index+1).padStart(2,'0')}`, created_at:iso(index), updated_at:iso(index), name:topic[0], name_en:topic[1], description:`围绕${topic[0]}的基础方法、系统实现与开放评测开展研究。`, sort_order:index+1, visibility:'public' }))
}

function publicationRows(): SeedRow[] {
  const types = ['期刊论文','会议论文','综述','预印本']
  return Array.from({length:15},(_,index)=>{
    const n=index+1, year=2026-(index%6), title=`面向复杂场景的可信智能方法与系统（示例 ${n}）`
    return { uid:`demo:publication:${String(n).padStart(2,'0')}`, created_at:iso(index), updated_at:iso(index), title,
      source_citation:`Demo Research Group. ${title}. Journal of Demonstration Research, ${year}.`, authors:`林知远, Demo Student ${n}, 陈思源`, venue:index%2===0?'Journal of Demonstration Research':'International Demo Conference', year,
      volume:String(10+index), issue:String(index%4+1), pages:`${100+index*10}-${108+index*10}`, doi:`10.5555/demo.${202600+n}`, url:`https://doi.org/10.5555/demo.${202600+n}`,
      bibtex:`@article{demo${n}, title={${title}}, year={${year}}}`, citation_gbt:`林知远, 等. ${title}[J]. 示例研究期刊, ${year}.`, citation_apa:`Demo Research Group. (${year}). Demo publication ${n}.`,
      publication_type:types[index%types.length]!, author_role:index%3===0?'通讯作者':'第一作者', corresponding_authors:'林知远', index_type:index%2===0?'SCI':'EI', display_tags:index%3===0?'精选,开放数据':'示例',
      abstract:`本文以演示数据形式介绍复杂场景下的可信智能建模、评测和部署方法。记录 ${n} 不代表真实论文。`, keywords:'可信人工智能,系统,评测', pdf_visibility:'hidden', visibility:'public', is_featured:index<6?1:0, sort_order:n }
  })
}

function projectRows(): SeedRow[] {
  const sources=['国家自然科学基金','省部级项目','校企合作','实验室开放课题']
  return Array.from({length:12},(_,index)=>({ uid:`demo:project:${String(index+1).padStart(2,'0')}`, created_at:iso(index), updated_at:iso(index), name:`可信智能关键技术研究项目（示例 ${index+1}）`, source:sources[index%sources.length]!, fund_name:`示例科研计划 ${index%4+1}`, project_number:`DEMO-${2020+index}-${String(index+1).padStart(3,'0')}`, project_role:index%3===0?'主持':'参与', principal:index%3===0?'林知远':'陈思源', members:'王明哲, 周若澜, 赵景行', start_date:date(365*index/2|0), end_date:date(365*index/2+730|0), status:index<8?'在研':'已结题', amount:String(20+index*7)+'.00', summary:`本项目研究可验证、可解释且高效的智能系统技术。该记录仅用于界面和查询演示。`, visibility:'public', is_featured:index<4?1:0, sort_order:index+1 }))
}

function patentRows(): SeedRow[] {
  return Array.from({length:10},(_,index)=>({ uid:`demo:patent:${String(index+1).padStart(2,'0')}`, created_at:iso(index), updated_at:iso(index), name:`一种面向边缘环境的智能处理方法（示例 ${index+1}）`, country:index%3===0?'PCT':'中国', patent_type:index%2===0?'发明专利':'软件著作权', application_number:`DEMO-APP-${2020+index}-${1000+index}`, grant_number:index<6?`DEMO-GRANT-${5000+index}`:null, application_date:date(index*120), grant_date:index<6?date(index*120+400):null, inventors:'林知远, 陈思源, 王明哲', owner:'示例大学', legal_status:index<6?'已授权':'审查中', summary:'用于展示专利元数据、筛选和详情页的非真实记录。', certificate_key:null, visibility:'public', is_featured:index<3?1:0, sort_order:index+1 }))
}

function studentRows(): SeedRow[] {
  const categories=['博士生','硕士生','本科生','毕业生']
  const directions=['可信人工智能','数据系统','多模态学习','人机协同']
  return Array.from({length:20},(_,index)=>({ uid:`demo:student:${String(index+1).padStart(2,'0')}`, created_at:iso(index), updated_at:iso(index), name:`示例学生 ${index+1}`, name_en:`Demo Student ${index+1}`, avatar_key:`demo/avatars/person-${String(index%12+1).padStart(2,'0')}.png`, student_id:`D${202000+index}`, degree:index%4===0?'博士':index%4===1?'硕士':'学士', category:categories[index%categories.length]!, grade:String(2022+index%5), direction:directions[index%directions.length]!, status:index%4===3?'毕业':'在读', email:`student-${index+1}@example.invalid`, homepage:index%5===0?`https://example.org/student-${index+1}`:null, enrollment_date:date(index*45), graduation_date:index%4===3?date(index*45+1095):null, destination:index%4===3?'科研机构或科技企业':null, awards:index%3===0?'示例学业奖学金':null, bio:'参与实验室科研、开放数据和工程实践。', contact_visibility:index<5?'public':'authenticated', visibility:'public', is_featured:index<4?1:0, sort_order:index+1 }))
}

function studentCategoryRows(): SeedRow[] {
  const rows=[['phd','博士生','Doctoral Students','博士,PhD'],['master','硕士生','Master Students','硕士,Master'],['undergraduate','本科生','Undergraduates','本科,Undergraduate'],['alumni','毕业生','Alumni','毕业,Alumni'],['postdoc','博士后','Postdoctoral Researchers','博士后,Postdoc'],['visitor','访问学生','Visiting Students','访问,Visitor'],['research-assistant','科研助理','Research Assistants','助理,Assistant'],['exchange','交换学生','Exchange Students','交换,Exchange'],['intern','实习生','Interns','实习,Intern'],['other','其他','Other','其他,Other']] as const
  return rows.map((row,index)=>({uid:`demo:student-category:${String(index+1).padStart(2,'0')}`,created_at:iso(index),updated_at:iso(index),key:row[0],label:row[1],label_en:row[2],keywords:row[3],enabled:1,display_order:index+1}))
}

function newsRows(): SeedRow[] {
  const cats=['学术活动','成果发布','团队动态','招生信息','课程通知']
  return Array.from({length:15},(_,index)=>({ uid:`demo:news:${String(index+1).padStart(2,'0')}`, created_at:iso(index), updated_at:iso(index), title:`实验室示例动态 ${index+1}：${cats[index%cats.length]!}`, slug:`demo-news-${String(index+1).padStart(2,'0')}`, category:cats[index%cats.length]!, cover_key:`demo/covers/research-${String(index%6+1).padStart(2,'0')}.png`, content:index%3===0?`# 示例动态 ${index+1}\n\n这是用于测试 Markdown 渲染、分页和关联内容的演示正文。\n\n- 时间：${date(200+index)}\n- 地点：示例大学科研楼`: `这是第 ${index+1} 条演示动态，用于验证公开列表、详情、筛选、翻译和缓存。`, content_format:index%3===0?'markdown':'plain', related_publication_uid:index<10?`demo:publication:${String(index%15+1).padStart(2,'0')}`:null, related_project_uid:index<8?`demo:project:${String(index%12+1).padStart(2,'0')}`:null, related_student_uid:index<6?`demo:student:${String(index%20+1).padStart(2,'0')}`:null, allow_comments:index%2, published_at:iso(150+index), visibility:'public', is_featured:index<5?1:0, sort_order:index+1 }))
}

function courseRows(): SeedRow[] {
  const names=['机器学习基础','可信人工智能','数据系统设计','科研方法与写作','计算机视觉','人机交互','隐私计算','知识图谱','边缘智能','科学计算实践']
  return names.map((name,index)=>({ uid:`demo:course:${String(index+1).padStart(2,'0')}`, created_at:iso(index), updated_at:iso(index), name, semester:`${2024+index%3}-${index%2===0?'秋':'春'}`, audience:index%3===0?'本科生':index%3===1?'研究生':'高年级本科生与研究生', summary:`${name}课程演示条目，覆盖基础理论、论文研读和实践项目。`, syllabus_key:null, material_key:null, material_visibility:'authenticated', references_text:'课程资料与参考文献将在教学平台中更新。', visibility:'public', is_featured:index<3?1:0, sort_order:index+1 }))
}

function messageRows(): SeedRow[] {
  const types=['admissions','collaboration','publication','project','course','other']
  const statuses=['new','read','replied','archived']
  return Array.from({length:12},(_,index)=>({ uid:`demo:message:${String(index+1).padStart(2,'0')}`, created_at:iso(200+index), updated_at:iso(200+index), name:`演示访客 ${index+1}`, email:`visitor-${index+1}@example.invalid`, message_type:types[index%types.length]!, subject:`关于${['招生','合作','论文','项目','课程','其他'][index%6]}的演示留言 ${index+1}`, content:'这是一条不对应任何真实人员或联系请求的开发演示留言。', attachment_key:null, status:statuses[index%statuses.length]!, visibility:'hidden' }))
}

async function translationRows(research: readonly SeedRow[], news: readonly SeedRow[]): Promise<SeedRow[]> {
  const requiredText = (row: SeedRow, field: string): string => {
    const value = row[field]
    if (typeof value !== 'string' || !value) throw new Error(`Missing sample translation source field: ${field}`)
    return value
  }
  const sources = [
    ...research.slice(0, 10).map((row, index) => ({
      entity: 'research_interests', uid: requiredText(row, 'uid'), field: 'description',
      text: requiredText(row, 'description'),
      translated: `Research direction ${index + 1} spans fundamental methods, systems, and open evaluation.`,
    })),
    ...news.slice(-10).map((row, index) => ({
      entity: 'news', uid: requiredText(row, 'uid'), field: 'title',
      text: requiredText(row, 'title'),
      translated: `Laboratory demo update ${index + 6}: ${requiredText(row, 'category')}.`,
    })),
  ]
  return Promise.all(sources.map(async (source, index) => {
    const ref = buildSourceRefKey(source)
    return { uid: `demo:translation:${String(index + 1).padStart(2, '0')}`, created_at: iso(index), updated_at: iso(index), source_hash: await translationSourceHash(source.text), source_ref_key: ref, source_text: source.text, source_lang: 'zh', target_lang: 'en', translated_text: source.translated, provider: index % 4 === 0 ? 'manual' : 'demo', status: 'success', is_manual: index % 4 === 0 ? 1 : 0, is_current: 1, source_refs: JSON.stringify([ref]), error_message: null }
  }))
}

function operationLogRows(): SeedRow[] {
  const modules=['profiles','publications','projects','patents','students','news','courses','media_assets','translation_cache','auth']
  return Array.from({length:20},(_,index)=>({ uid:`demo:operation-log:${String(index+1).padStart(2,'0')}`, created_at:iso(250+index), updated_at:iso(250+index), actor_uid:'demo:user:01', actor_name:'演示管理员', action:index%3===0?'save':index%3===1?'import':'review', module:modules[index%modules.length]!, target_uid:`demo:target:${index+1}`, summary:`演示操作日志 ${index+1}`, detail_json:JSON.stringify({ demo:true, sequence:index+1 }), status:'success' }))
}

async function securityTechnicalRows(crypto: Crypto): Promise<Record<string, SeedRow[]>> {
  const hex = async (prefix:string,index:number)=>sha256Hex(`${prefix}:${index}`,crypto)
  const sessions:SeedRow[]=[]; const login:SeedRow[]=[]; const actions:SeedRow[]=[]
  for(let index=0;index<10;index+=1){
    sessions.push({uid:`demo:session:${String(index+1).padStart(2,'0')}`,user_uid:`demo:user:${String(index+1).padStart(2,'0')}`,token_hash:await hex('demo-session-token',index),created_at:iso(50+index),updated_at:iso(51+index),last_seen_at:iso(50+index,10),idle_expires_at:iso(52+index),expires_at:iso(55+index),revoked_at:iso(51+index),revoke_reason:'security_policy',user_agent_hash:await hex('demo-user-agent',index)})
    login.push({key_hash:await hex('demo-login-throttle',index),scope:index%2===0?'account':'network',failures:index%4,window_started_at:iso(70+index),blocked_until:null,updated_at:iso(70+index),expires_at:iso(71+index)})
    actions.push({key_hash:await hex('demo-action-throttle',index),action:index%2===0?'registration':'contact',scope:index%3===0?'network':'identity',attempts:index%3,window_started_at:iso(80+index),blocked_until:null,updated_at:iso(80+index),expires_at:iso(81+index)})
  }
  const cacheTags=['public-home','site-settings','navigation','profiles','publications','projects','patents','students','research','news','courses','translation','media','locale','public-shell']
  const cache=cacheTags.map((tag,index)=>({tag,generation:index%3+1,updated_at:iso(90+index)}))
  return { auth_sessions:sessions, auth_login_throttles:login, public_action_throttles:actions, cache_generations:cache }
}

async function buildTables(passwordHash:string, crypto:Crypto):Promise<SeedTable[]> {
  const roles=roleRows(),users=userRows(passwordHash),permissions=permissionRows(),profiles=profileRows(),site=siteSettingRows(),global=globalSettingRows(),navigation=navigationRows(),research=researchRows(),publications=publicationRows(),projects=projectRows(),patents=patentRows(),students=studentRows(),categories=studentCategoryRows(),news=newsRows(),courses=courseRows(),messages=messageRows(),logs=operationLogRows()
  const [media,translations,technical]=await Promise.all([Promise.resolve(mediaRows()),translationRows(research,news),securityTechnicalRows(crypto)])
  return [
    {table:'media_assets',columns:Object.keys(media[0]!),rows:media},
    {table:'auth_roles',columns:Object.keys(roles[0]!),rows:roles},
    {table:'auth_users',columns:Object.keys(users[0]!),rows:users},
    {table:'auth_permissions',columns:Object.keys(permissions[0]!),rows:permissions},
    {table:'auth_bootstrap_state',columns:['id','completed_at','user_uid'],rows:[{id:1,completed_at:iso(0),user_uid:'demo:user:01'}]},
    {table:'auth_sessions',columns:Object.keys(technical.auth_sessions![0]!),rows:technical.auth_sessions!},
    {table:'auth_login_throttles',columns:Object.keys(technical.auth_login_throttles![0]!),rows:technical.auth_login_throttles!},
    {table:'profiles',columns:Object.keys(profiles[0]!),rows:profiles},
    {table:'site_settings',columns:Object.keys(site[0]!),rows:site},
    {table:'global_settings',columns:Object.keys(global[0]!),rows:global},
    {table:'navigation_items',columns:Object.keys(navigation[0]!),rows:navigation},
    {table:'research_interests',columns:Object.keys(research[0]!),rows:research},
    {table:'publications',columns:Object.keys(publications[0]!),rows:publications},
    {table:'projects',columns:Object.keys(projects[0]!),rows:projects},
    {table:'patents',columns:Object.keys(patents[0]!),rows:patents},
    {table:'students',columns:Object.keys(students[0]!),rows:students},
    {table:'student_category_displays',columns:Object.keys(categories[0]!),rows:categories},
    {table:'news',columns:Object.keys(news[0]!),rows:news},
    {table:'courses',columns:Object.keys(courses[0]!),rows:courses},
    {table:'messages',columns:Object.keys(messages[0]!),rows:messages},
    {table:'translation_cache',columns:Object.keys(translations[0]!),rows:translations},
    {table:'operation_logs',columns:Object.keys(logs[0]!),rows:logs},
    {table:'cache_generations',columns:Object.keys(technical.cache_generations![0]!),rows:technical.cache_generations!},
    {table:'public_action_throttles',columns:Object.keys(technical.public_action_throttles![0]!),rows:technical.public_action_throttles!},
  ]
}

const EMPTY_GUARD_TABLES = Object.keys(SAMPLE_TABLE_COUNTS).filter(table => !['demo_seed_state'].includes(table))
function markerCommand(seededAt:string,digest:string):SqlCommand {
  const empty = EMPTY_GUARD_TABLES.map(table=>`NOT EXISTS (SELECT 1 FROM "${table}" LIMIT 1)`).join(' AND ')
  return write(`INSERT INTO demo_seed_state (id, dataset_version, seeded_at, seed_digest) VALUES (CASE WHEN ${empty} THEN 1 ELSE 2 END, ?, ?, ?)`,[SAMPLE_DATASET_VERSION,seededAt,digest])
}

export async function buildSampleSeedCommands(options:SampleSeedOptions):Promise<{commands:SqlCommand[];digest:string}> {
  const crypto=options.crypto??globalThis.crypto
  if(!crypto?.subtle) throw new Error('Web Crypto is required to build the sample dataset')
  const passwordHash=assertPasswordHash(options.passwordHash)
  const seededAt=(options.seededAt??new Date()).toISOString()
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(seededAt)) throw new Error('Invalid sample seed timestamp')
  const tables=await buildTables(passwordHash,crypto)
  const digest=await sha256Hex(JSON.stringify({version:SAMPLE_DATASET_VERSION,counts:SAMPLE_TABLE_COUNTS,publicData:tables.filter(spec=>!['auth_users'].includes(spec.table)).map(spec=>[spec.table,spec.rows])}),crypto)
  const commands=[markerCommand(seededAt,digest),...tables.map(jsonRowsCommand)]
  if(commands.length>50) throw new Error('Sample dataset exceeds the atomic batch statement budget')
  return {commands,digest}
}

export async function applySampleSeed(adapter:DatabaseAdapter,options:SampleSeedOptions):Promise<SampleSeedResult> {
  const {commands,digest}=await buildSampleSeedCommands(options)
  await adapter.batch(commands)
  const results=await adapter.batch(Object.keys(SAMPLE_TABLE_COUNTS).map(table=>read(`SELECT count(*) AS total FROM "${table}"`)))
  const counts:Record<string,number>={}
  Object.keys(SAMPLE_TABLE_COUNTS).forEach((table,index)=>{
    const total=results[index]?.rows[0]?.total
    if(typeof total!=='number'||!Number.isSafeInteger(total)) throw new Error(`Could not verify sample table ${table}`)
    counts[table]=total
    if(total!==SAMPLE_TABLE_COUNTS[table as keyof typeof SAMPLE_TABLE_COUNTS]) throw new Error(`Unexpected sample count for ${table}`)
  })
  return Object.freeze({datasetVersion:SAMPLE_DATASET_VERSION,seedDigest:digest,counts:Object.freeze(counts)})
}
