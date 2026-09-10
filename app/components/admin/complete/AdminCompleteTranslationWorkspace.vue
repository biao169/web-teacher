<script setup lang="ts">
import { runTranslationQueue, type TranslationProgress, type TranslationScanPage, type TranslationRunPage } from '~/admin/translation-runner'
import { useAdminEditorLifecycle } from '~/composables/useAdminEditorLifecycle'
import { ElAlert, ElButton, ElCard, ElDescriptions, ElDescriptionsItem, ElForm, ElInput, ElMessage, ElMessageBox, ElPagination, ElProgress, ElTag } from 'element-plus'
import { ElOption, ElSelect } from '~/admin/element-plus-ts6'
import { adminErrorDetails } from '~/admin/errors'
import { formatAdminDateTime as formatTime } from '~/admin/formatters'
import { adminColumnOptionLabel, adminColumnOptionTone, type AdminListPrimitive, type AdminUnifiedColumn, type AdminUnifiedSortChange, type AdminUnifiedTableRow } from '~/admin/unified-list'
import { hasAdminPermission } from '~~/shared/admin/registry'
import { translationFailureMessage } from '~~/shared/admin/translation'
import AdminDataTable from '../shared/AdminDataTable.vue'
import AdminListToolbar from '../shared/AdminListToolbar.vue'
import AdminRowActions from '../shared/AdminRowActions.vue'
import AdminEditorShell from '../shared/AdminEditorShell.vue'
import AdminFormItem from '../shared/AdminFormItem.vue'

interface TranslationRow extends AdminUnifiedTableRow {
  uid: string
  source_ref_key: string
  source_text: string
  translated_text: string | null
  source_lang: string
  target_lang: string
  provider: string | null
  status: 'pending' | 'success' | 'failed'
  is_manual: number
  is_current: number
  source_refs: string
  error_message: string | null
  updated_at: string
}

interface TranslationOverview {
  deduplication?: { records: number; uniqueTexts: number }
  configuredProvider?: string | null
  readyProviders?: string[]
  warnings?: string[]
  usesDefault?: boolean
  provider?: string | null
  providers?: string[]
  batchSize?: number
  workerCount?: number
  timeoutSeconds?: number
  maxAttempts?: number
  totals?: Partial<Record<'pending' | 'success' | 'failed' | 'manual' | 'inactive', number>>
  state?: TranslationTaskState
}

interface TranslationTaskState {
  lastError?: string
  status?: string
  total?: number
  completed?: number
  failed?: number
  updatedAt?: string
}

interface TranslationMetadata {
  sourceUpdatedAt?: string
  attemptCount?: number
  retryAfter?: string | null
}

interface TranslationScanResult {
  scanned: number
  needed: number
  refreshed: number
  invalidated: number
  suppressed: number
  truncated: boolean
  completedAt: string
}

interface TranslationBatchResult {
  uniqueTexts?: number
  duplicateTexts?: number
  failures?: Array<{ provider: string | null; code: string; message: string; count: number }>
  processed?: number
  completed?: number
  failed?: number
  stale?: number
  providerRequests?: number
  savedRequests?: number
  status?: string
}

type TranslationAction = 'auto' | 'scan' | 'batch' | 'pause' | 'resume' | 'retry' | 'invalidate' | 'test'

const { request } = useCompleteAdminApi()
const auth = useAuthSession()
const route = useRoute()
const router = useRouter()
const currentUser = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)
const canEdit = computed(() => hasAdminPermission(currentUser.value, 'translation_cache', 'edit'))
const overview = ref<TranslationOverview | null>(null)
const rows = ref<TranslationRow[]>([])
const selectedRows = ref<TranslationRow[]>([])
const loading = ref(false)
const activeAction = ref<TranslationAction | null>(null)
const running = computed(() => activeAction.value !== null)
const scanNotice = ref<{ type: 'success' | 'warning' | 'error'; title: string } | null>(null)
const lastScan = ref<TranslationScanResult | null>(null)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const scanLimit = ref(500)
const q = ref('')
const filterValues = reactive<Record<string, AdminListPrimitive | undefined>>({ is_current: true })
const sort = ref('updated_at')
const direction = ref<'asc' | 'desc'>('desc')
const edit = ref<TranslationRow | null>(null)
const editText = ref('')
const editOriginal = ref('')
const saving = ref(false)
const editorError = ref('')
const editConflict = ref(false)
const providerNotice = ref<{ type: 'success' | 'warning' | 'error'; title: string } | null>(null)

