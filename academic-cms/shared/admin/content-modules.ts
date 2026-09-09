import type { AuthModule, PermissionFlags } from '../enums/auth'
import type { PublicMediaFallback } from '../contracts/media'
import type { MediaPurpose } from '../enums/media'

export const ADMIN_CONTENT_BATCH_LIMIT = 25

export const ADMIN_CONTENT_MODULES = [
  'profiles',
  'research_interests',
  'publications',
  'projects',
  'patents',
  'students',
  'student_category_displays',
  'courses',
  'messages',
] as const

export type AdminContentModule = (typeof ADMIN_CONTENT_MODULES)[number]
export type AdminContentValue = string | number | boolean | null
export type AdminContentValues = Readonly<Record<string, AdminContentValue>>
export type AdminFieldKind = 'text' | 'textarea' | 'integer' | 'decimal' | 'boolean' | 'select' | 'date' | 'datetime' | 'url' | 'email' | 'media' | 'slug'
export type AdminColumnKind = 'text' | 'long-text' | 'integer' | 'decimal' | 'boolean' | 'visibility' | 'date' | 'datetime' | 'status' | 'image'
export type AdminFilterKind = 'select' | 'boolean' | 'integer'

export interface AdminOption { readonly value: string; readonly label: string }
export interface AdminFieldGroup { readonly id: string; readonly label: string; readonly description?: string }
export interface AdminFieldDefinition {
  readonly name: string
  readonly label: string
  readonly kind: AdminFieldKind
  readonly group: string
  readonly required?: boolean
  readonly nullable?: boolean
  readonly readOnly?: boolean
  readonly defaultValue?: AdminContentValue
  readonly options?: readonly AdminOption[]
  readonly help?: string
  readonly placeholder?: string
  readonly rows?: number
  readonly maxLength?: number
  readonly preserveWhitespace?: boolean
  readonly min?: number
  readonly max?: number
}
export interface AdminListColumn {
  readonly field: string
  readonly label: string
  readonly kind: AdminColumnKind
  readonly minWidth?: number
  readonly width?: number
  readonly primary?: boolean
  readonly sortable?: boolean
  readonly filterable?: boolean
  readonly resizable?: boolean
  readonly media?: {
    readonly purpose: MediaPurpose
    readonly altField: string
    readonly width: number
    readonly height: number
    readonly fallback: PublicMediaFallback
  }
}
export interface AdminFilterDefinition {
  readonly field: string
  readonly label: string
  readonly kind: AdminFilterKind
  readonly options?: readonly AdminOption[]
  readonly dynamic?: boolean
}
export interface AdminSortDefinition { readonly field: string; readonly label: string; readonly direction: 'asc' | 'desc' }
export interface AdminContentModuleDefinition {
  readonly module: AdminContentModule
  readonly table: AdminContentModule
  readonly path: string
  readonly title: string
  readonly singularTitle: string
  readonly description: string
  readonly primaryField: string
  readonly groups: readonly AdminFieldGroup[]
  readonly fields: readonly AdminFieldDefinition[]
  readonly columns: readonly AdminListColumn[]
  readonly filters: readonly AdminFilterDefinition[]
  readonly sorts: readonly AdminSortDefinition[]
  readonly defaultSort: AdminSortDefinition
  readonly canCreate: boolean
  readonly canDelete: boolean
  readonly batchFields: readonly string[]
  readonly uniqueFields?: readonly string[]
}

export interface AdminContentPermissions extends Pick<PermissionFlags, 'create' | 'edit' | 'delete' | 'export'> {}

const visibilityOptions: readonly AdminOption[] = Object.freeze([
  { value: 'public', label: '公开' },
  { value: 'authenticated', label: '登录用户' },
  { value: 'staff', label: '工作人员' },
  { value: 'owner', label: '所有者' },
  { value: 'hidden', label: '隐藏' },
])
const booleanOptions: readonly AdminOption[] = Object.freeze([
  { value: 'true', label: '是' },
  { value: 'false', label: '否' },
])
const messageStatusOptions: readonly AdminOption[] = Object.freeze([
  { value: 'new', label: '新留言' },
  { value: 'read', label: '已读' },
  { value: 'replied', label: '已回复' },
  { value: 'archived', label: '已归档' },
])

const GROUPS = Object.freeze({
  basic: { id: 'basic', label: '基本信息' },
  identity: { id: 'identity', label: '身份与归属' },
  contact: { id: 'contact', label: '联系方式' },
  content: { id: 'content', label: '内容' },
  publication: { id: 'publication', label: '出版信息' },
  citation: { id: 'citation', label: '引用格式' },
  schedule: { id: 'schedule', label: '时间与状态' },
  links: { id: 'links', label: '外部链接' },
  media: { id: 'media', label: '媒体资源' },
  display: { id: 'display', label: '展示与权限' },
  relation: { id: 'relation', label: '关联内容' },
  processing: { id: 'processing', label: '处理状态' },
})

