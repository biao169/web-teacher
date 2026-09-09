import type { AdminContentModuleDefinition, AdminFieldDefinition } from '~~/shared/admin/content-modules'
import type { CompleteResourceField, CompleteResourceOption, CompleteResourceSchema } from './complete-resource'
import { getAdminSpecialField, type AdminSpecialFieldSpec } from '../shared/admin/special-fields'

export type AdminEditorFieldSource = 'content' | 'complete'
export type AdminEditorControl =
  | 'text'
  | 'textarea'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'select'
  | 'date'
  | 'datetime'
  | 'email'
  | 'url'
  | 'slug'
  | 'media'
  | 'relation'
  | 'suggestion'
  | 'richtext'
  | 'secret'

export interface AdminEditorOption {
  readonly value: string | number | boolean | null
  readonly label: string
  readonly managed?: boolean
}

/**
 * UI-only field contract shared by both admin schema systems.
 *
 * This contract deliberately does not replace either server descriptor. It is
 * an adapter boundary that lets reusable editor controls evolve without
 * changing persistence validation or the database schema.
 */
export interface AdminEditorFieldDescriptor {
  readonly source: AdminEditorFieldSource
  readonly module: string
  readonly key: string
  readonly label: string
  readonly group: string
  readonly baseControl: string
  readonly control: AdminEditorControl
  readonly required: boolean
  readonly readOnly: boolean
  readonly wide: boolean
  readonly placeholder: string
  readonly help: string
  readonly rows?: number
  readonly min?: number
  readonly max?: number
  readonly maxLength?: number
  readonly options: readonly AdminEditorOption[]
  readonly accept: readonly string[]
  readonly relationResource?: string
  readonly relationLabelField?: string
  readonly booleanValueMode: 'boolean' | 'integer'
  readonly preserveWhitespace: boolean
  readonly dateTimeValueFormat: string
  readonly enhancement: AdminSpecialFieldSpec | null
}

function controlFor(baseControl: string, enhancement: AdminSpecialFieldSpec | null): AdminEditorControl {
  if (enhancement) return enhancement.kind
  const supported: readonly AdminEditorControl[] = [
    'text', 'textarea', 'integer', 'decimal', 'boolean', 'select', 'date', 'datetime',
    'email', 'url', 'slug', 'media', 'relation', 'secret',
  ]
  return supported.includes(baseControl as AdminEditorControl) ? baseControl as AdminEditorControl : 'text'
}

function normalizedOptions(options: readonly CompleteResourceOption[] | readonly { readonly value: string; readonly label: string }[] | undefined): readonly AdminEditorOption[] {
  return Object.freeze((options ?? []).map(option => Object.freeze({
    value: option.value,
    label: option.label,
    ...('managed' in option && option.managed ? { managed: true } : {}),
  })))
}

function enhancedHelp(value: string | undefined, enhancement: AdminSpecialFieldSpec | null): string {
  const help = value ?? ''
  if (enhancement?.kind !== 'suggestion') return help
  const suffix = enhancement.multiple
    ? '点击输入框可复用本功能其他对象填过的值；多个值请使用中文或英文分号分隔。'
    : '点击输入框可复用本功能其他对象填过的值，也可以继续填写新值。'
  return help ? help + ' ' + suffix : suffix
}

export function contentEditorFieldDescriptor(module: string, field: AdminFieldDefinition): AdminEditorFieldDescriptor {
  const enhancement = getAdminSpecialField(module, field.name)
  return Object.freeze({
    source: 'content',
    module,
    key: field.name,
    label: field.label,
    group: field.group,
    baseControl: field.kind,
    control: controlFor(field.kind, enhancement),
    required: Boolean(field.required),
    readOnly: Boolean(field.readOnly),
    wide: field.kind === 'textarea' || field.kind === 'media' || enhancement?.kind === 'media' || enhancement?.kind === 'richtext',
    placeholder: field.placeholder ?? '',
    help: enhancedHelp(field.help, enhancement),
    ...(field.rows === undefined ? {} : { rows: field.rows }),
    ...(field.min === undefined ? {} : { min: field.min }),
    ...(field.max === undefined ? {} : { max: field.max }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    options: normalizedOptions(field.options),
    accept: Object.freeze([...(enhancement?.accepts ?? [])]),
    booleanValueMode: 'boolean',
    preserveWhitespace: Boolean(field.preserveWhitespace),
    dateTimeValueFormat: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
    enhancement,
  })
}

export function completeEditorFieldDescriptor(resourceKey: string, field: CompleteResourceField): AdminEditorFieldDescriptor {
  const enhancement = getAdminSpecialField(resourceKey, field.key)
  const accept = enhancement?.accepts ?? field.accept ?? []
  return Object.freeze({
    source: 'complete',
    module: resourceKey,
    key: field.key,
    label: field.label,
    group: field.group || '基本信息',
    baseControl: field.type,
    control: controlFor(field.type, enhancement),
    required: Boolean(field.required),
    readOnly: Boolean(field.readonly),
    wide: field.type === 'textarea' || field.type === 'secret' || field.type === 'media' || enhancement?.kind === 'media' || enhancement?.kind === 'richtext',
    placeholder: field.placeholder ?? '',
    help: enhancedHelp(field.help, enhancement),
    ...(field.type === 'textarea' ? { rows: field.maxLength !== undefined && field.maxLength > 50_000 ? 12 : 5 } : {}),
    ...(field.min === undefined ? {} : { min: field.min }),
    ...(field.max === undefined ? {} : { max: field.max }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    options: normalizedOptions(field.options),
    accept: Object.freeze([...accept]),
    ...(field.relationResource ? { relationResource: field.relationResource } : enhancement?.relationModule ? { relationResource: enhancement.relationModule } : {}),
    ...(field.relationLabelField ? { relationLabelField: field.relationLabelField } : {}),
    booleanValueMode: 'integer',
    preserveWhitespace: Boolean(field.preserveWhitespace),
    dateTimeValueFormat: 'YYYY-MM-DDTHH:mm:ss.SSS[Z]',
    enhancement,
  })
}

export function contentEditorFieldDescriptors(definition: AdminContentModuleDefinition): readonly AdminEditorFieldDescriptor[] {
  return Object.freeze(definition.fields.map(field => contentEditorFieldDescriptor(definition.module, field)))
}

export function completeEditorFieldDescriptors(resource: CompleteResourceSchema): readonly AdminEditorFieldDescriptor[] {
  return Object.freeze(resource.fields.map(field => completeEditorFieldDescriptor(resource.key, field)))
}