const state = computed<TranslationTaskState>(() => overview.value?.state ?? {})
const totals = computed(() => ({ pending: 0, success: 0, failed: 0, manual: 0, inactive: 0, ...(overview.value?.totals ?? {}) }))
const isPaused = computed(() => state.value.status === 'paused')
const progress = computed(() => {
  const all = Number(state.value.total ?? 0)
  return all > 0 ? Math.min(100, Math.round(Number(state.value.completed ?? 0) / all * 100)) : 0
})
const selectedFailed = computed(() => selectedRows.value.filter(row => row.status === 'failed' && row.is_current === 1 && row.is_manual !== 1))
const selectedCurrent = computed(() => selectedRows.value.filter(row => row.is_current === 1))
const selectedTranslatable = computed(() => selectedRows.value.filter(row => row.is_current === 1 && row.is_manual !== 1))
const dirty = computed(() => Boolean(edit.value && editText.value !== editOriginal.value))
const editor = useAdminEditorLifecycle({ dirty: () => dirty.value, busy: () => running.value })
const editQueryUid = computed(() => typeof route.query.edit === 'string' ? route.query.edit.trim() : '')
const hasEditQuery = computed(() => route.query.edit !== undefined)
const columns = computed<AdminUnifiedColumn[]>(() => [
  { key: 'source_ref_key', label: '来源', kind: 'long-text', minWidth: 260, sortable: true, filterable: true, resizable: true, twoLine: true },
  { key: 'source_text', label: '原文', kind: 'long-text', minWidth: 220, sortable: true, filterable: true, resizable: true, twoLine: true },
  { key: 'translated_text', label: '译文', kind: 'long-text', minWidth: 220, sortable: true, filterable: true, resizable: true, twoLine: true },
  { key: 'provider', label: 'Provider', kind: 'enum', width: 116, sortable: true, filterable: true, resizable: true, options: [...(overview.value?.providers ?? []), 'manual'].map(value => ({ value, label: value === 'manual' ? '人工' : value, tone: value === 'manual' ? 'primary' : 'info' })) },
  { key: 'status', label: '状态', kind: 'status', width: 96, sortable: true, filterable: true, resizable: true, options: [{ value: 'pending', label: '待处理', tone: 'warning' }, { value: 'success', label: '成功', tone: 'success' }, { value: 'failed', label: '失败', tone: 'danger' }] },
  { key: 'is_manual', label: '维护方式', kind: 'boolean', width: 92, sortable: true, filterable: true, resizable: true, options: [{ value: true, label: '人工', tone: 'primary' }, { value: false, label: '自动', tone: 'info' }] },
  { key: 'is_current', label: '有效', kind: 'boolean', width: 82, sortable: true, filterable: true, resizable: true, options: [{ value: true, label: '当前有效', tone: 'success' }, { value: false, label: '已失效', tone: 'danger' }] },
  { key: 'updated_at', label: '更新时间', kind: 'datetime', width: 160, sortable: true, filterable: true, resizable: true },
])
function actionErrorText(value: unknown, fallback: string): string {
  const detail = adminErrorDetails(value, fallback)
  const known: Record<string, string> = {
    PERMISSION_DENIED: '当前账号没有修改翻译任务的权限。',
    AUTHENTICATION_REQUIRED: '登录状态已失效，请重新登录。',
    INVALID_SCAN_LIMIT: '扫描上限无效，请选择 200～2000 项。',
    INVALID_TRANSLATION_RUN_SELECTION: '请选择 1～50 条当前有效的自动翻译记录。',
    TRANSLATION_CONFIGURATION_REQUIRED: translationFailureMessage('TRANSLATION_CONFIGURATION_REQUIRED'),
    TRANSLATION_JOB_PAUSED: '翻译任务已暂停，请先恢复任务。',
    TRANSLATION_EDIT_CONFLICT: '该译文已被其他管理员更新，当前输入已保留，请核对后再次保存。',
    TRANSLATION_SOURCE_CHANGED: '中文来源已变化或该记录已失效，当前输入已保留；请返回列表执行扫描与校准。',
    INVALID_TRANSLATED_TEXT: '英文译文不能为空，且不能超过 500000 个字符。',
  }
  const message = known[detail.code] ?? detail.message
  return detail.requestId ? `${message}（请求编号：${detail.requestId}）` : message
}
function actionIs(value: TranslationAction): boolean { return activeAction.value === value }
function beginAction(value: TranslationAction): boolean {
  if (!canEdit.value || activeAction.value) return false
  activeAction.value = value
  return true
}
function finishAction(value: TranslationAction): void {
  if (activeAction.value === value) activeAction.value = null
}
function metadata(row: TranslationRow): TranslationMetadata {
  try {
    const value: unknown = typeof row.source_refs === 'string' ? JSON.parse(row.source_refs) : row.source_refs
    return Array.isArray(value) && value[0] && typeof value[0] === 'object' ? value[0] as TranslationMetadata : {}
  } catch { return {} }
}
function statusLabel(value: string): string {
  return ({ pending: '待处理', success: '成功', failed: '失败', paused: '已暂停', running: '运行中', waiting: '等待重试', completed: '已完成', idle: '空闲', invalid: '状态异常' } as Record<string, string>)[value] ?? value
}
function statusType(value: string): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (value === 'success' || value === 'completed') return 'success'
  if (value === 'failed' || value === 'invalid') return 'danger'
  if (value === 'pending' || value === 'waiting' || value === 'paused') return 'warning'
  if (value === 'running') return 'primary'
  return 'info'
}
function optionLabel(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): string { return adminColumnOptionLabel(column, row[column.key]) ?? String(row[column.key] ?? '—') }
function optionTone(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): 'success' | 'warning' | 'danger' | 'info' | 'primary' { return adminColumnOptionTone(column, row[column.key]) ?? 'info' }
function cancelled(value: unknown): boolean {
  return value === 'cancel' || value === 'close' || Boolean(value && typeof value === 'object' && 'message' in value && (value as { message?: unknown }).message === 'cancel')
}
async function load(showError = true): Promise<boolean> {
  loading.value = true
  try {
    const [summary, list] = await Promise.all([
      request<TranslationOverview>('/api/v1/admin/complete/translation/overview'),
      request<{ rows?: TranslationRow[]; total?: number }>('/api/v1/admin/complete/resource/translation', {
        query: {
          page: page.value, pageSize: pageSize.value, q: q.value,
          ...Object.fromEntries(Object.entries(filterValues).filter(([, item]) => item !== undefined && item !== '').map(([key, item]) => [`f_${key}`, item])),
          sort: sort.value, direction: direction.value,
        },
      }),
    ])
    overview.value = summary
    rows.value = list.rows ?? []
    total.value = Number(list.total ?? 0)
    selectedRows.value = []
    return true
  } catch (value: unknown) {
    if (showError) ElMessage.error(actionErrorText(value, '翻译数据读取失败'))
    return false
  } finally { loading.value = false }
}
function search() { page.value = 1; void load() }
function setFilter(key: string, value: AdminListPrimitive | undefined): void {
  if (value === undefined) Reflect.deleteProperty(filterValues, key)
  else filterValues[key] = value
}
function columnFilter(key: string, value: AdminListPrimitive | undefined): void { setFilter(key, value); search() }
function onSort(value: AdminUnifiedSortChange): void {
  if (!value.prop || !value.order) return
  sort.value = value.prop
  direction.value = value.order === 'ascending' ? 'asc' : 'desc'
  search()
}
function setSelection(value: AdminUnifiedTableRow[]): void { selectedRows.value = value as TranslationRow[] }
function translationRow(value: AdminUnifiedTableRow): TranslationRow { return value as TranslationRow }

