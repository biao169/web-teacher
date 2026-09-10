<script setup lang="ts">
import { useLatestRequest } from '~/composables/useLatestRequest'
import type { AdminMediaList, AdminMediaPreviews, AdminMediaRow as MediaRow, AdminMediaStats } from '~/admin/media'
import { useAdminEditorLifecycle } from '~/composables/useAdminEditorLifecycle'
import AdminFormItem from '../shared/AdminFormItem.vue'
import { ExternalLink, Trash2 } from '@lucide/vue'
import { ElAlert, ElButton, ElCard, ElDescriptions, ElDescriptionsItem, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu, ElEmpty, ElForm, ElInput, ElMessage, ElMessageBox, ElPagination, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { adminErrorDetails, adminErrorMessage as errorText } from '~/admin/errors'
import { formatAdminDateTime as formatTime } from '~/admin/formatters'
import { adminUploadedMediaRow, type AdminUploadedMedia } from '~/admin/media-upload'
import { adminColumnOptionLabel, adminColumnOptionTone, type AdminListPrimitive, type AdminUnifiedColumn, type AdminUnifiedSortChange, type AdminUnifiedTableRow } from '~/admin/unified-list'
import AdminCompleteImageCropper from './AdminCompleteImageCropper.client.vue'
import AdminCompleteSuggestionField from './AdminCompleteSuggestionField.vue'
import AdminDataTable from '../shared/AdminDataTable.vue'
import AdminListShell from '../shared/AdminListShell.vue'
import AdminListToolbar from '../shared/AdminListToolbar.vue'
import AdminRowActions from '../shared/AdminRowActions.vue'
import AdminEditorShell from '../shared/AdminEditorShell.vue'
import { hasAdminPermission } from '~~/shared/admin/registry'
import { ADMIN_UID_PATTERN, suggestedAdminUid } from '~~/shared/admin/identity'
import AdminCheckedFormItem from '../shared/AdminCheckedFormItem.vue'
import AdminIdentitySection from '../shared/AdminIdentitySection.vue'
import AdminMediaPreview from '../shared/AdminMediaPreview.vue'
import type { MediaScanState } from '~~/server/services/complete-admin/media-full-scan'

const props = withDefaults(defineProps<{ mode?: 'library' | 'trash' }>(), { mode: 'library' })
const isTrash = computed(() => props.mode === 'trash')

interface MediaCheck {
  uid: string
  exists: boolean | null
  consistent: boolean | null
  sizeMatches: boolean | null
  checksumMatches: boolean | null
  checksumVerified: boolean
  mimeMatches: boolean | null
  note?: string | null
  checkedAt: string
}

interface MediaUsageRow {
  table: string
  moduleLabel: string
  field: string
  uid: string
  recordTitle: string | null
  adminPath: string | null
}

interface MediaUsage {
  uid: string
  objectKey: string
  usages: MediaUsageRow[]
  total: number
}

const { request } = useCompleteAdminApi()
const { uploadAdminMedia } = useAdminMediaUpload()
const auth = useAuthSession()
const route = useRoute()
const router = useRouter()
const currentUser = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)
const canCreate = computed(() => hasAdminPermission(currentUser.value, 'media_assets', 'create'))
const canEdit = computed(() => hasAdminPermission(currentUser.value, 'media_assets', 'edit'))
const canDelete = computed(() => hasAdminPermission(currentUser.value, 'media_assets', 'delete'))
const rows = ref<MediaRow[]>([])
const selectedRows = ref<MediaRow[]>([])
const loading = ref(false)
const uploading = ref(false)
const checking = ref(false)
const fullScan = ref<MediaScanState | null>(null)
const scanStarting = ref(false)
const scanSupported = ref(false)
const scanStatusError = ref('')
let scanTimer: ReturnType<typeof setTimeout> | undefined
let scanDisposed = false
const scanRunning = computed(() => fullScan.value?.status === 'running')
const scanSummary = computed(() => {
  const state = fullScan.value
  if (!state) return ''
  const label = state.status === 'running' ? (state.phase === 'records' ? '正在检查登记记录' : '正在扫描媒体目录') : state.status === 'completed' ? '扫描完成' : '扫描未完成'
  return `${label} · 已检查 ${state.checked}/${state.total} · 缺失 ${state.missing} · 异常 ${state.abnormal} · 外部资源 ${state.external} · 遍历 ${state.visited} · 新增 ${state.added} · 跳过 ${state.skipped} · 错误 ${state.errors}`
})
const cleaning = ref(false)
const statusSavingUid = ref('')
const purgingUid = ref('')
const error = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const q = ref('')
const filterValues = reactive<Record<string, AdminListPrimitive | undefined>>({})
const sort = ref('updated_at')
const direction = ref<'asc' | 'desc'>('desc')
const stats = reactive<AdminMediaStats>({ totals: { total: 0, active: 0, trash: 0, bytes: 0 }, categories: [], policy: { effectiveMaxMb: 20, allowedExtensions: [], trashRetentionDays: 30 } })
const previewUrls = reactive<Record<string, string>>({})
const previewFailures = reactive<Record<string, string>>({})
const immediatePreviewFiles = reactive<Record<string, File>>({})
const checks = reactive<Record<string, MediaCheck>>({})
const usageCounts = reactive<Record<string, number>>({})
const usageSummaryLoaded = ref(false)
const listReads = useLatestRequest()
const statsReads = useLatestRequest()
const usageReads = useLatestRequest()
const uploadReads = useLatestRequest()
let isCurrentList: () => boolean = () => false

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const cropOpen = ref(false)
const title = ref('')
const category = ref('admin')
const uploadUid = ref(suggestedAdminUid('media'))
const uploadedUid = ref('')
const uploadNotice = ref('')

const usageOpen = ref(false)
const usageLoading = ref(false)
const usage = ref<MediaUsage | null>(null)
const previewOpen = ref(false)
const previewRow = ref<MediaRow | null>(null)
const editOpen = ref(false)
const editSaving = ref(false)
const editRow = ref<MediaRow | null>(null)
const editForm = reactive({ title: '', category: '' })
const editBaseline = ref('')
const editConflict = ref(false)
const editDirty = computed(() => editOpen.value && editBaseline.value !== JSON.stringify(editForm))
const editor = useAdminEditorLifecycle({ dirty: () => editDirty.value, busy: () => uploading.value })
const editQueryUid = computed(() => typeof route.query.edit === 'string' ? route.query.edit.trim() : '')
const pageTitle = computed(() => isTrash.value ? '媒体回收站' : '媒体库')
const pageDescription = computed(() => isTrash.value
  ? '集中查看已回收媒体；可在完整性校验后恢复，或在保留期结束后永久清理。'
  : '统一管理正常使用的图片、PDF 和课程材料；业务内容只保存跨平台 Object key。')
