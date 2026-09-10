export type AdminListPrimitive = string | number | boolean | null

export type AdminOptionTone = 'success' | 'warning' | 'danger' | 'info' | 'primary'

export interface AdminListOption {
  readonly value: AdminListPrimitive
  readonly label: string
  readonly tone?: AdminOptionTone
}

export type AdminUnifiedColumnKind =
  | 'text'
  | 'long-text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'enum'
  | 'visibility'
  | 'status'
  | 'date'
  | 'datetime'
  | 'image'

export interface AdminUnifiedColumn {
  readonly key: string
  readonly label: string
  readonly kind?: AdminUnifiedColumnKind
  readonly width?: number
  readonly minWidth?: number
  readonly primary?: boolean
  readonly sortable?: boolean
  readonly filterable?: boolean
  readonly resizable?: boolean
  readonly twoLine?: boolean
  readonly quickEdit?: boolean
  readonly options?: readonly AdminListOption[]
}

export interface AdminUnifiedSortChange {
  readonly prop?: string
  readonly order?: 'ascending' | 'descending' | null
}

export interface AdminUnifiedTableRow {
  readonly uid?: unknown
  readonly [key: string]: unknown
}

const OPTION_TONES: Readonly<Record<string, AdminOptionTone>> = Object.freeze({
  true: 'success',
  '1': 'success',
  active: 'success',
  enabled: 'success',
  success: 'success',
  published: 'success',
  completed: 'success',
  approved: 'success',
  current: 'success',
  available: 'success',
  replied: 'success',
  public: 'success',
  new: 'warning',
  pending: 'warning',
  waiting: 'warning',
  paused: 'warning',
  draft: 'warning',
  trash: 'warning',
  authenticated: 'warning',
  owner: 'warning',
  scheduled: 'warning',
  processing: 'warning',
  restricted: 'warning',
  false: 'danger',
  '0': 'danger',
  disabled: 'danger',
  locked: 'danger',
  failed: 'danger',
  error: 'danger',
  rejected: 'danger',
  blocked: 'danger',
  inactive: 'danger',
  invalid: 'danger',
  expired: 'danger',
  hidden: 'info',
  archived: 'info',
  automatic: 'info',
  auto: 'info',
  staff: 'primary',
  internal: 'primary',
  manual: 'primary',
  running: 'primary',
  plain: 'info',
  markdown: 'primary',
  html: 'success',
  route: 'primary',
  external: 'warning',
  anchor: 'info',
  button: 'success',
  header: 'primary',
  hero: 'success',
  footer: 'info',
  'admin-sidebar': 'warning',
  normal: 'info',
  primary: 'primary',
  secondary: 'warning',
  browser: 'info',
  pdfjs: 'primary',
  libretranslate: 'info',
  deepl: 'success',
  google: 'primary',
  microsoft: 'warning',
  mymemory: 'info',
  crossref: 'primary',
  openalex: 'success',
  'semantic-scholar': 'warning',
  gbt: 'primary',
  elsevier: 'success',
  apa: 'warning',
  ieee: 'info',
})