async function scan() {
  if (!beginAction('scan')) return
  scanNotice.value = null
  lastScan.value = null
  try {
    const value = await request<Omit<TranslationScanResult, 'completedAt'>>('/api/v1/admin/complete/translation/scan', { method: 'POST', body: { limit: Number(scanLimit.value) } })
    const result: TranslationScanResult = {
      scanned: Number(value.scanned ?? 0), needed: Number(value.needed ?? 0), refreshed: Number(value.refreshed ?? 0),
      invalidated: Number(value.invalidated ?? 0), suppressed: Number(value.suppressed ?? 0), truncated: value.truncated === true,
      completedAt: new Date().toISOString(),
    }
    lastScan.value = result
    const suffix = result.truncated ? '；本次仅扫描一页，点击“自动运行至完成”可连续扫描全部来源' : ''
    const title = `扫描 ${result.scanned} 个字段，新增/更新 ${result.needed} 项，校准 ${result.refreshed} 项，失效 ${result.invalidated} 项${suffix}`
    const refreshed = await load(false)
    scanNotice.value = refreshed
      ? { type: result.truncated ? 'warning' : 'success', title }
      : { type: 'warning', title: `${title}；扫描已完成，但统计刷新失败，请点击刷新重试。` }
    ElMessage[result.truncated || !refreshed ? 'warning' : 'success'](scanNotice.value.title)
  } catch (value: unknown) {
    const title = actionErrorText(value, '扫描与校准失败，请稍后重试。')
    scanNotice.value = { type: 'error', title }
    ElMessage.error(title)
  } finally { finishAction('scan') }
}
async function runBatch(uids: string[] = []) {
  if (!beginAction('batch')) return
  providerNotice.value = null
  try {
    const value = await request<TranslationBatchResult>('/api/v1/admin/complete/translation/run', { method: 'POST', body: uids.length ? { uids } : {} })
    if (value.failures?.length) providerNotice.value = { type: 'warning', title: value.failures.map(item => `${item.provider ?? '翻译配置'}：${item.message}（${item.count} 项）`).join('；') }
    if (!value.processed) ElMessage.info(value.status === 'waiting' ? '失败项仍在退避等待期，可选中后立即重试' : '当前没有可执行的翻译项')
    else if (value.failed) ElMessage.warning(`处理 ${value.processed} 项：成功 ${value.completed}，失败 ${value.failed}，来源变化 ${value.stale}；请求 ${value.providerRequests ?? '—'} 次`)
    else ElMessage.success(`处理 ${value.processed} 项，成功 ${value.completed} 项；合并重复文本 ${value.duplicateTexts ?? 0} 项，实际请求 ${value.providerRequests ?? '—'} 次`)
    await load()
  } catch (value: unknown) {
    providerNotice.value = { type: 'error', title: actionErrorText(value, '翻译批次执行失败') }
    ElMessage.error(providerNotice.value.title)
  } finally { finishAction('batch') }
}
const autoProgress = ref<TranslationProgress | null>(null)
const autoMessage = ref('')
let autoController: AbortController | undefined
function stopAuto(): void {
  autoController?.abort()
  autoMessage.value = '已请求停止；当前批次结束后停止，已完成的译文会保留。'
}
async function runAll(): Promise<void> {
  if (!beginAction('auto')) return
  autoController = new AbortController(); autoMessage.value = ''; providerNotice.value = null
  try {
    const result = await runTranslationQueue({
      signal: autoController.signal,
      scan: cursor => request<TranslationScanPage>('/api/v1/admin/complete/translation/scan', { method: 'POST', body: { limit: 500, ...(cursor ? { cursor } : {}) } }),
      run: () => request<TranslationRunPage>('/api/v1/admin/complete/translation/run', { method: 'POST', body: {} }),
      refresh: () => load(false),
      progress: (value, result) => {
        autoProgress.value = value
        if (result?.failures?.length) providerNotice.value = { type: 'warning', title: result.failures.map(item => `${item.provider ?? '翻译配置'}：${item.message}（${item.count} 项）`).join('；') }
      },
    })
    autoMessage.value = { completed: '自动运行完成，当前可翻译队列已处理完毕。', failed: '自动运行结束，仍有达到重试上限的失败项或来源变化项，请核对后重新扫描/重试。', paused: '任务已被暂停，自动运行已停止。', stopped: '自动运行已停止，已完成的译文已保留。' }[result]
    await load(false)
  } catch (error) {
    autoMessage.value = actionErrorText(error, '自动运行中断，请核对配置和网络后重试；已有译文不会丢失。')
    providerNotice.value = { type: 'error', title: autoMessage.value }
  } finally { autoController = undefined; finishAction('auto') }
}
onBeforeUnmount(() => autoController?.abort())