const actionLabels = computed(() => {
  if (isTrash.value) return [
    '使用位置',
    ...(canEdit.value ? ['恢复媒体'] : []),
    ...(canDelete.value ? ['永久清理'] : []),
  ]
  return [
    '预览',
    ...(canEdit.value ? ['编辑信息'] : []),
    '使用位置',
    '校验',
    ...(canEdit.value ? ['移入回收站'] : []),
    '更多',
  ]
})

const mimeOptions = [
  { value: 'image/*', label: '全部图片' },
  { value: 'image/jpeg', label: 'JPEG 图片' },
  { value: 'image/png', label: 'PNG 图片' },
  { value: 'image/webp', label: 'WebP 图片' },
  { value: 'image/gif', label: 'GIF 图片' },
  { value: 'application/pdf', label: 'PDF 文档' },
  { value: 'application/zip', label: 'ZIP 压缩包' },
]
const columns = computed<AdminUnifiedColumn[]>(() => [
  { key: '_preview', label: '预览', width: 78, sortable: false, filterable: false, resizable: false },
  { key: 'title', label: '标题', kind: 'long-text', minWidth: 180, sortable: true, filterable: true, resizable: true, twoLine: true },
  { key: 'object_key', label: 'Object key', kind: 'long-text', minWidth: 240, sortable: true, filterable: true, resizable: true, twoLine: true },
  { key: 'category', label: '分类', width: 110, sortable: true, filterable: true, resizable: true, options: (stats.categories ?? []).map(item => ({ value: item.value ?? '__empty__', label: `${item.label}（${item.total}）` })) },
  { key: 'mime_type', label: 'MIME', minWidth: 135, sortable: true, filterable: true, resizable: true, options: mimeOptions },
  { key: 'size', label: '大小', kind: 'integer', width: 88, sortable: true, filterable: true, resizable: true },
  { key: 'storage_kind', label: '存储', kind: 'enum', width: 90, sortable: true, filterable: true, resizable: true, options: [{ value: 'local', label: 'Local', tone: 'info' }, { value: 'r2', label: 'R2', tone: 'primary' }, { value: 'static', label: '静态资源', tone: 'success' }, { value: 'external', label: '外部资源', tone: 'warning' }] },
  { key: 'status', label: '状态', kind: 'status', width: 110, sortable: true, filterable: false, resizable: true, options: [{ value: 'active', label: '正常', tone: 'success' }, { value: 'trash', label: '回收站', tone: 'warning' }] },
  { key: 'updated_at', label: '更新时间', kind: 'datetime', width: 160, sortable: true, filterable: true, resizable: true },
  { key: '_check', label: '检查', width: 92, sortable: false, filterable: false, resizable: false },
])

function lifecycleErrorText(value: unknown, status: 'active' | 'trash'): string {
  const details = adminErrorDetails(value, status === 'trash' ? '回收失败' : '恢复失败')
  if (details.code === 'MEDIA_STILL_REFERENCED') return '该媒体仍被业务内容引用，请先在“使用位置”中处理引用。'
  if (details.code === 'MEDIA_OBJECT_MISSING' || details.code === 'MEDIA_OBJECT_INCONSISTENT') return '媒体对象缺失或数据不一致，未执行恢复。'
  if (details.code === 'SQL_EXPECTED_CHANGES') return '该记录已被其他操作更新，列表已刷新，请重试。'
  return details.message
}

function usagePath(value: unknown): string | null {
  const row = value && typeof value === 'object' ? value as { adminPath?: unknown } : {}
  const path = typeof row.adminPath === 'string' ? row.adminPath.trim() : ''
  return path.startsWith('/admin/') && !path.startsWith('//') ? path : null
}

