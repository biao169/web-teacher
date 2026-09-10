<script setup lang="ts">
import { useAdminEditorLifecycle } from '~/composables/useAdminEditorLifecycle'
import AdminFormItem from '../shared/AdminFormItem.vue'
import { Copy } from '@lucide/vue'
import { ElAlert, ElButton, ElDescriptions, ElDescriptionsItem, ElDialog, ElForm, ElMessage, ElPagination, ElRadioButton, ElRadioGroup, ElSwitch, ElTag } from 'element-plus'
import { downloadAdminTextFile } from '~/admin/download'
import { formatAdminDateTime as formatTime } from '~/admin/formatters'
import type { AdminListPrimitive, AdminUnifiedColumn, AdminUnifiedSortChange, AdminUnifiedTableRow } from '~/admin/unified-list'
import { ADMIN_MODULES, hasAdminPermission } from '~~/shared/admin/registry'
import type { SafeUserView } from '~~/shared/contracts/auth'
import AdminDataTable from '../shared/AdminDataTable.vue'
import AdminListShell from '../shared/AdminListShell.vue'
import AdminListToolbar from '../shared/AdminListToolbar.vue'
import AdminRowActions from '../shared/AdminRowActions.vue'
import AdminEditorShell from '../shared/AdminEditorShell.vue'

interface Facet { value: string; label?: string; count: number }
interface LogRow extends AdminUnifiedTableRow {
  uid: string
  actor_uid?: string | null
  actor_name?: string | null
  action: string
  module: string
  target_uid?: string | null
  summary?: string | null
  status?: string | null
  created_at: string
}

const MODULE_LABELS: Record<string, string> = {
  ...Object.fromEntries(ADMIN_MODULES.map(item => [item.module, item.shortTitle])),
  'site-settings': '网站设置', 'global-settings': '全局设置', navigation: '导航与按钮', media: '媒体库',
  translation: '翻译缓存与任务', logs: '操作日志', users: '用户账号', roles: '角色', permissions: '权限矩阵',
}
const ACTION_LABELS: Record<string, string> = {
  create: '创建', update: '更新', delete: '删除', batch_update: '批量更新', export: '导出', upload: '上传',
  recycle: '移入回收站', restore: '恢复', purge: '永久清理', scan: '扫描', translate: '翻译', retry: '重试',
  manual_translation: '人工翻译', invalidate: '失效缓存', user_create: '创建用户', user_update: '更新用户',
  password_reset: '重置密码', role_create: '创建角色', role_update: '更新角色', role_delete: '删除角色',
  permissions_update: '更新权限', sessions_revoked: '撤销会话',
}

const { request } = useCompleteAdminApi()
const auth = useAuthSession()
const route = useRoute()
const router = useRouter()
const currentUser = computed<SafeUserView | null>(() => auth.session.value.authenticated ? auth.session.value.user as unknown as SafeUserView : null)
const canExport = computed(() => hasAdminPermission(currentUser.value, 'operation_logs', 'export'))
const rows = ref<LogRow[]>([])
const total = ref(0)
const page = ref(Math.max(1, Number(route.query.page) || 1))
const pageSize = ref([10, 20, 50, 100].includes(Number(route.query.pageSize)) ? Number(route.query.pageSize) : 20)
const sort = ref(String(route.query.sort || 'created_at'))
const direction = ref<'asc' | 'desc'>(route.query.direction === 'asc' ? 'asc' : 'desc')
const q = ref(String(route.query.q || ''))
const filterValues = reactive<Record<string, AdminListPrimitive | undefined>>({})
const loading = ref(false)
const error = ref('')
const stats = reactive({ total: 0, successes: 0, failures: 0, today: 0 })
const facets = reactive<{ modules: Facet[]; actions: Facet[]; statuses: Facet[]; actors: Facet[] }>({ modules: [], actions: [], statuses: [], actors: [] })
const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<any>(null)
const editor = useAdminEditorLifecycle({ dirty: () => false, identity: route => JSON.stringify([route.path, route.query.detail ?? '']) })
const detailQueryUid = computed(() => queryText(route.query.detail).trim())
const detailPretty = computed(() => JSON.stringify(detail.value?.detail ?? {}, null, 2))
const exportOpen = ref(false)
const exportBusy = ref(false)
const exportFormat = ref<'csv' | 'json'>('csv')
const exportDetails = ref(false)