async function testConfiguration() {
  if (!beginAction('test')) return
  providerNotice.value = null
  try {
    const value = await request<{ success: boolean; provider: string | null; translated: string | null; message: string; configuration: TranslationOverview }>('/api/v1/admin/complete/translation/test', { method: 'POST', body: {} })
    overview.value = { ...overview.value, ...value.configuration }
    providerNotice.value = { type: value.success ? 'success' : 'error', title: value.success ? `${value.provider}：${value.message} ${value.translated ?? ''}` : value.message }
  } catch (error) { providerNotice.value = { type: 'error', title: actionErrorText(error, '翻译配置检测失败') } }
  finally { finishAction('test') }
}
async function setPaused(action: 'pause' | 'resume') {
  if (!beginAction(action)) return
  try {
    await request('/api/v1/admin/complete/translation/task', { method: 'PATCH', body: { action } })
    ElMessage.success(action === 'pause' ? '翻译任务已暂停' : '翻译任务已恢复')
    await load()
  } catch (value: unknown) {
    ElMessage.error(actionErrorText(value, action === 'pause' ? '暂停失败' : '恢复失败'))
  } finally { finishAction(action) }
}
async function retry(uids: string[]) {
  if (!uids.length) return ElMessage.info('请选择当前有效的失败记录')
  if (!beginAction('retry')) return
  try {
    const value = await request<{ retried?: number; stale?: number }>('/api/v1/admin/complete/translation/retry', { method: 'POST', body: { uids } })
    ElMessage.success(`已重置 ${value.retried} 项，来源变化 ${value.stale} 项`)
    await load()
  } catch (value: unknown) {
    ElMessage.error(actionErrorText(value, '重试操作失败'))
  } finally { finishAction('retry') }
}
async function invalidateRows(uids: string[], confirmation: string): Promise<boolean> {
  if (!uids.length) { ElMessage.info('请选择当前有效的缓存记录'); return false }
  try {
    await ElMessageBox.confirm(confirmation, '失效翻译缓存', { type: 'warning', confirmButtonText: '确认失效', cancelButtonText: '取消' })
    if (!beginAction('invalidate')) return false
    const value = await request<{ invalidated?: number }>('/api/v1/admin/complete/translation/invalidate', { method: 'POST', body: { uids } })
    ElMessage.success(`已失效 ${value.invalidated} 项翻译缓存`)
    await load()
    return true
  } catch (value: unknown) {
    if (cancelled(value)) return false
    ElMessage.error(actionErrorText(value, '失效处理失败'))
    return false
  } finally { finishAction('invalidate') }
}
async function invalidateSelected() {
  await invalidateRows(selectedCurrent.value.map(row => row.uid), `将使所选 ${selectedCurrent.value.length} 项不再被英文前台使用，重新扫描后可再次生成。`)
}
async function invalidateRow(row: TranslationRow) {
  if (!canEdit.value || !row.is_current) return
  await invalidateRows([row.uid], '将使这条译文不再被英文前台使用，重新扫描后可再次生成。')
}

async function invalidateEditing(): Promise<void> { await editor.run(() => invalidateEditingImpl()) }
async function invalidateEditingImpl(): Promise<void> {
  if (!edit.value || !edit.value.is_current) return
  const invalidated = await invalidateRows([edit.value.uid], dirty.value
    ? '当前还有未保存的人工修订。失效后这些修改将被放弃，且这条译文不再供英文前台使用。确定继续吗？'
    : '将使这条译文不再被英文前台使用，重新扫描后可再次生成。')
  if (invalidated) { resetEditor(); editor.commit(); await closeEdit() }
}