export function adminContentFieldPlaceholder(field: Pick<AdminFieldDefinition, 'label' | 'kind' | 'placeholder'>): string {
  if (field.placeholder) return field.placeholder
  if (field.kind === 'select') return `请选择${field.label}`
  if (field.kind === 'date') return `请选择${field.label}`
  if (field.kind === 'datetime') return `请选择${field.label}的日期和时间`
  if (field.kind === 'media') return `请选择或填写${field.label}`
  if (field.kind === 'email') return `例如：name@example.com`
  if (field.kind === 'url') return `例如：https://example.com`
  if (field.kind === 'slug') return `请输入小写字母、数字和短横线`
  if (field.kind === 'textarea') return `请输入${field.label}`
  if (field.kind === 'integer' || field.kind === 'decimal') return `请输入${field.label}`
  if (field.kind === 'boolean') return `设置${field.label}`
  return `请输入${field.label}`
}

export function adminContentFieldHelp(field: Pick<AdminFieldDefinition, 'label' | 'kind' | 'required' | 'readOnly' | 'help' | 'maxLength' | 'min' | 'max'>): string {
  if (field.help) return field.help
  if (field.readOnly) return `${field.label}由系统维护，仅用于查看。`
  const requirement = field.required ? '必填' : '可选'
  if (field.kind === 'boolean') return `控制“${field.label}”是否启用，保存后立即按当前状态生效。`
  if (field.kind === 'select') return `请选择${field.label}；此项${requirement}。`
  if (field.kind === 'date') return `请选择${field.label}；日期按本地时区保存。`
  if (field.kind === 'datetime') return `请选择${field.label}；时间按本地时区录入并统一存储。`
  if (field.kind === 'media') return `从媒体库选择${field.label}，系统将保存受管理媒体的 object key。`
  if (field.kind === 'email') return `填写可用的邮箱地址；此项${requirement}。`
  if (field.kind === 'url') return `填写完整的 HTTPS 地址；此项${requirement}。`
  if (field.kind === 'slug') return `用于生成稳定访问路径，只能包含小写字母、数字和短横线。`
  if (field.kind === 'integer' || field.kind === 'decimal') {
    const range = field.min !== undefined || field.max !== undefined
      ? `；允许范围${field.min ?? '不限'} 至 ${field.max ?? '不限'}`
      : ''
    return `填写${field.label}的数值；此项${requirement}${range}。`
  }
  const length = field.maxLength ? `，最多 ${field.maxLength} 个字符` : ''
  return `填写${field.label}；此项${requirement}${length}。`
}

function field(name: string, label: string, kind: AdminFieldKind, group: string, extra: Omit<AdminFieldDefinition, 'name' | 'label' | 'kind' | 'group'> = {}): AdminFieldDefinition {
  const definition: AdminFieldDefinition = { name, label, kind, group, ...extra }
  return Object.freeze({
    ...definition,
    placeholder: adminContentFieldPlaceholder(definition),
    help: adminContentFieldHelp(definition),
  })
}
function column(fieldName: string, label: string, kind: AdminColumnKind, extra: Omit<AdminListColumn, 'field' | 'label' | 'kind'> = {}): AdminListColumn {
  return Object.freeze({ field: fieldName, label, kind, ...extra })
}
function dynamicFilter(fieldName: string, label: string, kind: AdminFilterKind = 'select'): AdminFilterDefinition {
  return Object.freeze({ field: fieldName, label, kind, dynamic: true })
}
function staticFilter(fieldName: string, label: string, kind: AdminFilterKind, options: readonly AdminOption[]): AdminFilterDefinition {
  return Object.freeze({ field: fieldName, label, kind, options })
}
function sort(fieldName: string, label: string, direction: 'asc' | 'desc'): AdminSortDefinition {
  return Object.freeze({ field: fieldName, label, direction })
}
const commonDisplayFields = [
  field('visibility', '内容可见性', 'select', 'display', { required: true, defaultValue: 'hidden', options: visibilityOptions, help: '决定该记录可被哪些访问者查看。' }),
  field('is_featured', '首页精选', 'boolean', 'display', { required: true, defaultValue: false }),
  field('sort_order', '人工排序', 'integer', 'display', { required: true, defaultValue: 0, help: '数值越小越靠前。' }),
] as const

