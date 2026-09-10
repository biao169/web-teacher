<script setup lang="ts">
import AdminFormItem from '../shared/AdminFormItem.vue'
import AdminFieldRenderer from '../shared/AdminFieldRenderer.vue'
import { completeEditorFieldDescriptor } from '~/admin/editor-fields'
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElForm,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElPagination,
  ElRadioGroup,
  ElTag,
} from 'element-plus'
import { ElRadioButton, ElSelect } from '~/admin/element-plus-ts6'
import { adminErrorDetails } from '~/admin/errors'
import {
  completeResourceColumns,
  completeResourceField,
  completeResourceLabel,
  type CompleteResourceListView,
  type CompleteResourceModulesView,
  type CompleteResourceField,
  type CompleteResourceRow,
  type CompleteResourceSchema,
} from '~/admin/complete-resource'
import { formatAdminDate, formatAdminDateTime } from '~/admin/formatters'
import { adminColumnOptionTone, type AdminListPrimitive, type AdminOptionTone, type AdminUnifiedColumn, type AdminUnifiedSortChange, type AdminUnifiedTableRow } from '~/admin/unified-list'
import { hasAdminPermission } from '~~/shared/admin/registry'
import type { AuthModule } from '~~/shared/enums/auth'
import AdminDataTable from '../shared/AdminDataTable.vue'
import AdminListShell from '../shared/AdminListShell.vue'
import AdminListToolbar from '../shared/AdminListToolbar.vue'
import AdminQuickField from '../shared/AdminQuickField.vue'
import AdminRowActions from '../shared/AdminRowActions.vue'
import AdminSelectOption from '../shared/AdminSelectOption.vue'
import AdminCompleteRecordEditor from './AdminCompleteRecordEditor.vue'

type PublicationTagType = 'success' | 'warning' | 'info'

const props = defineProps<{
  resourceKey: string
  permissionModule?: AuthModule
  title?: string
  description?: string
}>()
const { request } = useCompleteAdminApi()
const auth = useAuthSession()
const configuredSidebar = useAdminSidebarNavigation()
const route = useRoute()
const router = useRouter()

const schema = ref<CompleteResourceSchema | null>(null)
const rows = ref<CompleteResourceRow[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const page = ref(Number(queryText(route.query.page) || 1))
const pageSize = ref(Number(queryText(route.query.pageSize) || 20))
const q = ref(queryText(route.query.q))
const sort = ref(queryText(route.query.sort))
const direction = ref(queryText(route.query.direction))
const filterValues = reactive<Record<string, AdminListPrimitive | undefined>>({})
const selected = ref<AdminUnifiedTableRow[]>([])
const editorOpen = ref(false)
const editUid = ref<string | null>(null)
const editorDirty = ref(false)
const editQueryValue = computed(() => queryText(route.query.edit))
const batchField = ref('')
const batchValue = ref<AdminListPrimitive>(null)
const batchOpen = ref(false)
const batchSaving = ref(false)
const batchMode = ref<'single' | 'sequence'>('single')
const batchStart = ref(0)
const batchStep = ref(10)
const publishingUid = ref('')
const quickSaving = ref('')

const readOnly = computed(() => Boolean(schema.value?.readOnly))
const currentUser = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)
const canCreate = computed(() => !readOnly.value && !schema.value?.readOnlyCreate && (!props.permissionModule || hasAdminPermission(currentUser.value, props.permissionModule, 'create')))
const canEdit = computed(() => !readOnly.value && (!props.permissionModule || hasAdminPermission(currentUser.value, props.permissionModule, 'edit')))
const canDelete = computed(() => !readOnly.value && !schema.value?.readOnlyCreate && !['users', 'roles', 'permissions'].includes(props.resourceKey) && (!props.permissionModule || hasAdminPermission(currentUser.value, props.permissionModule, 'delete')))
const tableColumns = computed(() => schema.value ? completeResourceColumns(schema.value, props.resourceKey) : [])
const actionLabels = computed(() => [
  canEdit.value ? '编辑' : '查看',
  ...(props.resourceKey === 'news' ? ['前台查阅'] : []),
  ...(props.resourceKey === 'news' && canEdit.value ? ['富文本', '立即发布'] : []),
  ...(canDelete.value ? ['删除'] : []),
])
const batchFieldSchema = computed(() => schema.value ? completeResourceField(schema.value, batchField.value) : undefined)
const batchDescriptor = computed(() => batchFieldSchema.value ? completeEditorFieldDescriptor(props.resourceKey, batchFieldSchema.value) : null)
const orderedSelected = computed(() => {
  const uids = new Set(selected.value.map(row => row.uid).filter((uid): uid is string => typeof uid === 'string'))
  return rows.value.filter(row => uids.has(row.uid))
})