function setEditorRecord(row: TranslationRow): void {
  editConflict.value = false
  edit.value = row
  editText.value = row.translated_text || ''
  editOriginal.value = editText.value
  editorError.value = ''
}
async function syncEditQuery(uid: string | null): Promise<void> {
  if ((uid ?? '') === editQueryUid.value) return
  const query = { ...route.query }
  if (uid) query.edit = uid
  else Reflect.deleteProperty(query, 'edit')
  await router.replace({ query })
}
function openEdit(row: TranslationRow): void {
  if (!canEdit.value || !row.is_current) return
  void syncEditQuery(row.uid)
}
async function restoreEditFromQuery(): Promise<void> {
  const uid = editQueryUid.value
  if (!uid || edit.value?.uid === uid) return
  resetEditor()
  const current = editor.startLoad()
  if (!canEdit.value) {
    await syncEditQuery(null)
    ElMessage.warning('当前账号没有人工修订权限。')
    return
  }
  try {
    const value = await request<{ record?: TranslationRow }>(`/api/v1/admin/complete/resource/translation/${encodeURIComponent(uid)}`)
    if (!current() || uid !== editQueryUid.value) return
    if (!value.record || !value.record.is_current) throw new Error('该翻译记录不存在或已经失效。')
    setEditorRecord(value.record)
  } catch (value: unknown) {
    if (!current() || uid !== editQueryUid.value) return
    await syncEditQuery(null)
    ElMessage.error(actionErrorText(value, '无法打开这条翻译记录。'))
  }
}
function resetEditor(): void {
  editor.invalidateLoad()
  editConflict.value = false
  edit.value = null
  editText.value = ''
  editOriginal.value = ''
  editorError.value = ''
}
async function closeEdit(): Promise<void> { await syncEditQuery(null) }
async function applyEditQuery(): Promise<void> {
  if (editQueryUid.value) await restoreEditFromQuery()
  else {
    if (hasEditQuery.value) await syncEditQuery(null)
    resetEditor()
  }
}
async function reloadTranslation(): Promise<void> {
  await editor.run(async () => {
    if (!edit.value || !await editor.confirmDiscard('加载最新版本将放弃当前人工修订，确定继续吗？')) return
    try {
      const value = await request<{ record: TranslationRow }>(`/api/v1/admin/complete/resource/translation/${encodeURIComponent(edit.value.uid)}`)
      if (!value.record.is_current) { resetEditor(); editor.commit(); await closeEdit(); ElMessage.warning('这条译文已经失效，请重新扫描来源内容。'); return }
      setEditorRecord(value.record)
    } catch (failure) { ElMessage.error(actionErrorText(failure, '最新译文读取失败，当前输入已保留')) }
  })
}
async function saveManual(andReturn = true): Promise<void> { await editor.run(() => saveManualImpl(andReturn)) }
async function saveManualImpl(andReturn = true) {
  if (!edit.value || !canEdit.value || !edit.value.is_current || saving.value || !dirty.value || editConflict.value) return
  if (!editText.value.trim()) return ElMessage.warning('译文不能为空')
  editorError.value = ''
  saving.value = true
  try {
    const value = await request<{ record: TranslationRow }>(`/api/v1/admin/complete/translation/${encodeURIComponent(edit.value.uid)}`, { method: 'PATCH', body: { translatedText: editText.value, expectedUpdatedAt: edit.value.updated_at } })
    edit.value = value.record
    editText.value = value.record.translated_text || ''
    editOriginal.value = editText.value
    editConflict.value = false
    editor.commit()
    ElMessage.success('人工译文已保存，并已刷新前台翻译缓存')
    const refreshed = await load(false)
    if (!refreshed) ElMessage.warning('译文已保存，但列表刷新失败；返回列表后可手动刷新。')
    if (andReturn) await closeEdit()
  } catch (value: unknown) {
    editorError.value = actionErrorText(value, '保存失败；来源内容可能已经变化，请重新扫描。')
    const details = adminErrorDetails(value)
    if (['TRANSLATION_EDIT_CONFLICT', 'TRANSLATION_SOURCE_CHANGED'].includes(details.code)) editConflict.value = true
    ElMessage.error(editorError.value)
  } finally { saving.value = false }
}

watch(() => route.query.edit, () => { void applyEditQuery() })
onMounted(async () => {
  await load()
  await applyEditQuery()
})
</script>