const definitions: Readonly<Record<AdminContentModule, AdminContentModuleDefinition>> = Object.freeze({
  profiles: {
    module: 'profiles', table: 'profiles', path: '/admin/profiles', title: '教师与团队', singularTitle: '团队成员', description: '维护教师、研究人员和团队成员资料。', primaryField: 'name', canCreate: true, canDelete: true,
    groups: [GROUPS.basic, GROUPS.identity, GROUPS.contact, GROUPS.content, GROUPS.links, GROUPS.media, GROUPS.display],
    fields: [
      field('name', '中文姓名', 'text', 'basic', { required: true, maxLength: 200 }), field('name_en', '英文姓名', 'text', 'basic', { nullable: true, maxLength: 200 }),
      field('role', '团队角色', 'text', 'identity', { nullable: true }), field('title', '职称或头衔', 'text', 'identity', { nullable: true }), field('organization', '单位', 'text', 'identity', { nullable: true }), field('lab', '实验室/团队', 'text', 'identity', { nullable: true }),
      field('email', '邮箱', 'email', 'contact', { nullable: true }), field('phone', '电话', 'text', 'contact', { nullable: true }), field('office', '办公室', 'text', 'contact', { nullable: true }), field('contact_visibility', '联系方式可见性', 'select', 'contact', { required: true, defaultValue: 'hidden', options: visibilityOptions }),
      field('bio', '中文简介', 'textarea', 'content', { nullable: true, rows: 7 }), field('bio_en', '英文简介', 'textarea', 'content', { nullable: true, rows: 7 }), field('education', '教育经历', 'textarea', 'content', { nullable: true, rows: 5 }), field('experience', '工作/科研经历', 'textarea', 'content', { nullable: true, rows: 5 }), field('recruiting', '招生说明', 'textarea', 'content', { nullable: true, rows: 5 }),
      field('orcid', 'ORCID', 'text', 'links', { nullable: true, placeholder: '0000-0000-0000-0000' }), field('personal_homepage', '个人主页', 'url', 'links', { nullable: true }), field('google_scholar', 'Google Scholar', 'url', 'links', { nullable: true }), field('dblp', 'DBLP', 'url', 'links', { nullable: true }), field('github', 'GitHub', 'url', 'links', { nullable: true }), field('cnki', 'CNKI', 'url', 'links', { nullable: true }),
      field('orcid_value', 'ORCID显示数值', 'integer', 'links', { nullable: true, min: 0, help: '选填；与对应平台链接一起显示，0也会显示。' }), field('personal_homepage_value', '个人主页显示数值', 'integer', 'links', { nullable: true, min: 0, help: '选填；与对应平台链接一起显示，0也会显示。' }), field('google_scholar_value', 'Google Scholar显示数值', 'integer', 'links', { nullable: true, min: 0, help: '选填；与对应平台链接一起显示，0也会显示。' }), field('dblp_value', 'DBLP显示数值', 'integer', 'links', { nullable: true, min: 0, help: '选填；与对应平台链接一起显示，0也会显示。' }), field('github_value', 'GitHub显示数值', 'integer', 'links', { nullable: true, min: 0, help: '选填；与对应平台链接一起显示，0也会显示。' }), field('cnki_value', 'CNKI显示数值', 'integer', 'links', { nullable: true, min: 0, help: '选填；与对应平台链接一起显示，0也会显示。' }),
      field('avatar_key', '头像媒体 Key', 'media', 'media', { nullable: true, help: '当前阶段可直接填写媒体 object_key；媒体选择器将在专项阶段接入。' }),
      field('is_active', '启用成员', 'boolean', 'display', { required: true, defaultValue: true }), ...commonDisplayFields,
    ],
    columns: [column('avatar_key', '照片', 'image', { width: 68, sortable: false, filterable: false, resizable: false, media: { purpose: 'avatar', altField: 'name', width: 72, height: 72, fallback: 'initials' } }), column('name', '姓名', 'text', { primary: true, minWidth: 145 }), column('role', '角色', 'text', { minWidth: 100 }), column('title', '职称', 'text', { minWidth: 110 }), column('organization', '单位', 'text', { minWidth: 180 }), column('visibility', '可见性', 'visibility', { width: 110 }), column('is_active', '启用', 'boolean', { width: 86 }), column('is_featured', '精选', 'boolean', { width: 84 }), column('updated_at', '更新时间', 'datetime', { width: 160 })],
    filters: [dynamicFilter('role', '团队角色'), dynamicFilter('organization', '单位'), staticFilter('visibility', '可见性', 'select', visibilityOptions), staticFilter('is_active', '启用状态', 'boolean', booleanOptions), staticFilter('is_featured', '首页精选', 'boolean', booleanOptions)],
    sorts: [sort('sort_order', '人工排序', 'asc'), sort('updated_at', '最近更新', 'desc'), sort('name', '姓名', 'asc'), sort('created_at', '创建时间', 'desc')], defaultSort: sort('sort_order', '人工排序', 'asc'), batchFields: ['visibility', 'is_active', 'is_featured', 'sort_order'],
  },
  research_interests: {
    module: 'research_interests', table: 'research_interests', path: '/admin/research', title: '研究方向', singularTitle: '研究方向', description: '维护研究主题、中英文说明、可见性和排序。', primaryField: 'name', canCreate: true, canDelete: true,
    groups: [GROUPS.basic, GROUPS.content, GROUPS.display],
    fields: [field('name', '中文名称', 'text', 'basic', { required: true }), field('name_en', '英文名称', 'text', 'basic', { nullable: true }), field('description', '方向说明', 'textarea', 'content', { nullable: true, rows: 7 }), field('visibility', '可见性', 'select', 'display', { required: true, defaultValue: 'hidden', options: visibilityOptions }), field('sort_order', '人工排序', 'integer', 'display', { required: true, defaultValue: 0 })],
    columns: [column('name', '方向名称', 'text', { primary: true, minWidth: 220 }), column('name_en', '英文名称', 'text', { minWidth: 180 }), column('visibility', '可见性', 'visibility', { width: 110 }), column('sort_order', '排序', 'integer', { width: 78 }), column('updated_at', '更新时间', 'datetime', { width: 160 })],
    filters: [staticFilter('visibility', '可见性', 'select', visibilityOptions)], sorts: [sort('sort_order', '人工排序', 'asc'), sort('updated_at', '最近更新', 'desc'), sort('name', '名称', 'asc')], defaultSort: sort('sort_order', '人工排序', 'asc'), batchFields: ['visibility', 'sort_order'],
  },
  publications: {
    module: 'publications', table: 'publications', path: '/admin/publications', title: '论文', singularTitle: '论文', description: '维护论文元数据、引用格式、PDF、索引信息和展示标签。', primaryField: 'title', canCreate: true, canDelete: true,
    groups: [GROUPS.basic, GROUPS.publication, GROUPS.citation, GROUPS.content, GROUPS.media, GROUPS.display],
    fields: [
      field('title', '论文题名', 'textarea', 'basic', { required: true, rows: 3 }), field('source_citation', '原始引用文本', 'textarea', 'basic', { nullable: true, rows: 4 }), field('authors', '作者列表', 'textarea', 'basic', { nullable: true, rows: 3 }), field('venue', '期刊或会议', 'text', 'publication', { nullable: true }), field('year', '年份', 'integer', 'publication', { nullable: true, min: 1, max: 9999 }), field('volume', '卷号', 'text', 'publication', { nullable: true }), field('issue', '期号', 'text', 'publication', { nullable: true }), field('pages', '页码/文章号', 'text', 'publication', { nullable: true }), field('doi', 'DOI', 'text', 'publication', { nullable: true }), field('url', '外部链接', 'url', 'publication', { nullable: true }), field('publication_type', '论文类型', 'text', 'publication', { nullable: true }), field('author_role', '作者角色', 'text', 'publication', { nullable: true }), field('corresponding_authors', '通讯作者', 'text', 'publication', { nullable: true }), field('index_type', '收录/索引类型', 'text', 'publication', { nullable: true }), field('display_tags', '展示标签', 'textarea', 'publication', { nullable: true, rows: 2 }),
      field('citation_gbt', 'GB/T 引用', 'textarea', 'citation', { nullable: true, rows: 3 }), field('highlight_gbt', 'GB/T 高亮文本', 'text', 'citation', { nullable: true }), field('citation_elsevier', 'Elsevier 引用', 'textarea', 'citation', { nullable: true, rows: 3 }), field('highlight_elsevier', 'Elsevier 高亮文本', 'text', 'citation', { nullable: true }), field('citation_apa', 'APA 引用', 'textarea', 'citation', { nullable: true, rows: 3 }), field('highlight_apa', 'APA 高亮文本', 'text', 'citation', { nullable: true }), field('citation_ieee', 'IEEE 引用', 'textarea', 'citation', { nullable: true, rows: 3 }), field('highlight_ieee', 'IEEE 高亮文本', 'text', 'citation', { nullable: true }), field('bibtex', 'BibTeX', 'textarea', 'citation', { nullable: true, preserveWhitespace: true, rows: 8 }),
      field('abstract', '摘要', 'textarea', 'content', { nullable: true, rows: 8 }), field('keywords', '关键词', 'textarea', 'content', { nullable: true, rows: 3 }), field('pdf_key', 'PDF 媒体 Key', 'media', 'media', { nullable: true }), field('pdf_visibility', 'PDF 可见性', 'select', 'media', { required: true, defaultValue: 'hidden', options: visibilityOptions }), ...commonDisplayFields,
    ],
    columns: [column('title', '论文题名', 'long-text', { primary: true, minWidth: 300 }), column('authors', '作者', 'long-text', { minWidth: 220 }), column('year', '年份', 'integer', { width: 78 }), column('venue', '期刊/会议', 'text', { minWidth: 180 }), column('publication_type', '类型', 'text', { width: 100 }), column('visibility', '可见性', 'visibility', { width: 110 }), column('is_featured', '精选', 'boolean', { width: 84 }), column('updated_at', '更新时间', 'datetime', { width: 160 })],
    filters: [dynamicFilter('year', '年份', 'integer'), dynamicFilter('publication_type', '论文类型'), dynamicFilter('index_type', '收录类型'), staticFilter('visibility', '可见性', 'select', visibilityOptions), staticFilter('is_featured', '首页精选', 'boolean', booleanOptions)], sorts: [sort('year', '年份（新到旧）', 'desc'), sort('updated_at', '最近更新', 'desc'), sort('sort_order', '人工排序', 'asc'), sort('title', '题名', 'asc')], defaultSort: sort('year', '年份（新到旧）', 'desc'), batchFields: ['visibility', 'pdf_visibility', 'is_featured', 'sort_order'],
  },
  projects: {
    module: 'projects', table: 'projects', path: '/admin/projects', title: '项目', singularTitle: '项目', description: '维护项目来源、基金、承担角色、成员、周期和经费。', primaryField: 'name', canCreate: true, canDelete: true,
    groups: [GROUPS.basic, GROUPS.identity, GROUPS.schedule, GROUPS.content, GROUPS.display],
    fields: [field('name', '项目名称', 'textarea', 'basic', { required: true, rows: 3 }), field('source', '项目来源', 'text', 'basic', { nullable: true }), field('fund_name', '基金/计划名称', 'text', 'basic', { nullable: true }), field('project_number', '项目编号', 'text', 'basic', { nullable: true }), field('project_role', '承担角色', 'text', 'identity', { nullable: true }), field('principal', '负责人', 'text', 'identity', { nullable: true }), field('members', '项目成员', 'textarea', 'identity', { nullable: true, rows: 3 }), field('start_date', '开始日期', 'date', 'schedule', { nullable: true }), field('end_date', '结束日期', 'date', 'schedule', { nullable: true }), field('status', '项目状态', 'text', 'schedule', { nullable: true }), field('amount', '经费金额（万元）', 'decimal', 'schedule', { nullable: true, help: '按人民币万元填写；英文前台自动乘以10,000显示CNY。' }), field('summary', '项目简介', 'textarea', 'content', { nullable: true, rows: 8 }), ...commonDisplayFields],
    columns: [column('name', '项目名称', 'long-text', { primary: true, minWidth: 280 }), column('principal', '负责人', 'text', { minWidth: 110 }), column('source', '来源', 'text', { minWidth: 135 }), column('project_role', '承担角色', 'text', { minWidth: 106 }), column('status', '状态', 'status', { width: 104 }), column('start_date', '开始日期', 'date', { width: 112 }), column('visibility', '可见性', 'visibility', { width: 110 }), column('is_featured', '精选', 'boolean', { width: 84 }), column('updated_at', '更新时间', 'datetime', { width: 160 })],
    filters: [dynamicFilter('source', '项目来源'), dynamicFilter('status', '项目状态'), staticFilter('visibility', '可见性', 'select', visibilityOptions), staticFilter('is_featured', '首页精选', 'boolean', booleanOptions)], sorts: [sort('start_date', '开始日期（新到旧）', 'desc'), sort('updated_at', '最近更新', 'desc'), sort('sort_order', '人工排序', 'asc'), sort('name', '项目名称', 'asc')], defaultSort: sort('start_date', '开始日期（新到旧）', 'desc'), batchFields: ['visibility', 'is_featured', 'sort_order'],
  },
  patents: {
    module: 'patents', table: 'patents', path: '/admin/patents', title: '专利与软件著作', singularTitle: '专利/软著', description: '维护申请、授权、发明人、法律状态和证书材料。', primaryField: 'name', canCreate: true, canDelete: true,
    groups: [GROUPS.basic, GROUPS.identity, GROUPS.schedule, GROUPS.content, GROUPS.media, GROUPS.display],
    fields: [field('name', '名称', 'textarea', 'basic', { required: true, rows: 3 }), field('country', '国家或地区', 'text', 'basic', { nullable: true }), field('patent_type', '类型', 'text', 'basic', { nullable: true }), field('application_number', '申请号', 'text', 'identity', { nullable: true }), field('grant_number', '授权号', 'text', 'identity', { nullable: true }), field('inventors', '发明人/作者', 'textarea', 'identity', { nullable: true, rows: 3 }), field('owner', '权利人', 'text', 'identity', { nullable: true }), field('application_date', '申请日期', 'date', 'schedule', { nullable: true }), field('grant_date', '授权日期', 'date', 'schedule', { nullable: true }), field('legal_status', '法律状态', 'text', 'schedule', { nullable: true }), field('summary', '简介', 'textarea', 'content', { nullable: true, rows: 7 }), field('certificate_key', '证书媒体 Key', 'media', 'media', { nullable: true }), ...commonDisplayFields],
    columns: [column('name', '名称', 'long-text', { primary: true, minWidth: 280 }), column('inventors', '发明人/作者', 'long-text', { minWidth: 190 }), column('patent_type', '类型', 'text', { width: 108 }), column('country', '国家/地区', 'text', { width: 96 }), column('application_number', '申请号', 'text', { minWidth: 140 }), column('legal_status', '法律状态', 'status', { width: 110 }), column('grant_date', '授权日期', 'date', { width: 112 }), column('visibility', '可见性', 'visibility', { width: 110 }), column('updated_at', '更新时间', 'datetime', { width: 160 })],
    filters: [dynamicFilter('country', '国家或地区'), dynamicFilter('patent_type', '类型'), dynamicFilter('legal_status', '法律状态'), staticFilter('visibility', '可见性', 'select', visibilityOptions)], sorts: [sort('grant_date', '授权日期（新到旧）', 'desc'), sort('application_date', '申请日期（新到旧）', 'desc'), sort('updated_at', '最近更新', 'desc'), sort('sort_order', '人工排序', 'asc')], defaultSort: sort('grant_date', '授权日期（新到旧）', 'desc'), batchFields: ['visibility', 'is_featured', 'sort_order'],
  },
  students: {
    module: 'students', table: 'students', path: '/admin/students', title: '学生', singularTitle: '学生', description: '维护培养层次、分类、方向、状态、获奖和毕业去向。', primaryField: 'name', canCreate: true, canDelete: true,
    groups: [GROUPS.basic, GROUPS.identity, GROUPS.contact, GROUPS.schedule, GROUPS.content, GROUPS.media, GROUPS.display],
    fields: [field('name', '中文姓名', 'text', 'basic', { required: true }), field('name_en', '英文姓名', 'text', 'basic', { nullable: true }), field('student_id', '学号', 'text', 'identity', { nullable: true }), field('degree', '培养层次', 'text', 'identity', { nullable: true }), field('category', '分类', 'text', 'identity', { nullable: true }), field('grade', '年级', 'text', 'identity', { nullable: true }), field('direction', '研究方向', 'text', 'identity', { nullable: true }), field('status', '状态', 'text', 'identity', { nullable: true }), field('email', '邮箱', 'email', 'contact', { nullable: true }), field('homepage', '个人主页', 'url', 'contact', { nullable: true }), field('contact_visibility', '联系方式可见性', 'select', 'contact', { required: true, defaultValue: 'hidden', options: visibilityOptions }), field('enrollment_date', '入学日期', 'date', 'schedule', { nullable: true }), field('graduation_date', '毕业日期', 'date', 'schedule', { nullable: true }), field('destination', '毕业去向', 'textarea', 'content', { nullable: true, rows: 3 }), field('awards', '获奖情况', 'textarea', 'content', { nullable: true, rows: 4 }), field('bio', '简介', 'textarea', 'content', { nullable: true, rows: 6 }), field('avatar_key', '头像媒体 Key', 'media', 'media', { nullable: true }), ...commonDisplayFields],
    columns: [column('avatar_key', '照片', 'image', { width: 68, sortable: false, filterable: false, resizable: false, media: { purpose: 'avatar', altField: 'name', width: 72, height: 72, fallback: 'initials' } }), column('name', '姓名', 'text', { primary: true, minWidth: 140 }), column('degree', '培养层次', 'text', { width: 100 }), column('category', '分类', 'text', { width: 100 }), column('grade', '年级', 'text', { width: 78 }), column('direction', '研究方向', 'text', { minWidth: 150 }), column('destination', '毕业去向', 'long-text', { minWidth: 190 }), column('status', '状态', 'status', { width: 100 }), column('visibility', '可见性', 'visibility', { width: 110 }), column('is_featured', '精选', 'boolean', { width: 84 }), column('updated_at', '更新时间', 'datetime', { width: 160 })],
    filters: [dynamicFilter('degree', '培养层次'), dynamicFilter('category', '分类'), dynamicFilter('grade', '年级'), dynamicFilter('direction', '研究方向'), dynamicFilter('status', '状态'), staticFilter('visibility', '可见性', 'select', visibilityOptions)], sorts: [sort('sort_order', '人工排序', 'asc'), sort('updated_at', '最近更新', 'desc'), sort('grade', '年级', 'desc'), sort('name', '姓名', 'asc')], defaultSort: sort('sort_order', '人工排序', 'asc'), batchFields: ['visibility', 'contact_visibility', 'is_featured', 'sort_order'],
  },
  student_category_displays: {
    module: 'student_category_displays', table: 'student_category_displays', path: '/admin/student-categories', title: '学生分类显示', singularTitle: '学生分类规则', description: '维护学生分组标签、关键词、启停和排序。', primaryField: 'label', canCreate: true, canDelete: true,
    groups: [GROUPS.basic, GROUPS.display], fields: [field('key', '分类 Key', 'text', 'basic', { required: true, help: '仅使用小写字母、数字、短横线或下划线。' }), field('label', '中文标签', 'text', 'basic', { required: true }), field('label_en', '英文标签', 'text', 'basic', { nullable: true }), field('keywords', '匹配关键词', 'textarea', 'basic', { nullable: true, rows: 4, help: '可使用逗号、分号或换行分隔。' }), field('enabled', '启用', 'boolean', 'display', { required: true, defaultValue: true }), field('display_order', '显示顺序', 'integer', 'display', { required: true, defaultValue: 0 })],
    columns: [column('label', '中文标签', 'text', { primary: true, minWidth: 150 }), column('key', 'Key', 'text', { minWidth: 130 }), column('label_en', '英文标签', 'text', { minWidth: 150 }), column('enabled', '启用', 'boolean', { width: 84 }), column('display_order', '显示顺序', 'integer', { width: 96 }), column('updated_at', '更新时间', 'datetime', { width: 160 })],
    filters: [staticFilter('enabled', '启用状态', 'boolean', booleanOptions)], sorts: [sort('display_order', '显示顺序', 'asc'), sort('updated_at', '最近更新', 'desc'), sort('label', '中文标签', 'asc')], defaultSort: sort('display_order', '显示顺序', 'asc'), batchFields: ['enabled', 'display_order'], uniqueFields: ['key'],
  },
  courses: {
    module: 'courses', table: 'courses', path: '/admin/courses', title: '课程', singularTitle: '课程', description: '维护课程学期、授课对象、简介、材料和参考资料。', primaryField: 'name', canCreate: true, canDelete: true,
    groups: [GROUPS.basic, GROUPS.content, GROUPS.media, GROUPS.display], fields: [field('name', '课程名称', 'text', 'basic', { required: true }), field('semester', '开课学期', 'text', 'basic', { nullable: true }), field('audience', '授课对象', 'text', 'basic', { nullable: true }), field('summary', '课程简介', 'textarea', 'content', { nullable: true, rows: 7 }), field('references_text', '参考资料', 'textarea', 'content', { nullable: true, rows: 6 }), field('syllabus_key', '教学大纲媒体 Key', 'media', 'media', { nullable: true }), field('material_key', '课程材料媒体 Key', 'media', 'media', { nullable: true }), field('material_visibility', '材料可见性', 'select', 'media', { required: true, defaultValue: 'hidden', options: visibilityOptions }), ...commonDisplayFields],
    columns: [column('name', '课程名称', 'text', { primary: true, minWidth: 200 }), column('semester', '学期', 'text', { width: 110 }), column('audience', '授课对象', 'text', { minWidth: 140 }), column('summary', '课程简介', 'long-text', { minWidth: 210 }), column('visibility', '课程可见性', 'visibility', { width: 120 }), column('material_visibility', '材料可见性', 'visibility', { width: 120 }), column('is_featured', '精选', 'boolean', { width: 84 }), column('updated_at', '更新时间', 'datetime', { width: 160 })],
    filters: [dynamicFilter('semester', '学期'), dynamicFilter('audience', '授课对象'), staticFilter('visibility', '课程可见性', 'select', visibilityOptions), staticFilter('material_visibility', '材料可见性', 'select', visibilityOptions)], sorts: [sort('semester', '学期（新到旧）', 'desc'), sort('updated_at', '最近更新', 'desc'), sort('sort_order', '人工排序', 'asc'), sort('name', '课程名称', 'asc')], defaultSort: sort('semester', '学期（新到旧）', 'desc'), batchFields: ['visibility', 'material_visibility', 'is_featured', 'sort_order'],
  },
  messages: {
    module: 'messages', table: 'messages', path: '/admin/messages', title: '联系留言', singularTitle: '留言', description: '查看访客原始留言并维护处理状态；原始内容保持只读。', primaryField: 'subject', canCreate: false, canDelete: false,
    groups: [GROUPS.basic, GROUPS.content, GROUPS.media, GROUPS.processing], fields: [field('name', '留言人姓名', 'text', 'basic', { nullable: true, readOnly: true }), field('email', '留言人邮箱', 'email', 'basic', { nullable: true, readOnly: true }), field('message_type', '留言类型', 'text', 'basic', { nullable: true, readOnly: true }), field('subject', '主题', 'textarea', 'basic', { nullable: true, readOnly: true, rows: 2 }), field('content', '留言正文', 'textarea', 'content', { required: true, readOnly: true, rows: 12 }), field('attachment_key', '附件媒体 Key', 'media', 'media', { nullable: true, readOnly: true }), field('status', '处理状态', 'select', 'processing', { required: true, defaultValue: 'new', options: messageStatusOptions }), field('visibility', '记录可见性', 'select', 'processing', { required: true, defaultValue: 'hidden', options: visibilityOptions, readOnly: true })],
    columns: [column('subject', '主题', 'long-text', { primary: true, minWidth: 220 }), column('content', '留言内容', 'long-text', { minWidth: 240 }), column('name', '留言人', 'text', { width: 105 }), column('email', '邮箱', 'text', { minWidth: 180 }), column('message_type', '类型', 'text', { width: 100 }), column('status', '状态', 'status', { width: 100 }), column('created_at', '提交时间', 'datetime', { width: 160 })],
    filters: [dynamicFilter('message_type', '留言类型'), staticFilter('status', '处理状态', 'select', messageStatusOptions)], sorts: [sort('created_at', '提交时间（新到旧）', 'desc'), sort('updated_at', '最近处理', 'desc'), sort('status', '处理状态', 'asc')], defaultSort: sort('created_at', '提交时间（新到旧）', 'desc'), batchFields: ['status'],
  },
})