function queryText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

function labelFor(key: string): string {
  return schema.value ? completeResourceLabel(schema.value, key) : key
}

function rowUid(row: AdminUnifiedTableRow): string {
  return typeof row.uid === 'string' ? row.uid : ''
}

function rowUpdatedAt(row: AdminUnifiedTableRow): string {
  return typeof row.updated_at === 'string' ? row.updated_at : ''
}

function newsPublicationState(row: AdminUnifiedTableRow): { label: string; type: PublicationTagType } {
  if (row.visibility !== 'public') return { label: '草稿 / 非公开', type: 'info' }
  if (!row.published_at) return { label: '待排期', type: 'warning' }
  const at = Date.parse(String(row.published_at))
  if (Number.isFinite(at) && at > Date.now()) return { label: '定时发布', type: 'warning' }
  return { label: '已发布', type: 'success' }
}

function newsFrontendPath(row: AdminUnifiedTableRow): string {
  const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
  return slug ? `/zh/news/${encodeURIComponent(slug)}` : ''
}

function openNewsFrontend(row: AdminUnifiedTableRow): void {
  const path = newsFrontendPath(row)
  if (!path || newsPublicationState(row).type !== 'success') return
  window.open(path, '_blank', 'noopener,noreferrer')
}

function dateTimeText(value: unknown): string {
  return formatAdminDateTime(value, { fallback: '未设置' })
}

function valueText(row: AdminUnifiedTableRow, key: string): string {
  if (props.resourceKey === 'news' && key === 'published_at') {
    return `${newsPublicationState(row).label} · ${dateTimeText(row.published_at)}`
  }
  const value = row[key]
  if (value === null || value === undefined || value === '') return '—'
  const field = schema.value ? completeResourceField(schema.value, key) : undefined
  if (key.endsWith('_at') || field?.type === 'datetime') return formatAdminDateTime(value)
  if (field?.type === 'date') return formatAdminDate(value)
  const option = field?.options?.find(item => String(item.value) === String(value))
  if (option) return option.label
  if (field?.type === 'boolean') return value === 1 || value === true ? '是' : '否'
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return '—' }
  }
  return String(value)
}

function cancelled(failure: unknown): boolean {
  if (failure === 'cancel' || failure === 'close') return true
  return Boolean(failure && typeof failure === 'object' && 'message' in failure && ((failure as { message?: unknown }).message === 'cancel' || (failure as { message?: unknown }).message === 'close'))
}

function messageFor(failure: unknown, fallback: string): string {
  const details = adminErrorDetails(failure)
  return details.message || fallback
}

function resourceTagType(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): AdminOptionTone {
  return adminColumnOptionTone(column, row[column.key]) ?? 'info'
}

function numberBounds(field: CompleteResourceField | undefined): { min?: number; max?: number } {
  return {
    ...(field?.min !== undefined ? { min: field.min } : {}),
    ...(field?.max !== undefined ? { max: field.max } : {}),
  }
}