<template>
  <AdminEditorShell
    v-if="edit"
    eyebrow="翻译管理"
    title="人工修订译文"
    description="核对来源版本并维护当前有效的英文译文。"
    :sections="[{ id: 'translation-editor-source', label: '来源信息' }, { id: 'translation-editor-content', label: '英文译文' }]"
    :can-write="canEdit && edit.is_current === 1"
    :dirty="dirty"
    :saving="saving"
    :busy="editor.busy.value"
    :save-disabled="editConflict || !canEdit || edit.is_current !== 1 || !editText.trim() || !dirty"
    @back="closeEdit()"
    @save="saveManual(false)"
    @save-and-return="saveManual(true)"
  >
    <section id="translation-editor-source" class="admin-form-section"><header><div><small>只读信息</small><h2>来源信息</h2></div></header><ElDescriptions :column="1" border><ElDescriptionsItem label="数据库 UID">{{ edit.uid }}</ElDescriptionsItem><ElDescriptionsItem label="来源">{{ edit.source_ref_key }}</ElDescriptionsItem><ElDescriptionsItem label="来源版本">{{ formatTime(metadata(edit).sourceUpdatedAt) }}</ElDescriptionsItem><ElDescriptionsItem label="中文原文"><div class="pre">{{ edit.source_text }}</div></ElDescriptionsItem><ElDescriptionsItem v-if="edit.error_message" label="失败原因"><span class="error-text">{{ translationFailureMessage(edit.error_message) }}</span></ElDescriptionsItem></ElDescriptions></section>
    <section id="translation-editor-content" class="admin-form-section"><header><div><small>编辑分组</small><h2>英文译文</h2></div></header><ElAlert v-if="editorError" :title="editorError" type="error" :closable="false" show-icon class="editor-alert" /><ElButton v-if="editConflict" plain @click="reloadTranslation">加载最新版本</ElButton><ElForm label-position="top" @submit.prevent="saveManual(false)"><AdminFormItem label="英文译文" required for="manual-translation"><ElInput id="manual-translation" v-model="editText" :disabled="!canEdit || edit.is_current !== 1 || saving" type="textarea" :rows="16" maxlength="500000" show-word-limit placeholder="请输入核对后的英文译文" /><p class="admin-field-help edit-hint">填写将提供给英文前台的人工译文。保存前会再次核对来源指纹、来源记录版本和当前有效状态；内容变化时会拒绝覆盖。</p></AdminFormItem></ElForm></section>
    <template #record-meta><span>更新于 {{ formatTime(edit.updated_at) }}</span><ElTag v-if="dirty" type="warning" effect="light">有未保存修改</ElTag></template>
    <template #danger-actions><ElButton v-if="canEdit && edit.is_current" type="danger" plain :loading="actionIs('invalidate')" @click="invalidateEditing">使译文失效</ElButton></template>
  </AdminEditorShell>
  <section v-else class="translation-page">
    <header class="head">
      <div>
        <h1>翻译缓存与任务</h1>
        <p>扫描前台真实字段，按来源版本安全翻译；前台请求只读取当前成功缓存，不会现场调用第三方服务。</p>
      </div>
      <div v-if="canEdit" class="head-actions">
        <ElButton native-type="button" :loading="actionIs('test')" :disabled="running" @click="testConfiguration">检测翻译配置</ElButton>
        <NuxtLink to="/admin/settings/global" class="el-button el-button--default is-plain">配置翻译服务</NuxtLink>
        <ElSelect v-model="scanLimit" aria-label="扫描上限" class="scan-limit">
          <ElOption :value="200" label="扫描 200 项" />
          <ElOption :value="500" label="扫描 500 项" />
          <ElOption :value="1000" label="扫描 1000 项" />
          <ElOption :value="2000" label="扫描 2000 项" />
        </ElSelect>
        <ElButton native-type="button" :loading="actionIs('scan')" :disabled="running" aria-label="扫描与校准" @click.prevent="scan">扫描与校准</ElButton>
        <ElButton v-if="isPaused" native-type="button" type="success" :loading="actionIs('resume')" :disabled="running" @click="setPaused('resume')">恢复任务</ElButton>
        <ElButton v-else native-type="button" type="warning" plain :loading="actionIs('pause')" :disabled="running" @click="setPaused('pause')">暂停任务</ElButton>
        <ElButton native-type="button" type="primary" :disabled="isPaused || running" :loading="actionIs('batch')" @click="runBatch()">执行下一批</ElButton>
        <ElButton v-if="!actionIs('auto')" native-type="button" type="success" :disabled="isPaused || running" @click="runAll">自动运行至完成</ElButton>
        <ElButton v-else native-type="button" type="warning" plain @click="stopAuto">停止自动运行</ElButton>
      </div>
    </header>
    <p class="auto-hint">“执行下一批”每次只处理一批。“自动运行至完成”会先连续扫描全部来源，再逐批翻译并按间隔重试；请保持此管理页面打开，离开页面会停止后续批次。</p>
    <p class="auto-hint">相同原文合并请求，结果分别回填各条目；队列中 {{ overview?.deduplication?.records ?? 0 }} 项对应 {{ overview?.deduplication?.uniqueTexts ?? 0 }} 段不同文本。自动批次会一并处理相同文本的待办条目，实际完成条数可能超过批大小。勾选执行只处理所选条目。</p>
    <ElAlert v-if="autoProgress || autoMessage" type="info" :closable="false" class="editor-alert" :title="autoMessage || (autoProgress?.phase === 'scan' ? `正在扫描，已发现 ${autoProgress.scanned} 个字段` : autoProgress?.phase === 'waiting' ? `等待服务商重试间隔，预计 ${formatTime(autoProgress.nextRunAt)} 继续` : `已执行 ${autoProgress?.batches ?? 0} 批，本次成功 ${autoProgress?.completed ?? 0} 项`)" />

    <ElAlert v-if="scanNotice" :title="scanNotice.title" :description="lastScan ? `完成时间：${formatTime(lastScan.completedAt)}` : ''" :type="scanNotice.type" :closable="true" show-icon @close="scanNotice = null" />
    <ElAlert v-if="overview?.warnings?.length" :title="overview.warnings.join(' ')" type="warning" :closable="false" show-icon />
    <ElAlert v-if="providerNotice" :title="providerNotice.title" :type="providerNotice.type" show-icon @close="providerNotice = null" />
    <ElAlert v-if="overview?.provider === 'mymemory'" :title="overview.usesDefault ? '正在使用默认免密钥翻译服务 MyMemory。' : '正在使用 MyMemory 翻译。'" description="匿名服务有每日免费额度；达到限额会显示原因。可在全局设置填写真实联系邮箱或配置其他服务。检测按钮只翻译固定测试句，不修改内容记录。" type="info" :closable="false" />
    <ElAlert v-if="!canEdit" title="当前账号拥有查看权限；扫描、翻译、重试、失效和人工修订需要编辑权限。" type="info" :closable="false" show-icon />

    <div class="stats">
      <ElCard shadow="never"><small>翻译服务</small><strong>{{ overview?.provider || '未配置' }}</strong><span>{{ overview?.workerCount || 1 }} 并发 · {{ overview?.timeoutSeconds || 15 }} 秒超时</span></ElCard>
      <ElCard shadow="never"><small>待处理</small><strong>{{ totals.pending }}</strong><span>批大小 {{ overview?.batchSize || '—' }}</span></ElCard>
      <ElCard shadow="never"><small>成功 / 人工</small><strong>{{ totals.success }} / {{ totals.manual }}</strong><span>仅当前有效记录会进入前台</span></ElCard>
      <ElCard shadow="never"><small>失败 / 已失效</small><strong>{{ totals.failed }} / {{ totals.inactive }}</strong><span>最多自动尝试 {{ overview?.maxAttempts || 3 }} 次</span></ElCard>
    </div>

    <ElCard shadow="never" class="task-card">
      <div class="task-line">
        <div><span>任务状态</span><ElTag :type="statusType(state.status || 'idle')">{{ statusLabel(state.status || 'idle') }}</ElTag></div>
        <span>完成 {{ state.completed || 0 }} / {{ state.total || 0 }}，失败 {{ state.failed || 0 }}</span>
        <span>最近更新：{{ formatTime(state.updatedAt) }}</span>
      </div>
      <ElProgress :percentage="progress" :status="state.failed ? 'exception' : state.status === 'completed' ? 'success' : ''" />
      <p v-if="state.lastError" class="error-text">{{ state.lastError }}</p>
    </ElCard>

    <ElCard shadow="never">
      <AdminListToolbar v-model="q" :loading="loading" search-placeholder="搜索来源、原文、译文或 Provider" @search="search" @refresh="load">
        <template #actions>
          <ElButton v-if="canEdit" type="primary" plain :disabled="isPaused || running || !selectedTranslatable.length" :loading="actionIs('batch')" @click="runBatch(selectedTranslatable.map(row => row.uid))">翻译选中项（{{ selectedTranslatable.length }}）</ElButton>
          <ElButton v-if="canEdit" :disabled="!selectedFailed.length" :loading="running" @click="retry(selectedFailed.map(row => row.uid))">重试失败项（{{ selectedFailed.length }}）</ElButton>
          <ElButton v-if="canEdit" type="warning" plain :disabled="!selectedCurrent.length" :loading="running" @click="invalidateSelected">失效缓存（{{ selectedCurrent.length }}）</ElButton>
        </template>
      </AdminListToolbar>
      <ElAlert class="translation-selection-hint" type="info" title="可先按状态、维护方式筛选再勾选批量翻译；人工修订和已失效记录始终受到保护，不会被自动覆盖。" show-icon :closable="false" />
      <AdminDataTable :rows="rows" :columns="columns" :loading="loading" selectable expandable :selection-limit="25" :filter-values="filterValues" :action-labels="['人工修订', '失效', '重试']" preference-key="complete:translation" empty-description="没有符合条件的翻译缓存；可先执行扫描" @selection-change="setSelection" @sort-change="onSort" @filter-change="columnFilter">
        <template #expand="{ row }">
          <dl class="record-detail">
            <div><dt>来源引用</dt><dd>{{ row.source_ref_key }}</dd></div>
            <div><dt>来源版本</dt><dd>{{ formatTime(metadata(translationRow(row)).sourceUpdatedAt) }}</dd></div>
            <div><dt>尝试次数</dt><dd>{{ metadata(translationRow(row)).attemptCount || 0 }} / {{ overview?.maxAttempts || 3 }}</dd></div>
            <div><dt>下次重试</dt><dd>{{ formatTime(metadata(translationRow(row)).retryAfter) }}</dd></div>
            <div class="wide"><dt>中文原文</dt><dd class="pre">{{ row.source_text }}</dd></div>
            <div class="wide"><dt>英文译文</dt><dd class="pre">{{ row.translated_text || '—' }}</dd></div>
            <div v-if="row.error_message" class="wide error"><dt>失败原因</dt><dd>{{ translationFailureMessage(row.error_message) }}</dd></div>
          </dl>
        </template>
        <template #cell="{ row, column }">
          <span v-if="['source_ref_key', 'source_text', 'translated_text'].includes(column.key)" class="admin-two-line-cell" :class="{ 'admin-monospace-cell': column.key === 'source_ref_key' }">{{ row[column.key] || '—' }}</span>
          <ElTag v-else-if="column.key === 'provider'" :type="optionTone(row, column)" effect="plain">{{ optionLabel(row, column) }}</ElTag>
          <ElTag v-else-if="column.key === 'status'" :type="statusType(String(row.status))">{{ statusLabel(String(row.status)) }}</ElTag>
          <ElTag v-else-if="column.key === 'is_manual'" :type="row.is_manual ? 'primary' : 'info'" effect="plain">{{ row.is_manual ? '人工' : '自动' }}</ElTag>
          <ElTag v-else-if="column.key === 'is_current'" :type="row.is_current ? 'success' : 'danger'" effect="plain">{{ row.is_current ? '当前有效' : '已失效' }}</ElTag>
          <template v-else-if="column.key === 'updated_at'">{{ formatTime(row.updated_at) }}</template>
          <template v-else>{{ row[column.key] || '—' }}</template>
        </template>
        <template #actions="{ row }"><AdminRowActions><ElButton size="small" plain type="primary" :disabled="!canEdit || running || !row.is_current" @click="openEdit(translationRow(row))">人工修订</ElButton><ElButton v-if="canEdit && row.is_current" size="small" plain type="danger" :disabled="running" @click="invalidateRow(translationRow(row))">失效</ElButton><ElButton v-if="canEdit && row.status === 'failed' && row.is_current && !row.is_manual" size="small" plain type="warning" :disabled="running" @click="retry([String(row.uid)])">重试</ElButton></AdminRowActions></template>
      </AdminDataTable>
      <div class="pager"><ElPagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50,100]" layout="total,sizes,prev,pager,next" @change="() => load()" /></div>
    </ElCard>

    <aside class="translation-related-tools" aria-label="相关工具">
      <strong>相关辅助工具</strong>
      <div>
        <NuxtLink to="/admin/translation/suggestions"><ElButton>历史值建议</ElButton></NuxtLink>
        <NuxtLink to="/admin/publications/metadata"><ElButton>论文 DOI 元数据</ElButton></NuxtLink>
        <NuxtLink to="/admin/patents/metadata"><ElButton>专利元数据</ElButton></NuxtLink>
        <NuxtLink to="/admin/settings/global"><ElButton>翻译服务设置</ElButton></NuxtLink>
      </div>
    </aside>

  </section>
