import { adminOptionsWithTones, type AdminListPrimitive, type AdminOptionTone, type AdminUnifiedColumn, type AdminUnifiedColumnKind } from './unified-list'

export interface CompleteResourceOption {
  readonly value: AdminListPrimitive
  readonly label: string
  readonly tone?: AdminOptionTone
  readonly managed?: boolean
}

export interface CompleteResourceField {
  readonly key: string
  readonly label: string
  readonly type: string
  readonly options?: readonly CompleteResourceOption[]
  readonly min?: number
  readonly max?: number
  readonly maxLength?: number
  readonly group?: string
  readonly help?: string
  readonly placeholder?: string
  readonly format?: string
  readonly jsonType?: 'array' | 'object'
  readonly readonly?: boolean
  readonly secret?: boolean
  readonly default?: unknown
  readonly accept?: readonly string[]
  readonly clearWhenHidden?: boolean
  readonly visibleWhen?: Readonly<Record<string, unknown>>
  readonly requiredWhen?: Readonly<Record<string, unknown>>
  readonly required?: boolean
  readonly relationResource?: string
  readonly relationLabelField?: string
  readonly preserveWhitespace?: boolean
}

export interface CompleteResourceSchema {
  readonly key: string
  readonly label: string
  readonly titleField: string
  readonly fields: readonly CompleteResourceField[]
  readonly list: readonly string[]
  readonly filters?: readonly string[]
  readonly batch?: readonly string[]
  readonly quick?: readonly string[]
  readonly defaultSort?: readonly [string, 'asc' | 'desc']
  readonly readOnly?: boolean
  readonly readOnlyCreate?: boolean
  readonly description?: string
  readonly validation?: readonly Readonly<Record<string, any>>[]
}

export interface CompleteResourceModulesView {
  readonly modules: readonly CompleteResourceSchema[]
}

export interface CompleteResourceListView {
  readonly rows: readonly CompleteResourceRow[]
  readonly total: number
}

export interface CompleteResourceRow {
  readonly uid: string
  readonly updated_at: string
  readonly [key: string]: unknown
}

export function completeResourceFieldPlaceholder(field: Pick<CompleteResourceField, 'label' | 'type' | 'placeholder'>): string {
  if (field.placeholder) return field.placeholder
  if (field.type === 'select') return `请选择${field.label}`
  if (field.type === 'date') return `请选择${field.label}`
  if (field.type === 'datetime') return `请选择${field.label}的日期和时间`
  if (field.type === 'media') return `请选择${field.label}`
  if (field.type === 'relation') return `搜索并选择${field.label}`
  if (field.type === 'secret') return `留空则保持现有${field.label}`
  if (field.type === 'email') return '例如：name@example.com'
  if (field.type === 'url') return '例如：https://example.com'
  return `请输入${field.label}`
}

export function completeResourceFieldHelp(field: Pick<CompleteResourceField, 'label' | 'type' | 'required' | 'readonly' | 'help' | 'maxLength' | 'min' | 'max'>): string {
  if (field.help) return field.help
  if (field.readonly) return `${field.label}由系统维护，仅用于查看。`
  if (field.type === 'boolean') return `控制“${field.label}”是否启用，保存后立即按当前状态生效。`
  if (field.type === 'select') return `请选择${field.label}；此项${field.required ? '必填' : '可选'}。`
  if (field.type === 'date') return `请选择${field.label}；日期按本地时区保存。`
  if (field.type === 'datetime') return `请选择${field.label}；时间按本地时区录入并统一存储。`
  if (field.type === 'media') return `从媒体库选择${field.label}，系统将保存受管理媒体的 object key。`
  if (field.type === 'relation') return `搜索并关联一条${field.label}记录；清空后将解除当前关联。`
  if (field.type === 'secret') return '选择“替换”后填写新值；留空或保持现状都不会回显、覆盖已有密钥。'
  if (field.type === 'email') return `填写可用的邮箱地址；此项${field.required ? '必填' : '可选'}。`
  if (field.type === 'url') return `填写完整的 HTTPS 地址；此项${field.required ? '必填' : '可选'}。`
  if (field.type === 'integer') {
    const range = field.min !== undefined || field.max !== undefined ? `；允许范围 ${field.min ?? '不限'} 至 ${field.max ?? '不限'}` : ''
    return `填写${field.label}的整数值${range}。`
  }
  const length = field.maxLength ? `，最多 ${field.maxLength} 个字符` : ''
  return `填写${field.label}；此项${field.required ? '必填' : '可选'}${length}。`
}