async function changeNewsPublication(row: AdminUnifiedTableRow): Promise<void> {
  const live = row.visibility === 'public' && Boolean(row.published_at) && Date.parse(String(row.published_at)) <= Date.now()
  const action = live ? '撤回' : '立即发布'
  try {
    await ElMessageBox.confirm(
      live ? `确定撤回“${String(row.title ?? '')}”吗？撤回后前台将不再显示。` : `确定立即发布“${String(row.title ?? '')}”吗？`,
      `${action}确认`,
      { type: live ? 'warning' : 'success', confirmButtonText: action, cancelButtonText: '取消' },
    )
    const uid = rowUid(row)
    publishingUid.value = uid
    const body: Record<string, unknown> = { expectedUpdatedAt: rowUpdatedAt(row), visibility: live ? 'hidden' : 'public' }
    if (!live) body.published_at = new Date().toISOString()
    await request(`/api/v1/admin/complete/resource/news/${encodeURIComponent(uid)}`, { method: 'PATCH', body })
    ElMessage.success(live ? '已撤回' : '已发布')
    await reloadAfterMutation()
  } catch (failure) {
    if (!cancelled(failure)) ElMessage.error(messageFor(failure, `${action}失败`))
  } finally {
    publishingUid.value = ''
  }
}

function initializeFilters(): void {
  for (const key of Object.keys(filterValues)) Reflect.deleteProperty(filterValues, key)
  for (const field of tableColumns.value) {
    const value = queryText(route.query[`f_${field.key}`])
    if (!value) continue
    filterValues[field.key] = field.kind === 'boolean' ? (value === '1' || value === 'true' ? 1 : 0) : value
  }
}

function activeFilters(): Record<string, AdminListPrimitive> {
  const output: Record<string, AdminListPrimitive> = {}
  for (const field of tableColumns.value) {
    const value = filterValues[field.key]
    if (value !== undefined && value !== null && value !== '') output[`f_${field.key}`] = value
  }
  return output
}

async function loadSchema(): Promise<void> {
  const value = await request<CompleteResourceModulesView>('/api/v1/admin/complete/modules')
  schema.value = value.modules.find(module => module.key === props.resourceKey) ?? null
  if (!schema.value) throw new Error('后台模块未注册')
  if (!sort.value) sort.value = schema.value.defaultSort?.[0] ?? 'updated_at'
  if (!direction.value) direction.value = schema.value.defaultSort?.[1] ?? 'desc'
  initializeFilters()
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    if (!schema.value) await loadSchema()
    const filters = activeFilters()
    const value = await request<CompleteResourceListView>(`/api/v1/admin/complete/resource/${props.resourceKey}`, {
      query: { page: page.value, pageSize: pageSize.value, q: q.value, sort: sort.value, direction: direction.value, ...filters },
    })
    rows.value = [...value.rows]
    total.value = value.total
    selected.value = []
    const nextQuery: Record<string, string | undefined> = {
      page: String(page.value),
      pageSize: String(pageSize.value),
      q: q.value || undefined,
      sort: sort.value,
      direction: direction.value,
      edit: editQueryValue.value || undefined,
    }
    for (const field of tableColumns.value) nextQuery[`f_${field.key}`] = filters[`f_${field.key}`] === undefined ? undefined : String(filters[`f_${field.key}`])
    await router.replace({ query: nextQuery })
  } catch (failure) {
    error.value = messageFor(failure, '列表读取失败')
  } finally {
    loading.value = false
  }
}

function search(): void { page.value = 1; void load() }
function setFilterValue(key: string, value: AdminListPrimitive | undefined): void {
  if (value === undefined) Reflect.deleteProperty(filterValues, key)
  else filterValues[key] = value
}
function onColumnFilter(key: string, value: AdminListPrimitive | undefined): void {
  setFilterValue(key, value)
  page.value = 1
  void load()
}
function setSelection(items: AdminUnifiedTableRow[]): void { selected.value = items }
async function syncEditQuery(value: string | null): Promise<void> {
  if ((value ?? '') === editQueryValue.value) return
  const query = { ...route.query }
  if (value) query.edit = value
  else Reflect.deleteProperty(query, 'edit')
  await router.replace({ query })
}
function openEditor(uid: string | null): void {
  editUid.value = uid
  editorDirty.value = false
  editorOpen.value = true
}
function createRecord(): void {
  if (!canCreate.value) return
  void syncEditQuery('new')
}
function edit(row: AdminUnifiedTableRow): void {
  const uid = rowUid(row)
  void syncEditQuery(uid)
}
async function reloadAfterMutation(): Promise<void> {
  await load()
  if (props.resourceKey === 'navigation') await configuredSidebar.refresh()
}
async function editorSaved(uid: string, andReturn: boolean): Promise<void> {
  editorDirty.value = false
  if (uid) editUid.value = uid
  if (andReturn) await closeEditor()
  else if (uid) await syncEditQuery(uid)
  await reloadAfterMutation()
}
async function openNewsRichText(uid: string): Promise<void> {
  if (props.resourceKey !== 'news' || !canEdit.value || !uid) return
  editorDirty.value = false
  const returnTo = router.resolve({ path: '/admin/news', query: { ...route.query, edit: uid } }).fullPath
  await navigateTo({ path: `/admin/news/editor/${encodeURIComponent(uid)}`, query: { returnTo } })
}
function openNewsRichTextFromList(uid: string): void {
  void navigateTo({ path: `/admin/news/editor/${encodeURIComponent(uid)}`, query: { returnTo: route.fullPath } })
}
async function closeEditor(): Promise<void> { await syncEditQuery(null) }
async function editorDeleted(): Promise<void> { await closeEditor(); await reloadAfterMutation() }