</template>

<style scoped>
.translation-page{display:grid;gap:1rem}.head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.head h1{margin:0}.head p{margin:.45rem 0 0;color:var(--el-text-color-secondary);max-width:52rem}.head-actions{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:flex-end}.scan-limit{width:9rem}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem}.stats :deep(.el-card__body){display:grid;gap:.35rem}.stats small,.stats span{color:var(--el-text-color-secondary)}.stats strong{font-size:1.35rem}.task-card :deep(.el-card__body){display:grid;gap:.75rem}.task-line{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}.task-line>div{display:flex;align-items:center;gap:.5rem}.translation-selection-hint{margin:.75rem 0}.pager{display:flex;justify-content:flex-end;padding-top:1rem}.record-detail{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;margin:0;padding:.5rem 1rem}.record-detail>div{display:grid;grid-template-columns:6rem 1fr;gap:.5rem}.record-detail .wide{grid-column:1/-1}.record-detail dt{font-weight:600;color:var(--el-text-color-secondary)}.record-detail dd{margin:0;min-width:0;overflow-wrap:anywhere}.pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:16rem;overflow:auto}.error,.error-text{color:var(--el-color-danger)}.translation-related-tools{display:grid;gap:.75rem;padding:1rem;border:1px solid var(--el-border-color);border-radius:var(--el-border-radius-base);background:var(--el-bg-color)}.translation-related-tools div{display:flex;gap:.5rem;flex-wrap:wrap}.edit-source{margin-bottom:1rem}.edit-hint{margin:.5rem 0 0;color:var(--el-text-color-secondary);font-size:.875rem}.editor-alert{margin-bottom:1rem}
@media(max-width:800px){.head{display:grid}.head-actions{justify-content:flex-start}.stats{grid-template-columns:repeat(2,1fr)}.pager{overflow:auto;justify-content:flex-start}.record-detail{grid-template-columns:1fr}.record-detail .wide{grid-column:auto}}
</style>