function formatBytes(value: number): string {
  const size = Number(value || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KiB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MiB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GiB`
}
function optionLabel(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): string { return adminColumnOptionLabel(column, row[column.key]) ?? String(row[column.key] ?? '—') }
function optionTone(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): 'success' | 'warning' | 'danger' | 'info' | 'primary' { return adminColumnOptionTone(column, row[column.key]) ?? 'info' }
function usageCount(row: MediaRow): number { return Number(usageCounts[row.uid] ?? 0) }
function canTrash(row: MediaRow): boolean { return usageSummaryLoaded.value && Object.hasOwn(usageCounts, row.uid) && usageCount(row) === 0 }
function trashTitle(row: MediaRow): string { return (!usageSummaryLoaded.value || !Object.hasOwn(usageCounts, row.uid)) ? '引用状态尚未完成检查' : usageCount(row) > 0 ? `当前有 ${usageCount(row)} 处引用，请先处理使用位置` : '移入回收站' }

function clearRecord(record: Record<string, unknown>) {
  for (const key of Object.keys(record)) Reflect.deleteProperty(record, key)
}

function adminPreviewUrl(row: MediaRow): string {
  if (row.storage_kind === 'external' || (!/^(?:image|video)\//u.test(String(row.mime_type)) && row.mime_type !== 'application/pdf')) return ''
  return `/api/v1/admin/complete/media/${encodeURIComponent(row.uid)}/preview`
}

function isPreviewable(row: MediaRow): boolean {
  return /^(?:image|video)\//u.test(String(row.mime_type)) || row.mime_type === 'application/pdf'
}

function previewFallback(row: MediaRow): string {
  if (previewFailures[row.uid]) return previewFailures[row.uid]!
  if (String(row.mime_type).includes('pdf')) return 'PDF'
  if (String(row.mime_type).startsWith('video/')) return '视频'
  if (String(row.mime_type).startsWith('image/')) return '图片'
  return '文件'
}

async function loadStats() {
  const isCurrent = statsReads.start()
  const value = await request<AdminMediaStats>('/api/v1/admin/complete/media/stats')
  if (isCurrent()) Object.assign(stats, value)
}

async function loadPreviews(isCurrent: () => boolean) {
  clearRecord(previewUrls)
  clearRecord(previewFailures)
  const candidates = rows.value.filter(row => row.status === 'active')
  if (candidates.length) {
    try {
      const value = await request<AdminMediaPreviews>('/api/v1/admin/complete/media/previews', { query: { uids: candidates.map(row => row.uid).join(',') } })
      if (!isCurrent()) return
      const returned = new Set<string>()
      for (const item of value.items ?? []) {
        returned.add(String(item.uid))
        if (item.view?.available && item.view.url) {
          previewUrls[item.uid] = item.view.url
          Reflect.deleteProperty(immediatePreviewFiles, String(item.uid))
        }
        else previewFailures[item.uid] = '媒体不可用'
      }
      for (const row of candidates) if (isPreviewable(row) && !returned.has(row.uid)) previewFailures[row.uid] = '预览不可用'
    } catch {
      if (!isCurrent()) return
      for (const row of candidates) if (isPreviewable(row)) previewFailures[row.uid] = '预览地址获取失败'
    }
  }
  if (!isCurrent()) return
  for (const row of rows.value.filter(item => item.status === 'trash')) {
    const url = adminPreviewUrl(row)
    if (url) previewUrls[row.uid] = url
  }
}

async function refreshPreview(row: MediaRow): Promise<void> {
  const isCurrent = isCurrentList
  Reflect.deleteProperty(previewUrls, row.uid)
  Reflect.deleteProperty(previewFailures, row.uid)
  if (!isPreviewable(row)) return
  if (row.status === 'trash') {
    const url = adminPreviewUrl(row)
    if (url) previewUrls[row.uid] = url
    else previewFailures[row.uid] = '该媒体无法在线预览'
    return
  }
  try {
    const value = await request<AdminMediaPreviews>('/api/v1/admin/complete/media/previews', { query: { uids: row.uid } })
    if (!isCurrent()) return
    const view = value.items?.[0]?.view
    if (view?.available && view.url) {
      previewUrls[row.uid] = view.url
      Reflect.deleteProperty(immediatePreviewFiles, row.uid)
    }
    else previewFailures[row.uid] = '媒体不存在或无权预览'
  } catch (value) {
    if (!isCurrent()) return
    previewFailures[row.uid] = errorText(value, '预览地址获取失败')
  }
}

async function loadUsageSummary(isCurrent: () => boolean) {
  clearRecord(usageCounts)
  usageSummaryLoaded.value = false
  if (!rows.value.length) { usageSummaryLoaded.value = true; return }
  try {
    const value = await request<{ items: Array<{ uid: string; total: number }> }>('/api/v1/admin/complete/media/usage-summary', { query: { uids: rows.value.map(row => row.uid).join(',') } })
    if (!isCurrent()) return
    for (const item of value.items ?? []) usageCounts[String(item.uid)] = Number(item.total ?? 0)
    usageSummaryLoaded.value = true
  } catch {
    // Lifecycle controls remain disabled when references cannot be verified.
  }
}

async function load() {
  if (uploading.value) return
  const isCurrent = listReads.start()
  isCurrentList = isCurrent
  usageSummaryLoaded.value = false
  loading.value = true
  error.value = ''
  clearRecord(checks)
  try {
    const value = await request<AdminMediaList>(isTrash.value ? '/api/v1/admin/complete/media/trash' : '/api/v1/admin/complete/media', {
      query: {
        page: page.value,
        pageSize: pageSize.value,
        q: q.value,
        ...Object.fromEntries(Object.entries(filterValues).filter(([, item]) => item !== undefined && item !== '').map(([key, item]) => [`f_${key}`, item])),
        sort: sort.value,
        direction: direction.value,
      },
    })
    if (!isCurrent()) return
    rows.value = value.rows ?? []
    total.value = Number(value.total ?? 0)
    selectedRows.value = []
    await Promise.all([loadPreviews(isCurrent), loadUsageSummary(isCurrent), loadStats(), refreshFullScan(isCurrent)])
  } catch (value) {
    if (isCurrent()) error.value = errorText(value, '媒体列表读取失败')
  } finally {
    if (isCurrent()) loading.value = false
  }
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
function setSelection(value: AdminUnifiedTableRow[]): void { selectedRows.value = value as MediaRow[] }
function mediaRow(value: AdminUnifiedTableRow): MediaRow { return value as MediaRow }

function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  selectedFile.value = file
  if (file && !title.value) title.value = file.name
}

function useCropped(file: File) {
  selectedFile.value = file
  title.value = file.name
  if (fileInput.value) fileInput.value.value = ''
}

async function uploadFile(file: File) {
  if (uploading.value) return
  if (!ADMIN_UID_PATTERN.test(uploadUid.value)) return ElMessage.error('数据库 UID 格式无效')
  const maximum = Number(stats.policy?.effectiveMaxMb ?? 20) * 1024 * 1024
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (file.size > maximum) return ElMessage.error(`文件超过 ${stats.policy?.effectiveMaxMb ?? 20} MB 上传限制`)
  if (Array.isArray(stats.policy?.allowedExtensions) && !stats.policy.allowedExtensions.includes(extension)) return ElMessage.error('该扩展名未在全局设置中启用')
  uploading.value = true
  const isCurrent = uploadReads.start()
  isCurrentList = listReads.start()
  loading.value = false
  uploadNotice.value = ''
  try {
    const media = await uploadAdminMedia(file, { uid: uploadUid.value, title: title.value || file.name, category: category.value || 'admin' })
    if (!isCurrent()) return
    const row = adminUploadedMediaRow(media)
    immediatePreviewFiles[row.uid] = file
    rows.value = [row, ...rows.value.filter(item => item.uid !== row.uid)].slice(0, pageSize.value)
    total.value += 1
    usageCounts[row.uid] = 0
    uploadedUid.value = row.uid
    uploadNotice.value = '新媒体已加入当前列表；本地预览已显示，正在同步服务端预览。'
    ElMessage.success('媒体上传并登记成功')
    title.value = ''
    uploadUid.value = suggestedAdminUid('media')
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    page.value = 1
    await nextTick()
    void finalizeUploadedMedia(media, row, isCurrent)
  } catch (value) {
    if (isCurrent()) ElMessage.error(errorText(value, '上传失败'))
  } finally {
    uploading.value = false
  }
}

async function finalizeUploadedMedia(media: AdminUploadedMedia, row: MediaRow, isCurrent: () => boolean): Promise<void> {
  await Promise.allSettled([refreshPreview(row), loadStats()])
  if (!isCurrent() || uploadedUid.value !== media.uid) return
  if (previewUrls[media.uid]) uploadNotice.value = '新媒体已加入列表，服务端预览同步完成。'
  else uploadNotice.value = '媒体已上传；服务端预览暂不可用，当前保留本地预览，可稍后点击刷新重试。'
}

async function upload() { if (selectedFile.value) await uploadFile(selectedFile.value) }

async function showUsage(row: MediaRow) {
  const isCurrent = usageReads.start()
  usageLoading.value = true
  usageOpen.value = true
  usage.value = null
  try {
    const result = await request<MediaUsage>(`/api/v1/admin/complete/media/${encodeURIComponent(row.uid)}/usage`)
    if (isCurrent()) usage.value = result
  } catch (value) {
    if (!isCurrent()) return
    ElMessage.error(errorText(value, '使用位置查询失败'))
    usageOpen.value = false
  } finally {
    if (isCurrent()) usageLoading.value = false
  }
}

async function setStatus(row: MediaRow, status: 'active' | 'trash'): Promise<boolean> {
  try {
    if (status === 'trash' && !canTrash(row)) {
      ElMessage.warning(trashTitle(row))
      return false
    }
    if (status === 'trash') await ElMessageBox.confirm('被网站内容引用的媒体不能回收。确定检查引用并移入回收站吗？', '回收媒体', { type: 'warning' })
    statusSavingUid.value = row.uid
    await request(`/api/v1/admin/complete/media/${encodeURIComponent(row.uid)}/status`, { method: 'PATCH', body: { status, expectedUpdatedAt: row.updated_at } })
    ElMessage.success(status === 'trash' ? '已移入回收站' : '媒体完整性校验通过，已恢复')
    await load()
    return true
  } catch (value) {
    if (value === 'cancel' || value === 'close' || (value instanceof Error && value.message === 'cancel')) return false
    ElMessage.error(lifecycleErrorText(value, status))
    if (adminErrorDetails(value).code === 'SQL_EXPECTED_CHANGES') await load()
    return false
  } finally { statusSavingUid.value = '' }
}

async function batchStatus(status: 'active' | 'trash') {
  const candidates = selectedRows.value.filter(row => row.status !== status)
  if (!candidates.length) return ElMessage.info('所选媒体已经是目标状态')
  if (candidates.length > 25) return ElMessage.warning('单次最多处理 25 个媒体文件')
  if (status === 'trash' && (!usageSummaryLoaded.value || candidates.some(row => !canTrash(row)))) return ElMessage.warning('所选媒体包含正在使用或引用状态未知的文件，不能批量回收。')
  try {
    await ElMessageBox.confirm(`确定${status === 'trash' ? '回收' : '恢复'}所选的 ${candidates.length} 个媒体吗？`, '批量操作', { type: 'warning' })
    const result = await request<{ updated: number }>('/api/v1/admin/complete/media/batch-status', {
      method: 'PATCH',
      body: { status, records: candidates.map(row => ({ uid: row.uid, expectedUpdatedAt: row.updated_at })) },
    })
    ElMessage.success(`已处理 ${result.updated ?? 0} 个媒体`)
    await load()
  } catch (value) {
    if (value === 'cancel' || value === 'close' || (value instanceof Error && value.message === 'cancel')) return
    ElMessage.error(lifecycleErrorText(value, status))
    if (adminErrorDetails(value).code === 'SQL_EXPECTED_CHANGES') await load()
  }
}

async function refreshFullScan(isCurrent: () => boolean = () => !scanDisposed) {
  clearTimeout(scanTimer)
  try {
    const previous = fullScan.value?.status
    const value = await request<{ supported: boolean; state: MediaScanState | null; checks: MediaCheck[] }>('/api/v1/admin/complete/media/scan-all', { query: { uids: rows.value.map(row => row.uid).join(',') } })
    if (!isCurrent() || scanDisposed) return
    scanStatusError.value = ''
    scanSupported.value = value.supported
    fullScan.value = value.state
    for (const check of value.checks) checks[check.uid] = check
    if (previous === 'running' && value.state?.status !== 'running') { await load(); return }
  } catch (value) { if (!scanDisposed) scanStatusError.value = errorText(value, '扫描状态读取失败，请刷新重试') }
  if (scanRunning.value && !scanDisposed) scanTimer = setTimeout(() => { void refreshFullScan() }, 3000)
}

async function scanAll() {
  if (scanStarting.value || scanRunning.value) return
  scanStarting.value = true
  try {
    const result = await request<{ state: MediaScanState }>('/api/v1/admin/complete/media/scan-all', { method: 'POST', body: {} })
    fullScan.value = result.state
    await refreshFullScan()
  } catch (value) { ElMessage.error(errorText(value, '扫描启动失败')) }
  finally { scanStarting.value = false }
}

onBeforeUnmount(() => { scanDisposed = true; clearTimeout(scanTimer) })

async function scanPage(deep = false) {
  if (!rows.value.length) return
  checking.value = true
  try {
    const value = await request<{ checks: MediaCheck[] }>('/api/v1/admin/complete/media/scan', { query: { uids: rows.value.map(row => row.uid).join(','), deep: deep ? '1' : '0' } })
    for (const item of value.checks ?? []) checks[item.uid] = item
    const missing = (value.checks ?? []).filter((item: MediaCheck) => item.exists === false).length
    const inconsistent = (value.checks ?? []).filter((item: MediaCheck) => item.exists === true && item.consistent === false).length
    if (missing || inconsistent) ElMessage.warning(`检查完成：缺失 ${missing} 个，不一致 ${inconsistent} 个`)
    else ElMessage.success(deep ? '当前页深度校验通过' : '当前页对象检查通过')
  } catch (value) {
    ElMessage.error(errorText(value, '媒体检查失败'))
  } finally {
    checking.value = false
  }
}

async function deepCheck(row: MediaRow) {
  try {
    const value = await request<MediaCheck>(`/api/v1/admin/complete/media/${encodeURIComponent(row.uid)}/check`, { query: { deep: '1' } })
    checks[row.uid] = value
    if (value.exists === null) ElMessage.info(value.note || '外部媒体未主动探测')
    else ElMessage[value.consistent ? 'success' : 'warning'](value.consistent ? '对象、大小和摘要校验通过' : '媒体对象缺失或元数据不一致')
  } catch (value) {
    ElMessage.error(errorText(value, '深度校验失败'))
  }
}

function checkLabel(row: MediaRow): { label: string; type: 'success' | 'warning' | 'danger' | 'info' } {
  const value = checks[row.uid]
  if (!value) return { label: '未检查', type: 'info' }
  if (value.exists === null && value.consistent === false) return { label: '读取异常', type: 'warning' }
  if (value.exists === null) return { label: '外部资源', type: 'info' }
  if (value.exists === false) return { label: '对象缺失', type: 'danger' }
  if (value.consistent === false) return { label: '数据不一致', type: 'warning' }
  return { label: value.checksumVerified ? '深度通过' : '对象正常', type: 'success' }
}

async function showPreview(row: MediaRow) {
  previewRow.value = row
  previewOpen.value = true
  if (previewUrls[row.uid]) return
  await refreshPreview(row)
}

function download(row: MediaRow) {
  const value = previewUrls[row.uid]
  if (!value || !import.meta.client) return
  const url = new URL(value, window.location.origin)
  url.searchParams.set('download', '1')
  window.open(`${url.pathname}${url.search}`, '_blank', 'noopener')
}

async function copyKey(row: MediaRow) {
  try { await navigator.clipboard.writeText(row.object_key); ElMessage.success('Object key 已复制') }
  catch { ElMessage.warning('浏览器未允许复制，请手动选择 Object key') }
}

function setEditRecord(row: MediaRow): void {
  editConflict.value = false
  editRow.value = row
  editForm.title = row.title ?? ''
  editForm.category = row.category ?? ''
  editBaseline.value = JSON.stringify(editForm)
  editOpen.value = true
}
async function syncEditQuery(uid: string | null): Promise<void> {
  if ((uid ?? '') === editQueryUid.value) return
  const query = { ...route.query }
  if (uid) query.edit = uid
  else Reflect.deleteProperty(query, 'edit')
  await router.replace({ query })
}
function mediaEditHref(row: MediaRow): string {
  return router.resolve({ path: route.path, query: { ...route.query, edit: row.uid } }).href
}
function resetEdit(): void {
  editor.invalidateLoad()
  editConflict.value = false
  editOpen.value = false
  editRow.value = null
  editBaseline.value = ''
}
async function restoreEditFromQuery(): Promise<void> {
  const uid = editQueryUid.value
  if (!uid || editRow.value?.uid === uid) return
  resetEdit()
  const current = editor.startLoad()
  if (isTrash.value || !canEdit.value) {
    await syncEditQuery(null)
    if (!isTrash.value) ElMessage.warning('当前账号没有编辑媒体信息的权限。')
    return
  }
  try {
    const listed = rows.value.find(row => row.uid === uid)
    const row = listed ?? (await request<{ record?: MediaRow }>(`/api/v1/admin/complete/resource/media/${encodeURIComponent(uid)}`)).record
    if (!current() || uid !== editQueryUid.value) return
    if (!row || row.status !== 'active') throw new Error('该媒体不存在或已经移入回收站。')
    setEditRecord(row)
  } catch (value: unknown) {
    if (!current() || uid !== editQueryUid.value) return
    await syncEditQuery(null)
    ElMessage.error(errorText(value, '无法打开这条媒体记录'))
  }
}
async function applyEditQuery(): Promise<void> {
  if (editQueryUid.value) await restoreEditFromQuery()
  else resetEdit()
}
async function reloadMetadata(): Promise<void> {
  await editor.run(async () => {
    const row = editRow.value
    if (!row || !await editor.confirmDiscard('加载最新版本将放弃当前媒体信息修改，确定继续吗？')) return
    try {
      const value = await request<{ record: MediaRow }>(`/api/v1/admin/complete/resource/media/${encodeURIComponent(row.uid)}`)
      if (value.record.status !== 'active') { resetEdit(); editor.commit(); await syncEditQuery(null); return }
      setEditRecord(value.record)
    } catch (failure) { ElMessage.error(errorText(failure, '最新媒体信息读取失败，当前输入已保留')) }
  })
}

async function saveMetadata(andReturn = true): Promise<void> { await editor.run(() => saveMetadataImpl(andReturn)) }
async function saveMetadataImpl(andReturn = true) {
  const row = editRow.value
  if (!row || !canEdit.value || row.status !== 'active' || editSaving.value || !editDirty.value || editConflict.value) return
  editSaving.value = true
  try {
    const result = await request<{ title: string | null; category: string | null; updatedAt: string }>(`/api/v1/admin/complete/media/${encodeURIComponent(row.uid)}/metadata`, { method: 'PATCH', body: { ...editForm, expectedUpdatedAt: row.updated_at } })
    editForm.title = result.title ?? ''
    editForm.category = result.category ?? ''
    editRow.value = { ...row, title: result.title ?? null, category: result.category ?? null, updated_at: result.updatedAt }
    editBaseline.value = JSON.stringify(editForm)
    editConflict.value = false
    editor.commit()
    ElMessage.success('媒体信息已保存')
    if (andReturn) {
      resetEdit()
      await syncEditQuery(null)
    }
    await load()
  } catch (value) {
    const details = adminErrorDetails(value, '保存失败')
    if (['SQL_EXPECTED_CHANGES', 'ADMIN_CONFLICT'].includes(details.code)) {
      editConflict.value = true
      ElMessage.error('该媒体信息已被其他操作更新。当前输入已保留；请加载最新版本后重新编辑。')
    } else ElMessage.error(details.message)
  } finally {
    editSaving.value = false
  }
}
async function closeEdit(): Promise<void> { await syncEditQuery(null) }

async function trashEditedMedia(): Promise<void> { await editor.run(() => trashEditedMediaImpl()) }
async function trashEditedMediaImpl(): Promise<void> {
  const row = editRow.value
  if (!row) return
  const moved = await setStatus(row, 'trash')
  if (!moved) return
  resetEdit()
  editor.commit()
  await syncEditQuery(null)
}

async function purge(row: MediaRow) {
  try {
    await ElMessageBox.confirm(`仅允许清理超过 ${stats.policy?.trashRetentionDays ?? 30} 天且无引用的媒体；操作不可撤销。`, '永久清理', { type: 'error', confirmButtonText: '永久清理' })
    purgingUid.value = row.uid
    await request(`/api/v1/admin/complete/media/${encodeURIComponent(row.uid)}/purge?updatedAt=${encodeURIComponent(row.updated_at)}`, { method: 'DELETE' })
    ElMessage.success('媒体记录与物理对象已清理')
    await load()
  } catch (value) {
    if (value === 'cancel' || value === 'close' || (value instanceof Error && value.message === 'cancel')) return
    const details = adminErrorDetails(value, '永久清理失败')
    if (details.code === 'MEDIA_RETENTION_NOT_EXPIRED') ElMessage.warning(`该媒体尚未达到 ${stats.policy?.trashRetentionDays ?? 30} 天保留期，暂不能永久清理。`)
    else if (details.code === 'MEDIA_STILL_REFERENCED') ElMessage.error('该媒体仍有业务引用，请先处理“使用位置”。')
    else ElMessage.error(details.message)
  } finally { purgingUid.value = '' }
}

async function cleanupExpired() {
  cleaning.value = true
  try {
    await ElMessageBox.confirm(`将清理超过 ${stats.policy?.trashRetentionDays ?? 30} 天、无业务引用的回收站媒体，最多 25 个。`, '清理到期媒体', { type: 'error' })
    const value = await request<{ purged: unknown[]; skipped: unknown[] }>('/api/v1/admin/complete/media/cleanup', { method: 'POST', body: { limit: 25 } })
    ElMessage.success(`已清理 ${value.purged?.length ?? 0} 个，跳过 ${value.skipped?.length ?? 0} 个`)
    await load()
  } catch (value) {
    if (value === 'cancel' || value === 'close' || (value instanceof Error && value.message === 'cancel')) return
    ElMessage.error(errorText(value, '到期清理失败'))
  } finally {
    cleaning.value = false
  }
}

watch(usageOpen, value => { if (!value) { usageReads.invalidate(); usageLoading.value = false } })
watch(() => route.query.edit, () => { void applyEditQuery() })
watch(() => props.mode, async () => { resetEdit(); await syncEditQuery(null); await load() })
onMounted(async () => { await load(); await applyEditQuery() })
</script>

<template>
  <AdminEditorShell
    v-if="editOpen && editRow"
    eyebrow="媒体库"
    title="编辑媒体信息"
    description="修改媒体标题和分类；对象标识、类型、大小与存储位置由系统维护。"
    :sections="[{ id: 'media-editor-uid', label: '数据库 UID' }, { id: 'media-editor-info', label: '媒体信息' }, { id: 'media-editor-storage', label: '对象详情' }]"
    :can-write="canEdit"
    :dirty="editDirty"
    :saving="editSaving"
    :busy="editor.busy.value"
    :save-disabled="!editDirty || editConflict"
    @back="closeEdit"
    @save="saveMetadata(false)"
    @save-and-return="saveMetadata(true)"
  >
    <ElForm label-position="top" @submit.prevent="saveMetadata(false)">
      <AdminIdentitySection :model-value="editRow.uid" resource="media" existing section-id="media-editor-uid" />
      <section id="media-editor-info" class="admin-form-section"><header><div><small>编辑分组</small><h2>媒体信息</h2></div></header><div class="media-editor-layout"><div class="admin-form-grid"><AdminFormItem label="标题"><ElInput v-model="editForm.title" maxlength="300" show-word-limit placeholder="请输入便于识别的媒体标题" /><p class="admin-field-help">用于媒体库检索和内容编辑时辨认资源，最多 300 个字符。</p></AdminFormItem><AdminFormItem label="分类"><AdminCompleteSuggestionField v-model="editForm.category" module="media_assets" field="category" multiple :max-length="100" placeholder="例如：团队头像；论文附件" /><p class="admin-field-help">点击输入框可复用媒体库已有分类；多个分类使用中文或英文分号分隔，最多 100 个字符。</p></AdminFormItem></div><AdminMediaPreview :src="previewUrls[editRow.uid] ?? ''" :mime-type="editRow.mime_type" :alt="editForm.title || editRow.object_key" :fallback-text="previewFallback(editRow)" height="11rem" :resolve="false" :expected="isPreviewable(editRow)" @retry="refreshPreview(editRow)" /></div></section>
      <section id="media-editor-storage" class="admin-form-section"><header><div><small>只读信息</small><h2>对象详情</h2></div></header><ElDescriptions :column="1" border><ElDescriptionsItem label="Object key">{{ editRow.object_key }}</ElDescriptionsItem><ElDescriptionsItem label="类型 / 大小">{{ editRow.mime_type }} · {{ formatBytes(editRow.size) }}</ElDescriptionsItem><ElDescriptionsItem label="存储 / 状态">{{ editRow.storage_kind }} · {{ editRow.status === 'active' ? '正常' : '回收站' }}</ElDescriptionsItem></ElDescriptions></section>
    </ElForm>
    <ElAlert v-if="editConflict" title="版本已更新，当前输入尚未保存。加载最新版本后可重新编辑。" type="warning" :closable="false" />
    <ElButton v-if="editConflict" plain @click="reloadMetadata">加载最新版本</ElButton>
    <template #record-meta><span>更新于 {{ formatTime(editRow.updated_at) }}</span><ElTag v-if="editDirty" type="warning" effect="light">有未保存修改</ElTag></template>
    <template #danger-actions><span v-if="canEdit && editRow.status === 'active'" :title="trashTitle(editRow)"><ElButton type="danger" plain :disabled="!canTrash(editRow)" :loading="statusSavingUid === editRow.uid" @click="trashEditedMedia"><Trash2 :size="16" />{{ usageCount(editRow) > 0 ? `已被引用（${usageCount(editRow)}）` : '移入回收站' }}</ElButton></span></template>
  </AdminEditorShell>
  <section v-else class="media-page">
    <AdminListShell :title="pageTitle" :description="pageDescription">
      <template #header-actions>
        <ElButton v-if="isTrash" plain @click="navigateTo('/admin/media')">返回媒体库</ElButton>
        <ElButton v-else plain @click="navigateTo('/admin/media/trash')">回收站（{{ stats.totals.trash }}）</ElButton>
        <ElButton v-if="isTrash && canDelete" type="danger" plain :loading="cleaning" @click="cleanupExpired">清理到期媒体</ElButton>
      </template>
      <div class="media-stats" aria-label="媒体统计">
        <ElCard shadow="never"><span>全部资源</span><strong>{{ stats.totals.total }}</strong></ElCard>
        <ElCard shadow="never"><span>正常使用</span><strong>{{ stats.totals.active }}</strong></ElCard>
        <ElCard shadow="never"><span>回收站</span><strong>{{ stats.totals.trash }}</strong></ElCard>
        <ElCard shadow="never"><span>登记容量</span><strong>{{ formatBytes(stats.totals.bytes) }}</strong></ElCard>
      </div>
      <section v-if="!isTrash && canCreate" class="upload-panel">
        <strong>上传媒体</strong>
        <ElAlert v-if="uploadNotice" type="success" :title="uploadNotice" show-icon closable @close="uploadNotice = ''" />
        <div class="upload-grid">
          <AdminCheckedFormItem class="upload-uid" label="数据库 UID" resource="media" field="uid" :value="uploadUid" :error="ADMIN_UID_PATTERN.test(uploadUid) ? '' : 'UID 格式无效。'"><ElInput v-model="uploadUid" maxlength="128" show-word-limit placeholder="媒体 UID；首次上传前可自定义" /><p class="admin-field-help">用于备份、恢复和对象关联；上传登记后不可修改。</p></AdminCheckedFormItem>
          <ElInput v-model="title" maxlength="300" show-word-limit placeholder="媒体标题；留空使用文件名" />
          <AdminCompleteSuggestionField v-model="category" module="media_assets" field="category" multiple :max-length="100" placeholder="分类，例如 avatar；cover" />
          <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,application/pdf,application/zip" @change="onFileSelected">
          <div class="upload-actions">
            <ElButton v-if="selectedFile?.type.startsWith('image/')" @click="cropOpen = true">裁剪/缩放</ElButton>
            <ElButton type="primary" :loading="uploading" :disabled="!selectedFile || !ADMIN_UID_PATTERN.test(uploadUid)" @click="upload">上传</ElButton>
          </div>
          <AdminMediaPreview v-if="selectedFile" class="upload-preview" :file="selectedFile" :alt="title || selectedFile.name" fallback-text="待上传文件" height="9rem" />
        </div>
        <ElAlert :title="`服务端将校验真实文件签名、MIME、尺寸和体积；当前上限 ${stats.policy.effectiveMaxMb} MB，可用扩展名：${stats.policy.allowedExtensions.join(', ') || '无'}。`" type="info" show-icon :closable="false" />
      </section>
      <AdminListToolbar v-model="q" :loading="loading" search-placeholder="搜索标题、Object key、分类或 MIME" @search="search" @refresh="load">
        <template #actions>
          <ElButton v-if="!isTrash && canEdit" size="small" :disabled="!selectedRows.length" @click="batchStatus('trash')">批量回收（{{ selectedRows.length }}）</ElButton>
          <ElButton v-if="isTrash && canEdit" size="small" :disabled="!selectedRows.length" @click="batchStatus('active')">批量恢复（{{ selectedRows.length }}）</ElButton>
          <ElButton v-if="!isTrash" size="small" :loading="checking" :disabled="!rows.length" @click="scanPage(false)">检查当前页</ElButton>
          <ElButton v-if="!isTrash" size="small" :loading="checking" :disabled="!rows.length" @click="scanPage(true)">深度校验</ElButton>
          <ElButton v-if="!isTrash && canCreate && canEdit" type="primary" plain size="small" :loading="scanStarting || scanRunning" :disabled="!scanSupported" @click="scanAll">扫描全部媒体</ElButton>
        </template>
      </AdminListToolbar>
      <ElAlert v-if="error" class="media-alert" type="error" :title="error" show-icon :closable="false" />
      <ElAlert v-if="scanStatusError" class="media-alert" type="warning" :title="scanStatusError" :closable="false" />
      <ElAlert v-if="fullScan" class="media-alert" :type="fullScan.status === 'completed' && !fullScan.errors && !fullScan.missing && !fullScan.abnormal ? 'success' : 'info'" :title="scanSummary" :closable="false" aria-live="polite">
        <p>{{ fullScan.note || '一次扫描自动处理全部批次。关闭页面后继续运行；缺失或异常文件只标记，不删除。' }}</p>
        <details v-if="fullScan.issues.length"><summary>查看跳过及错误说明（最多 50 条）</summary><p v-for="(issue, index) in fullScan.issues" :key="index">{{ issue.key || '媒体目录' }}：{{ issue.reason }}</p></details>
      </ElAlert>
      <p v-if="!isTrash && !scanSupported && !scanStatusError" class="media-alert">扫描全部媒体适用于 Windows / Ubuntu / Debian 本地磁盘部署。</p>
      <AdminDataTable :rows="rows" :columns="columns" :loading="loading" :selectable="canEdit" :selection-limit="25" :filter-values="filterValues" :action-labels="actionLabels" :preference-key="isTrash ? 'complete:media:trash' : 'complete:media'" :empty-description="isTrash ? '回收站中没有媒体记录' : '没有符合条件的媒体记录'" @selection-change="setSelection" @sort-change="onSort" @filter-change="columnFilter">
        <template #cell="{ row, column }">
          <template v-if="column.key === '_preview'">
            <button type="button" class="preview-button" :aria-label="`预览 ${row.title || row.object_key}`" @click="showPreview(mediaRow(row))">
              <AdminMediaPreview :file="immediatePreviewFiles[row.uid] ?? null" :src="previewUrls[row.uid] ?? ''" :mime-type="String(row.mime_type || '')" :alt="row.title || row.object_key" :fallback-text="previewFallback(mediaRow(row))" height="48px" :resolve="false" :expected="isPreviewable(mediaRow(row))" :loading="loading" :retryable="false" radius=".4rem" />
              <span v-if="uploadedUid === row.uid" class="preview-button__fresh">新</span>
            </button>
          </template>
          <span v-else-if="column.key === 'title'" class="admin-two-line-cell">{{ row.title || '未命名' }}</span>
          <span v-else-if="column.key === 'object_key'" class="admin-two-line-cell admin-monospace-cell">{{ row.object_key }}</span>
          <template v-else-if="column.key === 'category'">{{ row.category || '未分类' }}</template>
          <template v-else-if="column.key === 'size'">{{ formatBytes(Number(row.size)) }}</template>
          <ElTag v-else-if="column.key === 'storage_kind'" :type="optionTone(row, column)" effect="plain">{{ optionLabel(row, column) }}</ElTag>
          <ElTag v-else-if="column.key === 'status'" :type="row.status === 'active' ? 'success' : 'warning'">{{ row.status === 'active' ? '正常' : '回收站' }}</ElTag>
          <template v-else-if="column.key === 'updated_at'">{{ formatTime(row.updated_at) }}</template>
          <ElTag v-else-if="column.key === '_check'" :type="checkLabel(mediaRow(row)).type" effect="plain">{{ checkLabel(mediaRow(row)).label }}</ElTag>
          <template v-else>{{ row[column.key] || '—' }}</template>
        </template>
        <template #actions="{ row }">
          <AdminRowActions>
              <ElButton v-if="!isTrash" size="small" plain @click="showPreview(mediaRow(row))">预览</ElButton>
              <a v-if="!isTrash && canEdit" class="el-button el-button--primary is-plain el-button--small" :href="mediaEditHref(mediaRow(row))" :data-media-edit-uid="row.uid">编辑信息</a>
              <ElButton size="small" plain @click="showUsage(mediaRow(row))">使用位置</ElButton>
              <ElButton v-if="!isTrash" size="small" plain @click="deepCheck(mediaRow(row))">校验</ElButton>
              <span v-if="!isTrash && canEdit" :title="trashTitle(mediaRow(row))"><ElButton size="small" plain type="warning" :disabled="!canTrash(mediaRow(row))" :loading="statusSavingUid === row.uid" @click="setStatus(mediaRow(row), 'trash')">{{ usageCount(mediaRow(row)) > 0 ? `已被引用（${usageCount(mediaRow(row))}）` : '移入回收站' }}</ElButton></span>
              <ElButton v-if="isTrash && canEdit" size="small" plain type="success" :loading="statusSavingUid === row.uid" @click="setStatus(mediaRow(row), 'active')">恢复媒体</ElButton>
              <ElButton v-if="isTrash && canDelete" size="small" plain type="danger" :loading="purgingUid === row.uid" @click="purge(mediaRow(row))">永久清理</ElButton>
              <ElDropdown v-if="!isTrash" trigger="click">
                <ElButton size="small" plain>更多</ElButton>
                <template #dropdown><ElDropdownMenu>
                  <ElDropdownItem @click="copyKey(mediaRow(row))">复制 Object key</ElDropdownItem>
                  <ElDropdownItem v-if="previewUrls[String(row.uid)]" @click="download(mediaRow(row))">下载文件</ElDropdownItem>
                </ElDropdownMenu></template>
              </ElDropdown>
          </AdminRowActions>
        </template>
      </AdminDataTable>
      <div class="pager"><ElPagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10, 20, 50, 100]" :total="total" layout="total,sizes,prev,pager,next" @current-change="load" @size-change="page = 1; load()" /></div>
    </AdminListShell>

    <ElDialog v-model="previewOpen" title="媒体预览" width="min(900px, 94vw)" destroy-on-close>
      <div v-if="previewRow" class="preview-dialog">
        <AdminMediaPreview v-if="String(previewRow.mime_type).startsWith('image/') || String(previewRow.mime_type).startsWith('video/')" :src="previewUrls[previewRow.uid] ?? ''" :mime-type="previewRow.mime_type" :alt="previewRow.title || previewRow.object_key" :fallback-text="previewFallback(previewRow)" height="62vh" :resolve="false" expected @retry="refreshPreview(previewRow)" />
        <iframe v-else-if="previewRow.mime_type === 'application/pdf' && previewUrls[previewRow.uid]" :src="previewUrls[previewRow.uid]" title="PDF 预览" />
        <ElEmpty v-else description="该媒体当前无法在线预览" />
        <ElDescriptions :column="1" border><ElDescriptionsItem label="标题">{{ previewRow.title || '未命名' }}</ElDescriptionsItem><ElDescriptionsItem label="Object key">{{ previewRow.object_key }}</ElDescriptionsItem><ElDescriptionsItem label="类型/大小">{{ previewRow.mime_type }} · {{ formatBytes(previewRow.size) }}</ElDescriptionsItem></ElDescriptions>
      </div>
      <template #footer><ElButton v-if="previewRow?.status === 'active' && previewRow && previewUrls[previewRow.uid]" @click="download(previewRow)">下载</ElButton><ElButton @click="previewOpen = false">关闭</ElButton></template>
    </ElDialog>

    <ElDialog v-model="usageOpen" title="媒体使用位置" width="min(820px, 94vw)">
      <div v-loading="usageLoading">
        <ElDescriptions v-if="usage" :column="1" border><ElDescriptionsItem label="Object key">{{ usage.objectKey }}</ElDescriptionsItem><ElDescriptionsItem label="引用数量">{{ usage.total }}</ElDescriptionsItem></ElDescriptions>
        <ElTable v-if="usage?.usages?.length" :data="usage.usages" class="admin-overview-table" border size="small">
          <ElTableColumn prop="moduleLabel" label="模块" width="150" />
          <ElTableColumn prop="field" label="字段" width="170" />
          <ElTableColumn prop="recordTitle" label="记录" min-width="200">
            <template #default="{ row }">
              <a v-if="usagePath(row)" class="media-usage-link" :href="usagePath(row)!" target="_blank" rel="noopener noreferrer">
                <span class="admin-two-line-cell">{{ row.recordTitle || row.uid }}</span><ExternalLink :size="14" aria-hidden="true" />
              </a>
              <span v-else class="admin-two-line-cell">{{ row.recordTitle || row.uid }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="uid" label="记录 UID" min-width="220" />
        </ElTable>
        <ElEmpty v-else-if="!usageLoading" description="当前没有业务记录引用此媒体" />
      </div>
    </ElDialog>

    <AdminCompleteImageCropper v-model="cropOpen" :file="selectedFile" @cropped="useCropped" />
  </section>
</template>

<style scoped>
.media-page{display:grid;gap:1rem}.media-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;margin-bottom:1rem}.media-stats :deep(.el-card__body){display:grid;gap:.35rem}.media-stats span{font-size:.82rem;color:var(--el-text-color-secondary)}.media-stats strong{font-size:1.45rem}.upload-panel{display:grid;gap:.75rem;margin-bottom:1rem;padding:.85rem;border:1px solid var(--admin-border);border-radius:var(--admin-radius-sm);background:var(--admin-panel-soft)}.upload-grid{display:grid;grid-template-columns:1fr 13rem minmax(16rem,1fr) auto;gap:.75rem;align-items:center}.upload-uid{grid-column:1/-1;margin:0}.upload-preview{grid-column:1/-1}.upload-actions{display:flex;gap:.5rem}.media-editor-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(12rem,18rem);gap:1rem;align-items:center}.media-alert{margin-bottom:.8rem}.preview-button{position:relative;display:grid;place-items:center;width:64px;height:50px;padding:0;border:0;background:transparent;cursor:pointer}.preview-button :deep(.admin-media-preview){width:64px}.preview-button__fresh{position:absolute;top:-.2rem;right:-.2rem;display:grid;place-items:center;width:1.1rem;height:1.1rem;border-radius:999px;color:#fff;background:var(--el-color-success);font-size:.65rem;font-weight:800}.pager{display:flex;justify-content:flex-end;padding-top:1rem}.preview-dialog{display:grid;gap:1rem}.preview-dialog>iframe{width:100%;height:62vh;border:0;background:transparent}.media-usage-link{display:inline-flex;align-items:center;gap:.35rem;max-width:100%;color:var(--el-color-primary);text-decoration:none}.media-usage-link:hover{text-decoration:underline}.media-usage-link .admin-two-line-cell{min-width:0}
@media(max-width:1100px){.media-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.upload-grid{grid-template-columns:1fr 1fr}.upload-actions{justify-content:flex-end}}
@media(max-width:700px){.media-stats,.upload-grid,.media-editor-layout{grid-template-columns:1fr}.pager{overflow:auto;justify-content:flex-start}}
</style>