async function applyEditQuery(): Promise<void> {
  const value = editQueryValue.value
  const current = editorOpen.value ? (editUid.value ?? 'new') : ''
  if (value === current) return
  editorDirty.value = false
  if (!value) {
    editorOpen.value = false
    editUid.value = null
    return
  }
  if (value === 'new') {
    if (!canCreate.value) {
      await syncEditQuery(null)
      ElMessage.warning('当前账号没有新建记录权限。')
      return
    }
    openEditor(null)
    return
  }
  openEditor(value)
}

async function quickUpdate(row: AdminUnifiedTableRow, key: string, value: AdminListPrimitive): Promise<void> {
  if (!canEdit.value || row[key] === value) return
  const savingKey = `${rowUid(row)}:${key}`
  quickSaving.value = savingKey
  try {
    await request(`/api/v1/admin/complete/resource/${props.resourceKey}/${encodeURIComponent(rowUid(row))}`, {
      method: 'PATCH',
      body: { expectedUpdatedAt: rowUpdatedAt(row), [key]: value },
    })
    ElMessage.success(`${labelFor(key)}已更新`)
    await reloadAfterMutation()
  } catch (failure) {
    ElMessage.error(messageFor(failure, '快速更新失败，列表已刷新'))
    await load()
  } finally {
    quickSaving.value = ''
  }
}