const MODULE_SET = new Set<string>(ADMIN_CONTENT_MODULES)
export function isAdminContentModule(value: unknown): value is AdminContentModule { return typeof value === 'string' && MODULE_SET.has(value) }
export function adminContentModule(value: AdminContentModule): AdminContentModuleDefinition { return definitions[value] }
export function allAdminContentModules(): readonly AdminContentModuleDefinition[] { return ADMIN_CONTENT_MODULES.map(module => definitions[module]) }
export function isAdminContentAuthModule(value: AuthModule): value is AdminContentModule { return isAdminContentModule(value) }
export function adminContentModuleForPath(path: string): AdminContentModuleDefinition | null {
  if (typeof path !== 'string') return null
  const matches = ADMIN_CONTENT_MODULES.map(module => definitions[module]).filter(item => path === item.path || path.startsWith(`${item.path}/`)).sort((a, b) => b.path.length - a.path.length)
  return matches[0] ?? null
}
export type AdminContentRouteMode = 'list' | 'create' | 'edit'
export interface AdminContentRoute { readonly definition: AdminContentModuleDefinition; readonly mode: AdminContentRouteMode; readonly uid: string | null }
export function adminContentRoute(path: string): AdminContentRoute | null {
  const definition = adminContentModuleForPath(path)
  if (!definition) return null
  if (path === definition.path || path === `${definition.path}/`) return { definition, mode: 'list', uid: null }
  if (path === `${definition.path}/new`) return definition.canCreate ? { definition, mode: 'create', uid: null } : null
  const prefix = `${definition.path}/`
  if (!path.startsWith(prefix)) return null
  const raw = path.slice(prefix.length)
  if (!raw || raw.includes('/') || raw === 'new') return null
  let uid: string
  try { uid = decodeURIComponent(raw) } catch { return null }
  if (!uid || uid !== uid.trim() || /[\/?#%\u0000-\u001f\u007f]/u.test(uid) || new TextEncoder().encode(uid).byteLength > 256) return null
  return { definition, mode: 'edit', uid }
}

export { visibilityOptions as ADMIN_VISIBILITY_OPTIONS, booleanOptions as ADMIN_BOOLEAN_OPTIONS }