const columns = computed<AdminUnifiedColumn[]>(() => [
  { key: 'created_at', label: '时间', kind: 'datetime', width: 160, sortable: true, filterable: true, resizable: true },
  { key: 'actor_name', label: '操作者', minWidth: 150, sortable: true, filterable: true, resizable: true, twoLine: true, options: facets.actors.map(item => ({ value: item.value, label: `${item.label || item.value}（${item.count}）` })) },
  { key: 'module', label: '模块', minWidth: 125, sortable: true, filterable: true, resizable: true, options: facets.modules.map(item => ({ value: item.value, label: `${moduleLabel(item.value)}（${item.count}）` })) },
  { key: 'action', label: '动作', minWidth: 112, sortable: true, filterable: true, resizable: true, options: facets.actions.map(item => ({ value: item.value, label: `${actionLabel(item.value)}（${item.count}）` })) },
  { key: 'target_uid', label: '目标 UID', minWidth: 170, sortable: true, filterable: true, resizable: true },
  { key: 'summary', label: '摘要', kind: 'long-text', minWidth: 260, sortable: true, filterable: true, resizable: true, twoLine: true },
  { key: 'status', label: '结果', kind: 'status', width: 92, sortable: true, filterable: true, resizable: true, options: facets.statuses.map(item => ({ value: item.value, label: `${statusLabel(item.value)}（${item.count}）` })) },
])
function queryText(value: unknown): string { return typeof value === 'string' ? value : '' }
function initializeFilters(): void {
  for (const column of columns.value) filterValues[column.key] = queryText(route.query[`f_${column.key}`]) || undefined
}
function moduleLabel(value: string): string { return MODULE_LABELS[value] ?? value }
function actionLabel(value: string): string { return ACTION_LABELS[value] ?? value }
function statusLabel(value: unknown): string { return value === 'success' ? '成功' : value === 'failed' ? '失败' : value ? String(value) : '未标记' }
function statusType(value: unknown): 'success' | 'danger' | 'info' | 'warning' { return value === 'success' ? 'success' : value === 'failed' ? 'danger' : value ? 'warning' : 'info' }
function queryValues(includePage = true): Record<string, string | number | boolean | undefined> {
  const value: Record<string, string | number | boolean | undefined> = {
    ...(includePage ? { page: page.value, pageSize: pageSize.value } : {}),
    q: q.value.trim() || undefined,
    sort: sort.value,
    direction: direction.value,
  }
  for (const column of columns.value) {
    const filter = filterValues[column.key]
    value[`f_${column.key}`] = filter === undefined || filter === null || filter === '' ? undefined : String(filter)
  }
  return value
}
function errorText(value: any, fallback: string): string { return value?.data?.error?.message ?? value?.message ?? fallback }

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const value = await request<any>('/api/v1/admin/complete/logs', { query: queryValues() })
    rows.value = value.rows
    total.value = Number(value.total ?? 0)
    Object.assign(stats, value.stats)
    facets.modules = value.facets?.modules ?? []
    facets.actions = value.facets?.actions ?? []
    facets.statuses = value.facets?.statuses ?? []
    facets.actors = value.facets?.actors ?? []
    const next = { ...queryValues(), detail: detailQueryUid.value || undefined }
    await router.replace({ query: Object.fromEntries(Object.entries(next).filter(([, item]) => item !== undefined).map(([key, item]) => [key, String(item)])) })
  } catch (value: any) { error.value = errorText(value, '操作日志读取失败') }
  finally { loading.value = false }
}
function applyFilters(): void { page.value = 1; void load() }
function setFilter(key: string, value: AdminListPrimitive | undefined): void {
  if (value === undefined) Reflect.deleteProperty(filterValues, key)
  else filterValues[key] = value
}
function columnFilter(key: string, value: AdminListPrimitive | undefined): void { setFilter(key, value); applyFilters() }
function onSort(value: AdminUnifiedSortChange): void {
  if (!value.prop || !value.order) return
  sort.value = value.prop
  direction.value = value.order === 'ascending' ? 'asc' : 'desc'
  applyFilters()
}
async function openDetail(row: AdminUnifiedTableRow): Promise<void> {
  const uid = String(row.uid ?? '').trim()
  if (!uid) return
  await syncDetailQuery(uid)
}
async function loadDetail(uid: string): Promise<void> {
  const current = editor.startLoad()
  detailOpen.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const value = await request<any>(`/api/v1/admin/complete/logs/${encodeURIComponent(uid)}`)
    if (current() && uid === detailQueryUid.value) detail.value = value.record
  } catch (value: any) {
    if (!current() || uid !== detailQueryUid.value) return
    ElMessage.error(errorText(value, '日志详情读取失败')); await syncDetailQuery(null)
  } finally { if (current()) detailLoading.value = false }
}
async function syncDetailQuery(uid: string | null): Promise<void> {
  if ((uid ?? '') === detailQueryUid.value) return
  const query = { ...route.query }
  if (uid) query.detail = uid
  else Reflect.deleteProperty(query, 'detail')
  await router.replace({ query })
}
async function applyDetailQuery(): Promise<void> {
  const uid = detailQueryUid.value
  if (!uid) {
    editor.invalidateLoad()
    detailLoading.value = false
    detailOpen.value = false
    detail.value = null
    return
  }
  if (detail.value?.uid === uid) return
  await loadDetail(uid)
}
async function closeDetail(): Promise<void> { await syncDetailQuery(null) }
function rowIdentifier(row: AdminUnifiedTableRow): string {
  const targetUid = typeof row.target_uid === 'string' ? row.target_uid.trim() : ''
  return targetUid || String(row.uid ?? '').trim()
}
async function copyIdentifier(row: AdminUnifiedTableRow): Promise<void> {
  const identifier = rowIdentifier(row)
  if (!identifier) { ElMessage.info('这条日志没有可复制的标识。'); return }
  try {
    await navigator.clipboard.writeText(identifier)
    ElMessage.success(row.target_uid ? '目标 UID 已复制' : '日志 UID 已复制')
  } catch { ElMessage.error('复制失败，请打开详情后手动复制。') }
}
async function exportLogs(): Promise<void> {
  exportBusy.value = true
  try {
    const value = await request<any>('/api/v1/admin/complete/logs/export', { method: 'POST', body: { ...queryValues(false), format: exportFormat.value, includeDetails: exportDetails.value } })
    downloadAdminTextFile(value.filename, value.mime, value.content)
    ElMessage.success(`已导出 ${value.rows} 条安全日志`)
    exportOpen.value = false
    await load()
  } catch (value: any) { ElMessage.error(errorText(value, '操作日志导出失败')) }
  finally { exportBusy.value = false }
}