const FALLBACK_LABELS: Readonly<Record<string, string>> = Object.freeze({
  uid: 'UID',
  created_at: '创建时间',
  updated_at: '更新时间',
})

const COMMON_COLUMN_WIDTHS: Readonly<Record<string, number>> = Object.freeze({
  is_active: 88,
  enabled: 86,
  is_featured: 84,
  sort_order: 78,
  display_order: 96,
  visibility: 110,
  status: 104,
  created_at: 160,
  updated_at: 160,
})

const RESOURCE_COLUMN_WIDTHS: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.freeze({
  'site-settings': { site_name: 220, site_name_en: 210 },
  'global-settings': { allow_public_registration: 132, allow_anonymous_messages: 132, translation_provider: 150 },
  navigation: { title: 190, kind: 106, location: 118, visibility: 110, enabled: 86, sort_order: 78, updated_at: 160 },
  news: { title: 260, slug: 190, category: 112, content_format: 108, published_at: 188, visibility: 110, is_featured: 84, updated_at: 160 },
})

function columnLayout(resourceKey: string, key: string, kind: AdminUnifiedColumnKind, twoLine: boolean): Pick<AdminUnifiedColumn, 'width' | 'minWidth'> {
  const tailored = RESOURCE_COLUMN_WIDTHS[resourceKey]?.[key] ?? COMMON_COLUMN_WIDTHS[key]
  if (twoLine) return { minWidth: tailored ?? 220 }
  if (tailored !== undefined) return { width: tailored }
  if (kind === 'datetime') return { width: 160 }
  if (kind === 'date') return { width: 112 }
  if (kind === 'integer' || kind === 'decimal') return { width: 84 }
  if (kind === 'boolean') return { width: 86 }
  if (kind === 'enum' || kind === 'visibility' || kind === 'status') return { width: 108 }
  return { minWidth: 140 }
}

export function completeResourceField(schema: CompleteResourceSchema, key: string): CompleteResourceField | undefined {
  return schema.fields.find(field => field.key === key)
}

export function completeResourceLabel(schema: CompleteResourceSchema, key: string): string {
  return completeResourceField(schema, key)?.label ?? FALLBACK_LABELS[key] ?? key
}

function completeBooleanOptions(key: string): readonly CompleteResourceOption[] {
  if (key === 'is_active' || key === 'enabled') return [{ value: 1, label: '启用', tone: 'success' }, { value: 0, label: '停用', tone: 'danger' }]
  if (key === 'is_featured') return [{ value: 1, label: '精选', tone: 'success' }, { value: 0, label: '未精选', tone: 'info' }]
  if (key.startsWith('allow_') || key.endsWith('_allow_download')) return [{ value: 1, label: '允许', tone: 'success' }, { value: 0, label: '禁止', tone: 'danger' }]
  return [{ value: 1, label: '是', tone: 'success' }, { value: 0, label: '否', tone: 'danger' }]
}

export function completeResourceColumns(schema: CompleteResourceSchema, resourceKey: string): AdminUnifiedColumn[] {
  return schema.list
    .filter(key => key !== 'uid' && key !== 'created_at')
    .slice(0, 8)
    .map(key => {
      const field = completeResourceField(schema, key)
      const kind = key === 'visibility'
        ? 'visibility'
        : key === 'status'
          ? 'status'
          : key.endsWith('_at')
            ? 'datetime'
            : field?.type === 'boolean'
              ? 'boolean'
              : field?.type === 'select'
                ? 'enum'
              : field?.type === 'integer'
                ? 'integer'
                : field?.type === 'textarea'
                  ? 'long-text'
                  : 'text'
      const twoLine = kind === 'long-text' || key === schema.titleField || ['title', 'name', 'description', 'summary', 'authors', 'author'].includes(key)
      return {
        key,
        label: resourceKey === 'news' && key === 'published_at' ? '发布状态 / 时间' : completeResourceLabel(schema, key),
        kind,
        ...columnLayout(resourceKey, key, kind, twoLine),
        primary: key === schema.titleField,
        sortable: true,
        filterable: true,
        resizable: true,
        twoLine,
        quickEdit: Boolean((schema.quick ?? schema.batch)?.includes(key) && ['boolean', 'visibility', 'status'].includes(kind)),
        options: field?.type === 'boolean'
          ? completeBooleanOptions(key)
          : adminOptionsWithTones(field?.options ?? [], kind),
      }
    })
}