async function remove(row: AdminUnifiedTableRow): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除“${valueText(row, schema.value?.titleField ?? 'uid')}”吗？此操作不能撤销。`, '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    await request(`/api/v1/admin/complete/resource/${props.resourceKey}/${encodeURIComponent(rowUid(row))}?updatedAt=${encodeURIComponent(rowUpdatedAt(row))}`, { method: 'DELETE' })
    ElMessage.success('已删除')
    await reloadAfterMutation()
  } catch (failure) {
    if (!cancelled(failure)) ElMessage.error(messageFor(failure, '删除失败'))
  }
}

function resetBatchInput(): void {
  const field = batchFieldSchema.value
  batchMode.value = field?.type === 'integer' && field.key === 'sort_order' ? 'sequence' : 'single'
  if (field?.type === 'boolean') batchValue.value = 1
  else if (field?.type === 'select') {
    const initial = field.options?.[0]?.value
    batchValue.value = typeof initial === 'string' || typeof initial === 'number' ? initial : null
  }
  else if (field?.type === 'integer') batchValue.value = Math.max(field.min ?? 0, Math.min(field.max ?? 0, 0))
  else batchValue.value = null
  batchStart.value = field?.key === 'sort_order' ? 10 : Number(batchValue.value ?? 0)
  batchStep.value = 10
}

function onBatchFieldChange(): void { resetBatchInput() }
function openBatch(): void {
  batchField.value = schema.value?.batch?.[0] ?? ''
  resetBatchInput()
  batchOpen.value = true
}

async function applyBatch(): Promise<void> {
  batchSaving.value = true
  try {
    const records = orderedSelected.value.map(row => ({ uid: row.uid, expectedUpdatedAt: row.updated_at }))
    const body: Record<string, unknown> = { records, field: batchField.value }
    if (batchMode.value === 'sequence' && batchFieldSchema.value?.type === 'integer') body.sequence = { start: batchStart.value, step: batchStep.value }
    else body.value = batchValue.value
    await request(`/api/v1/admin/complete/resource/${props.resourceKey}/batch`, { method: 'PATCH', body })
    ElMessage.success(`已更新 ${records.length} 条记录`)
    batchOpen.value = false
    await reloadAfterMutation()
  } catch (failure) {
    ElMessage.error(messageFor(failure, '批量更新失败'))
    selected.value = []
    await load()
  } finally {
    batchSaving.value = false
  }
}

function onSort({ prop, order }: AdminUnifiedSortChange): void {
  if (!prop || !order) return
  sort.value = prop
  direction.value = order === 'ascending' ? 'asc' : 'desc'
  void load()
}

onMounted(async () => { await load(); await applyEditQuery() })
watch(() => route.query.edit, () => { void applyEditQuery() })
watch(() => props.resourceKey, async () => { schema.value = null; page.value = 1; editorOpen.value = false; editUid.value = null; await load(); await applyEditQuery() })
</script>

<template>
  <div v-if="$route.path.includes('/admin/publications') || $route.path.includes('/admin/patents')" class="complete-metadata-shortcut">
    <ElButton :tag="'a'" :href="$route.path.includes('/admin/patents') ? '/admin/patents/metadata' : '/admin/publications/metadata'">外部元数据辅助</ElButton>
  </div>

  <AdminCompleteRecordEditor
    v-if="schema && editorOpen"
    :key="`${resourceKey}:${editUid ?? 'new'}`"
    :resource="schema"
    :uid="editUid"
    :read-only="Boolean(editUid) && !canEdit"
    :can-delete="Boolean(editUid) && canDelete"
    :can-edit-news="canEdit"
    @back="closeEditor"
    @saved="editorSaved"
    @deleted="editorDeleted"
    @dirty="editorDirty = $event"
    @open-rich-text="openNewsRichText"
  />
  <section v-else class="admin-resource-page">
    <AdminListShell :title="title || schema?.label || '后台管理'" :description="description" :can-create="Boolean(schema && canCreate)" create-label="新建记录" @create="createRecord">
      <AdminListToolbar
        v-model="q"
        :loading="loading"
        :selected-count="selected.length"
        :can-batch="Boolean(canEdit && schema?.batch?.length)"
        @search="search"
        @refresh="load"
        @batch="openBatch"
      />
      <ElAlert v-if="error" type="error" :title="error" show-icon :closable="false" class="admin-list-alert" />
      <AdminDataTable
        :rows="rows"
        :columns="tableColumns"
        :loading="loading"
        :selectable="Boolean(canEdit && schema?.batch?.length)"
        :filter-values="filterValues"
        :action-labels="actionLabels"
        :preference-key="`complete:${resourceKey}`"
        :empty-description="q ? '没有符合搜索条件的记录' : '当前没有数据'"
        @selection-change="setSelection"
        @sort-change="onSort"
        @filter-change="onColumnFilter"
      >
        <template #cell="{ row, column }">
          <AdminQuickField
            v-if="column.quickEdit && column.options?.length && canEdit"
            :model-value="row[column.key] as AdminListPrimitive"
            :options="column.options"
            :kind="column.kind ?? 'text'"
            :loading="quickSaving === `${rowUid(row)}:${column.key}`"
            :aria-label="`快速修改${column.label}`"
            @change="value => quickUpdate(row, column.key, value)"
          />
          <ElTag v-else-if="resourceKey === 'news' && column.key === 'published_at'" :type="newsPublicationState(row).type" size="small" effect="plain">{{ valueText(row, column.key) }}</ElTag>
          <ElTag v-else-if="['boolean', 'enum', 'visibility', 'status'].includes(column.kind ?? '')" :type="resourceTagType(row, column)" size="small" effect="plain">{{ valueText(row, column.key) }}</ElTag>
          <span v-else :class="{ 'admin-two-line-cell': column.twoLine }">{{ valueText(row, column.key) }}</span>
        </template>
        <template #actions="{ row }">
          <AdminRowActions>
            <ElButton size="small" plain type="primary" @click="edit(row)">{{ canEdit ? '编辑' : '查看' }}</ElButton>
            <span v-if="resourceKey === 'news'" :title="newsPublicationState(row).type === 'success' ? '在新标签页查看中文前台' : '仅已发布动态可在前台查阅'"><ElButton size="small" plain :disabled="newsPublicationState(row).type !== 'success' || !newsFrontendPath(row)" @click="openNewsFrontend(row)">前台查阅</ElButton></span>
            <template v-if="resourceKey === 'news' && canEdit">
              <ElButton size="small" plain type="success" @click="openNewsRichTextFromList(rowUid(row))">富文本</ElButton>
              <ElButton size="small" plain :type="newsPublicationState(row).type === 'success' ? 'warning' : 'primary'" :loading="publishingUid === row.uid" @click="changeNewsPublication(row)">{{ newsPublicationState(row).type === 'success' ? '撤回' : '立即发布' }}</ElButton>
            </template>
            <ElButton v-if="canDelete" size="small" plain type="danger" @click="remove(row)">删除</ElButton>
          </AdminRowActions>
        </template>
      </AdminDataTable>
      <div class="admin-pagination">
        <ElPagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10, 20, 50, 100]" :total="total" layout="total, sizes, prev, pager, next" @change="load" />
      </div>
    </AdminListShell>

    <ElDialog v-model="batchOpen" title="批量更新" width="min(520px,94vw)">
      <ElForm label-position="top">
        <AdminFormItem label="字段">
          <ElSelect v-model="batchField" placeholder="请选择要批量修改的字段" style="width:100%" @change="onBatchFieldChange"><AdminSelectOption v-for="key in schema?.batch ?? []" :key="key" :label="labelFor(key)" :value="key" /></ElSelect>
          <p class="admin-field-help">选择一个字段进行批量更新；其他字段保持原值。</p>
        </AdminFormItem>
        <AdminFormItem v-if="batchFieldSchema?.type === 'integer'" label="更新方式">
          <ElRadioGroup v-model="batchMode"><ElRadioButton value="single">统一设值</ElRadioButton><ElRadioButton value="sequence">按列表顺序</ElRadioButton></ElRadioGroup>
          <p class="admin-field-help">统一设值写入同一数值；按列表顺序可生成递增或递减序列。</p>
        </AdminFormItem>
        <template v-if="batchMode === 'sequence' && batchFieldSchema?.type === 'integer'">
          <ElAlert title="将按当前列表顺序从起始值递增或递减。" type="info" :closable="false" class="admin-batch-hint" />
          <div class="admin-batch-sequence">
            <AdminFormItem label="起始值"><ElInputNumber v-model="batchStart" v-bind="numberBounds(batchFieldSchema)" /><p class="admin-field-help">当前列表第一条记录使用的数值。</p></AdminFormItem>
            <AdminFormItem label="步长"><ElInputNumber v-model="batchStep" :min="-1000000" :max="1000000" /><p class="admin-field-help">后续记录依次增加此数值；可填写负数，不能为 0。</p></AdminFormItem>
          </div>
        </template>
        <AdminFormItem v-else-if="batchDescriptor" :label="batchDescriptor.label" :required="batchDescriptor.required">
          <AdminFieldRenderer v-model="batchValue" :descriptor="batchDescriptor" :disabled="batchSaving" compact />
          <p class="admin-field-help">{{ batchDescriptor.help }}</p>
        </AdminFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="batchOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="batchSaving" :disabled="!orderedSelected.length || (batchMode === 'sequence' && batchStep === 0)" @click="applyBatch">更新 {{ orderedSelected.length }} 条</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped>
.admin-resource-page { display: grid; gap: 1rem; }
.admin-list-alert { margin-bottom: 1rem; }
.admin-pagination { display: flex; justify-content: flex-end; padding-top: 1rem; }
.admin-batch-hint { margin-bottom: 1rem; }
.admin-batch-sequence { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.complete-metadata-shortcut { display: flex; justify-content: flex-end; margin-bottom: .75rem; }
@media (max-width:720px) {
  .admin-batch-sequence { grid-template-columns: 1fr; }
  .admin-pagination { justify-content: flex-start; overflow: auto; }
}
</style>