initializeFilters()
watch(() => route.query.detail, () => { void applyDetailQuery() })
onMounted(async () => { await load(); await applyDetailQuery() })
</script>

<template>
  <AdminEditorShell
    v-if="detailOpen"
    eyebrow="审计日志"
    title="操作日志详情"
    description="查看只读审计记录和经过服务端脱敏的安全详情。"
    :sections="[{ id: 'log-detail-overview', label: '操作摘要' }, { id: 'log-detail-security', label: '安全详情' }]"
    :can-write="false"
    @back="closeDetail"
  >
    <div v-loading="detailLoading" class="detail-body">
      <template v-if="detail">
        <section id="log-detail-overview" class="admin-form-section"><header><div><small>只读信息</small><h2>操作摘要</h2></div></header><ElDescriptions :column="1" border><ElDescriptionsItem label="日志 UID">{{ detail.uid }}</ElDescriptionsItem><ElDescriptionsItem label="时间">{{ formatTime(detail.created_at) }}</ElDescriptionsItem><ElDescriptionsItem label="操作者">{{ detail.actor_name || '系统' }}（{{ detail.actor_uid || '无账号 UID' }}）</ElDescriptionsItem><ElDescriptionsItem label="模块 / 动作">{{ moduleLabel(detail.module) }} / {{ actionLabel(detail.action) }}</ElDescriptionsItem><ElDescriptionsItem label="目标 UID">{{ detail.target_uid || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="执行结果"><ElTag :type="statusType(detail.status)" size="small">{{ statusLabel(detail.status) }}</ElTag></ElDescriptionsItem><ElDescriptionsItem label="请求编号">{{ detail.requestId || '未记录' }}</ElDescriptionsItem><ElDescriptionsItem label="摘要">{{ detail.summary || '—' }}</ElDescriptionsItem></ElDescriptions></section>
        <section id="log-detail-security" class="admin-form-section"><header><div><small>只读信息</small><h2>安全详情</h2></div></header><ElAlert title="密码、Cookie、Authorization、Session、CSRF、Token 和 API 密钥等字段会在服务端脱敏后返回。" type="info" :closable="false" /><pre class="detail-json">{{ detailPretty }}</pre></section>
      </template>
    </div>
    <template #record-meta><span v-if="detail">记录于 {{ formatTime(detail.created_at) }}；日志不可修改。</span></template>
  </AdminEditorShell>
  <section v-else class="log-page">
    <AdminListShell title="操作日志" description="追踪后台关键变更和执行结果。日志只读，可按任意列筛选、排序并导出。">
      <template #header-actions><ElButton v-if="canExport" type="primary" plain @click="exportOpen = true">导出当前结果</ElButton></template>
      <div class="admin-metric-grid log-metrics">
        <article class="admin-metric-card"><small>当前结果</small><strong>{{ stats.total }}</strong><p>所有筛选条件共同生效</p></article>
        <article class="admin-metric-card"><small>成功</small><strong>{{ stats.successes }}</strong><p>结果标记为 success</p></article>
        <article class="admin-metric-card"><small>失败</small><strong>{{ stats.failures }}</strong><p>用于定位异常操作</p></article>
        <article class="admin-metric-card"><small>今日记录</small><strong>{{ stats.today }}</strong><p>按 UTC 自然日统计</p></article>
      </div>
      <AdminListToolbar v-model="q" :loading="loading" search-placeholder="搜索操作者、模块、动作、目标或摘要" @search="applyFilters" @refresh="load" />
      <ElAlert v-if="error" :title="error" type="error" show-icon :closable="false" class="log-alert" />
      <AdminDataTable :rows="rows" :columns="columns" :loading="loading" :filter-values="filterValues" :action-labels="['查看', '复制标识']" preference-key="complete:logs" empty-description="当前没有符合条件的操作日志" @sort-change="onSort" @filter-change="columnFilter">
        <template #cell="{ row, column }">
          <template v-if="column.key === 'created_at'">{{ formatTime(row.created_at) }}</template>
          <template v-else-if="column.key === 'actor_name'"><strong>{{ row.actor_name || '系统' }}</strong><small class="subline">{{ row.actor_uid || '无账号 UID' }}</small></template>
          <template v-else-if="column.key === 'module'">{{ moduleLabel(String(row.module ?? '')) }}</template>
          <template v-else-if="column.key === 'action'">{{ actionLabel(String(row.action ?? '')) }}</template>
          <ElTag v-else-if="column.key === 'status'" :type="statusType(row.status)" size="small" effect="plain">{{ statusLabel(row.status) }}</ElTag>
          <span v-else :class="{ 'admin-two-line-cell': column.twoLine }">{{ row[column.key] || '—' }}</span>
        </template>
        <template #actions="{ row }"><AdminRowActions><ElButton size="small" plain type="primary" @click="openDetail(row)">查看</ElButton><ElButton size="small" plain :disabled="!rowIdentifier(row)" title="复制目标 UID；没有目标时复制日志 UID" @click="copyIdentifier(row)"><Copy :size="14" />复制标识</ElButton></AdminRowActions></template>
      </AdminDataTable>
      <div class="pagination"><span>共 {{ total }} 条；日志为只读记录。</span><ElPagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50,100]" :total="total" layout="total, sizes, prev, pager, next" @change="load" /></div>
    </AdminListShell>

    <ElDialog v-model="exportOpen" title="导出当前筛选结果" width="min(520px,94vw)" destroy-on-close>
      <ElForm label-position="top">
        <AdminFormItem label="文件格式"><ElRadioGroup v-model="exportFormat"><ElRadioButton value="csv">CSV</ElRadioButton><ElRadioButton value="json">JSON</ElRadioButton></ElRadioGroup><p class="admin-field-help">CSV 适合表格分析，JSON 适合保留结构化字段。</p></AdminFormItem>
        <AdminFormItem label="安全详情"><ElSwitch v-model="exportDetails" active-text="包含已脱敏详情" inactive-text="仅导出列表字段" /><p class="admin-field-help">启用后包含已脱敏请求详情，但不会导出密码、令牌或密钥原文。</p></AdminFormItem>
        <ElAlert :title="exportDetails ? '包含详情时最多导出 5,000 条，且文件不得超过 24 MB。' : '列表字段最多导出 20,000 条；CSV 会防止表格公式注入。'" type="info" :closable="false" />
      </ElForm>
      <template #footer><ElButton @click="exportOpen = false">取消</ElButton><ElButton type="primary" :loading="exportBusy" @click="exportLogs">生成并下载</ElButton></template>
    </ElDialog>
  </section>
</template>

<style scoped>
.log-page{display:grid;gap:1rem}.log-metrics{margin-bottom:1rem}.log-alert{margin-bottom:.75rem}.subline{display:block;margin-top:.16rem;color:var(--admin-muted);font-size:.7rem;font-weight:400}.pagination{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-top:.85rem;color:var(--admin-muted);font-size:.75rem}.detail-body{min-height:8rem}.detail-body h3{margin:1.25rem 0 .75rem}.detail-json{max-height:34rem;margin:.75rem 0 0;padding:1rem;overflow:auto;border:1px solid var(--admin-border);border-radius:var(--admin-radius);background:var(--el-fill-color-lighter);font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;white-space:pre-wrap;word-break:break-word}@media(max-width:680px){.pagination{align-items:flex-start;flex-direction:column;overflow:auto}}
</style>