function normalizedOptionValue(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

export function adminBooleanValue(value: unknown): boolean | null {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return null
}

export function adminOptionTone(value: unknown, kind: AdminUnifiedColumnKind = 'status'): AdminOptionTone | undefined {
  if (kind === 'boolean') {
    const state = adminBooleanValue(value)
    return state === null ? 'info' : state ? 'success' : 'danger'
  }
  const tone = OPTION_TONES[normalizedOptionValue(value)]
  if (tone) return tone
  return ['enum', 'visibility', 'status'].includes(kind) ? 'info' : undefined
}

export function adminColumnOption(column: Pick<AdminUnifiedColumn, 'options'>, value: unknown): AdminListOption | undefined {
  const normalized = normalizedOptionValue(value)
  return column.options?.find(option => normalizedOptionValue(option.value) === normalized)
}

export function adminColumnOptionTone(column: Pick<AdminUnifiedColumn, 'kind' | 'options'>, value: unknown): AdminOptionTone | undefined {
  const option = adminColumnOption(column, value)
  return option?.tone ?? adminOptionTone(option?.value ?? value, column.kind)
}

export function adminColumnOptionLabel(column: Pick<AdminUnifiedColumn, 'options'>, value: unknown): string | undefined {
  return adminColumnOption(column, value)?.label
}

export function adminOptionsWithTones(options: readonly AdminListOption[], kind: AdminUnifiedColumnKind): AdminListOption[] {
  return options.map(option => {
    const tone = option.tone ?? adminOptionTone(option.value, kind)
    return tone ? { ...option, tone } : { ...option }
  })
}

export function adminColumnDefaultWidth(column: AdminUnifiedColumn): number {
  if (column.width !== undefined) return column.width
  if (column.minWidth !== undefined) return column.minWidth
  if (column.kind === 'datetime') return 160
  if (column.kind === 'date') return 112
  if (column.kind === 'integer' || column.kind === 'decimal') return 84
  if (column.kind === 'boolean') return 86
  if (column.kind === 'enum' || column.kind === 'visibility' || column.kind === 'status') return 108
  if (column.kind === 'image') return 68
  if (column.kind === 'long-text' || column.twoLine) return column.primary ? 250 : 210
  return Math.min(220, Math.max(112, (column.label.length * 14) + 68))
}

function actionLabelUnits(label: string): number {
  return [...label].reduce((total, character) => total + ((character.codePointAt(0) ?? 0) <= 0xff ? 1 : 2), 0)
}

const ADMIN_ACTION_COLUMN_MIN_WIDTH = 72
const ADMIN_ACTION_COLUMN_MAX_WIDTH = 280
const ADMIN_ACTION_BUTTON_GAP = 4
const ADMIN_ACTION_COLUMN_PADDING = 14

export interface AdminActionColumnLayout {
  readonly columns: number
  readonly rows: 1 | 2
  readonly width: number
}

export function adminActionGridColumns(actionCount: number, maxRows = 2): number {
  const count = Math.max(0, Math.floor(actionCount))
  if (count <= 3) return Math.max(1, count)
  return Math.max(1, Math.ceil(count / Math.min(2, Math.max(1, Math.floor(maxRows)))))
}

/**
 * Keep one to three standard actions on one line. Larger action sets stay on one
 * line while their estimated content width fits, and otherwise use at most two
 * rows. Labels are the only page-level input so workspaces never guess pixels.
 */
export function adminActionColumnLayout(labels: readonly string[], maxWidth = ADMIN_ACTION_COLUMN_MAX_WIDTH): AdminActionColumnLayout {
  if (!labels.length) return { columns: 1, rows: 1, width: ADMIN_ACTION_COLUMN_MIN_WIDTH }
  const buttonWidths = labels.map(label => 28 + (actionLabelUnits(label) * 7))
  const singleRowWidth = buttonWidths.reduce((total, width) => total + width, 0) + (Math.max(0, labels.length - 1) * ADMIN_ACTION_BUTTON_GAP) + ADMIN_ACTION_COLUMN_PADDING
  const useTwoRows = labels.length > 3 && singleRowWidth > maxWidth
  const columns = useTwoRows ? adminActionGridColumns(labels.length) : labels.length
  const widths = Array.from({ length: columns }, () => 0)
  buttonWidths.forEach((buttonWidth, index) => {
    const column = index % columns
    widths[column] = Math.max(widths[column] ?? 0, buttonWidth)
  })
  const gaps = Math.max(0, columns - 1) * ADMIN_ACTION_BUTTON_GAP
  const width = Math.min(maxWidth, Math.max(ADMIN_ACTION_COLUMN_MIN_WIDTH, widths.reduce((total, itemWidth) => total + itemWidth, 0) + gaps + ADMIN_ACTION_COLUMN_PADDING))
  return { columns, rows: useTwoRows ? 2 : 1, width }
}

export function adminActionColumnWidth(labels: readonly string[]): number {
  return adminActionColumnLayout(labels).width
}
