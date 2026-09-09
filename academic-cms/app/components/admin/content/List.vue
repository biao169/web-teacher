<script setup lang="ts">
import { useMutation, useQuery } from '@tanstack/vue-query'
import { Copy, Edit3, Trash2 } from '@lucide/vue'
import { ElButton, ElMessage, ElMessageBox, ElPagination, ElTag } from 'element-plus'
import { adminErrorDetails } from '~/admin/errors'
import { adminQueryKeys, getAdminQueryClient } from '~/admin/query-client'
import {
  ADMIN_CONTENT_PAGE_SIZES,
  contentCreatePath,
  contentListApiQuery,
  contentListRouteQuery,
  contentRecordPath,
  firstQueryValue,
  formatAdminContentValue,
} from '~/admin/content-utils'
import { adminColumnOptionLabel, adminColumnOptionTone, adminOptionsWithTones, type AdminListOption, type AdminListPrimitive, type AdminOptionTone, type AdminUnifiedColumn, type AdminUnifiedSortChange, type AdminUnifiedTableRow } from '~/admin/unified-list'
import { ADMIN_CONTENT_BATCH_LIMIT, type AdminContentModuleDefinition, type AdminContentValue, type AdminListColumn } from '~~/shared/admin/content-modules'
import type { AdminContentBatchView, AdminContentDeleteView, AdminContentListItem, AdminContentListView } from '~~/shared/contracts/admin-content'
import type { MediaViewModel } from '~~/shared/contracts/media'
import AdminDataTable from '../shared/AdminDataTable.vue'
import AdminListAvatar from '../shared/AdminListAvatar.vue'
import AdminListShell from '../shared/AdminListShell.vue'
import AdminListToolbar from '../shared/AdminListToolbar.vue'
import AdminQuickField from '../shared/AdminQuickField.vue'
import AdminRowActions from '../shared/AdminRowActions.vue'

const props = defineProps<{ definition: AdminContentModuleDefinition }>()
const route = useRoute()
const router = useRouter()
const api = useAdminApi()
const searchDraft = ref(firstQueryValue(route.query.q) ?? '')
const filterDrafts = reactive<Record<string, AdminListPrimitive | undefined>>({})
const selected = ref<AdminContentListItem[]>([])
const batchOpen = ref(false)
const quickSaving = ref('')
const deletingUid = ref('')

const apiQuery = computed(() => contentListApiQuery(props.definition, route.query))
const queryKey = computed(() => adminQueryKeys.list(props.definition.module, apiQuery.value))
const query = useQuery({
  queryKey,
  queryFn: () => api.request<AdminContentListView>(`/api/v1/admin/content/${props.definition.module}`, { query: apiQuery.value }),
}, getAdminQueryClient())
const { data, error, isPending, isFetching, refetch } = query
const details = computed(() => error.value ? adminErrorDetails(error.value) : null)
const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / Number(apiQuery.value.pageSize ?? 20))))
const primaryActionLabel = computed(() => props.definition.module === 'messages' ? (data.value?.permissions.edit ? '处理' : '查看') : (data.value?.permissions.edit ? '编辑' : '查看'))
const canDelete = computed(() => Boolean(props.definition.canDelete && data.value?.permissions.delete))
const actionLabels = computed(() => {
  if (props.definition.module === 'messages') return [primaryActionLabel.value, '复制邮箱']
  return canDelete.value ? [primaryActionLabel.value, '删除'] : [primaryActionLabel.value]
})

function twoLineColumn(column: AdminListColumn): boolean {
  return column.kind === 'long-text' || ['title', 'authors', 'author', 'description', 'summary', 'name', 'name_en'].includes(column.field)
}
function booleanColumnOptions(field: string): readonly AdminListOption[] {
  if (field === 'is_active' || field === 'enabled') return [{ value: true, label: '启用', tone: 'success' }, { value: false, label: '停用', tone: 'danger' }]
  if (field === 'is_featured') return [{ value: true, label: '精选', tone: 'success' }, { value: false, label: '未精选', tone: 'info' }]
  return [{ value: true, label: '是', tone: 'success' }, { value: false, label: '否', tone: 'danger' }]
}
function columnOptions(column: AdminListColumn): readonly AdminListOption[] {
  if (column.kind === 'boolean') return booleanColumnOptions(column.field)
  const filter = props.definition.filters.find(item => item.field === column.field)
  const field = props.definition.fields.find(item => item.name === column.field)
  const staticOptions = filter?.options ?? field?.options
  if (staticOptions?.length) return adminOptionsWithTones(staticOptions, column.kind)
  return adminOptionsWithTones((data.value?.facets[column.field] ?? []).map(option => ({ value: option.value, label: option.label })), column.kind)
}

const tableColumns = computed<AdminUnifiedColumn[]>(() => props.definition.columns.map(column => ({
  key: column.field,
  label: column.label,
  kind: column.kind,
  ...(column.width !== undefined ? { width: column.width } : {}),
  ...(column.minWidth !== undefined ? { minWidth: column.minWidth } : column.width === undefined ? { minWidth: twoLineColumn(column) ? 220 : 140 } : {}),
  primary: Boolean(column.primary),
  sortable: column.sortable !== false,
  filterable: column.filterable !== false,
  resizable: column.resizable !== false,
  twoLine: twoLineColumn(column),
  quickEdit: props.definition.batchFields.includes(column.field) && ['boolean', 'visibility', 'status'].includes(column.kind),
  options: columnOptions(column),
})))

const tableRows = computed<AdminUnifiedTableRow[]>(() => (data.value?.items ?? []).map(item => ({
  uid: item.uid,
  created_at: item.createdAt,
  updated_at: item.updatedAt,
  __media: item.media,
  ...item.values,
})))

watch(() => route.query.q, value => { searchDraft.value = firstQueryValue(value) ?? '' })
watch(() => route.fullPath, () => {
  selected.value = []
  for (const column of props.definition.columns) filterDrafts[column.field] = firstQueryValue(route.query[`f_${column.field}`])
}, { immediate: true })
watch([data, totalPages], ([view, pages]) => {
  const page = Number(apiQuery.value.page ?? 1)
  if (view && view.total > 0 && page > pages) void setQuery({ page: pages })
})

function routeQueryWith(changes: Readonly<Record<string, unknown>>): Record<string, string> {
  return contentListRouteQuery(props.definition, { ...route.query, ...changes })
}
async function setQuery(changes: Readonly<Record<string, unknown>>): Promise<void> {
  await router.replace({ path: props.definition.path, query: routeQueryWith(changes) })
}
function applySearch(): void { void setQuery({ q: searchDraft.value.trim(), page: 1 }) }
function setFilterValue(key: string, value: AdminListPrimitive | undefined): void {
  if (value === undefined) Reflect.deleteProperty(filterDrafts, key)
  else filterDrafts[key] = value
}
function onColumnFilter(key: string, value: AdminListPrimitive | undefined): void {
  setFilterValue(key, value)
  void setQuery({ [`f_${key}`]: value, page: 1 })
}
function onSort({ prop, order }: AdminUnifiedSortChange): void {
  if (!prop || !order) return
  void setQuery({ sort: prop, direction: order === 'ascending' ? 'asc' : 'desc', page: 1 })
}
function original(row: AdminUnifiedTableRow): AdminContentListItem | undefined {
  return data.value?.items.find(item => item.uid === row.uid)
}
function editRow(row: AdminUnifiedTableRow): void {
  const item = original(row)
  if (item) edit(item)
}
function edit(item: AdminContentListItem): void {
  void router.push({ path: contentRecordPath(props.definition, item.uid), query: { return: route.fullPath } })
}
function create(): void { void router.push({ path: contentCreatePath(props.definition), query: { return: route.fullPath } }) }
function rowEmail(row: AdminUnifiedTableRow): string {
  const value = original(row)?.values.email
  return typeof value === 'string' ? value.trim() : ''
}
async function copyEmail(row: AdminUnifiedTableRow): Promise<void> {
  const email = rowEmail(row)
  if (!email) { ElMessage.info('这条留言没有可复制的邮箱地址。'); return }
  try {
    await navigator.clipboard.writeText(email)
    ElMessage.success('留言人邮箱已复制')
  } catch { ElMessage.error('复制失败，请在详情中手动复制邮箱地址。') }
}
async function removeRow(row: AdminUnifiedTableRow): Promise<void> {
  const item = original(row)
  if (!item || !canDelete.value) return
  try {
    await ElMessageBox.confirm(`删除后将无法在后台恢复这条${props.definition.singularTitle}记录。确定继续吗？`, '确认删除', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger',
    })
  } catch { return }
  deletingUid.value = item.uid
  try {
    const result = await api.request<AdminContentDeleteView>(`/api/v1/admin/content/${props.definition.module}/${encodeURIComponent(item.uid)}`, {
      method: 'DELETE', body: { expectedUpdatedAt: item.updatedAt },
    })
    selected.value = selected.value.filter(selectedItem => selectedItem.uid !== item.uid)
    ElMessage.success(result.message)
    await getAdminQueryClient().invalidateQueries({ queryKey: ['admin', 'list', props.definition.module] })
  } catch (failure) {
    const info = adminErrorDetails(failure)
    if (info.status === 409 || info.code === 'ADMIN_CONTENT_CONFLICT' || info.code === 'ADMIN_CONFLICT') {
      await getAdminQueryClient().invalidateQueries({ queryKey: ['admin', 'list', props.definition.module] })
      ElMessage.error('记录已被其他操作更新，列表已刷新。')
    } else ElMessage.error(info.message)
  } finally { deletingUid.value = '' }
}
function displayed(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): string {
  const source = props.definition.columns.find(item => item.field === column.key)
  return adminColumnOptionLabel(column, row[column.key]) ?? (source ? formatAdminContentValue(row[column.key] as AdminContentValue | undefined, source) : String(row[column.key] ?? '—'))
}
function cellTone(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): AdminOptionTone { return adminColumnOptionTone(column, row[column.key]) ?? 'info' }
function rowMedia(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): MediaViewModel | null {
  const media = row.__media
  if (!media || typeof media !== 'object' || Array.isArray(media)) return null
  const value = (media as Readonly<Record<string, unknown>>)[column.key]
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as { available?: unknown }).available !== 'boolean') return null
  return value as MediaViewModel
}
function mediaAlt(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): string | null {
  const source = props.definition.columns.find(item => item.field === column.key)
  const value = source?.media ? row[source.media.altField] : row[props.definition.primaryField]
  return typeof value === 'string' ? value : null
}
function setSelection(rows: AdminUnifiedTableRow[]): void {
  selected.value = rows.flatMap(row => {
    const item = original(row)
    return item ? [item] : []
  }).slice(0, ADMIN_CONTENT_BATCH_LIMIT)
}

async function quickUpdate(row: AdminUnifiedTableRow, column: AdminUnifiedColumn, value: AdminListPrimitive): Promise<void> {
  const item = original(row)
  if (!item || !data.value?.permissions.edit || item.values[column.key] === value) return
  const savingKey = `${item.uid}:${column.key}`
  quickSaving.value = savingKey
  try {
    await api.request(`/api/v1/admin/content/${props.definition.module}/${encodeURIComponent(item.uid)}`, {
      method: 'PATCH',
      body: { expectedUpdatedAt: item.updatedAt, values: { [column.key]: value } },
    })
    ElMessage.success(`${column.label}已更新`)
    await getAdminQueryClient().invalidateQueries({ queryKey: ['admin', 'list', props.definition.module] })
  } catch (failure) {
    const info = adminErrorDetails(failure)
    if (info.status === 409 || info.code === 'ADMIN_CONTENT_CONFLICT' || info.code === 'ADMIN_CONFLICT') {
      await getAdminQueryClient().invalidateQueries({ queryKey: ['admin', 'list', props.definition.module] })
      ElMessage.error('记录已被其他操作更新，列表已刷新。')
    } else ElMessage.error(info.message)
  } finally {
    quickSaving.value = ''
  }
}

const batchMutation = useMutation({
  mutationFn: ({ field, value }: { field: string; value: AdminContentValue }) => api.request<AdminContentBatchView>(`/api/v1/admin/content/${props.definition.module}/batch`, {
    method: 'PATCH',
    body: {
      uids: selected.value.map(item => item.uid),
      expectedUpdatedAtByUid: Object.fromEntries(selected.value.map(item => [item.uid, item.updatedAt])),
      values: { [field]: value },
    },
  }),
  onSuccess: async result => {
    ElMessage.success(result.message)
    batchOpen.value = false
    selected.value = []
    await getAdminQueryClient().invalidateQueries({ queryKey: ['admin', 'list', props.definition.module] })
  },
  onError: async failure => {
    const info = adminErrorDetails(failure)
    selected.value = []
    if (info.status === 409 || info.code === 'ADMIN_CONTENT_CONFLICT' || info.code === 'ADMIN_CONFLICT') {
      batchOpen.value = false
      await getAdminQueryClient().invalidateQueries({ queryKey: ['admin', 'list', props.definition.module] })
      ElMessage.error('所选记录已发生变化，列表已刷新，请重新选择。')
      return
    }
    ElMessage.error(info.message)
  },
}, getAdminQueryClient())
</script>

<template>
  <section class="admin-content-list">
    <AdminListShell eyebrow="内容管理" :title="definition.title" :description="definition.description" :can-create="Boolean(data?.permissions.create && definition.canCreate)" :create-label="`新建${definition.singularTitle}`" @create="create">
      <AdminListToolbar
        v-model="searchDraft"
        :loading="isFetching"
        :selected-count="selected.length"
        :can-batch="Boolean(data?.permissions.edit && definition.batchFields.length)"
        :search-placeholder="`搜索${definition.title}`"
        @search="applySearch"
        @refresh="refetch()"
        @batch="batchOpen = true"
      />
      <AdminStatePanel v-if="details" tone="error" title="列表加载失败" :description="details.message" :request-id="details.requestId"><template #actions><ElButton type="primary" @click="refetch()">重新加载</ElButton></template></AdminStatePanel>
      <AdminDataTable
        v-else
        :rows="tableRows"
        :columns="tableColumns"
        :loading="isPending || isFetching"
        :selectable="Boolean(data?.permissions.edit && definition.batchFields.length)"
        :selection-limit="ADMIN_CONTENT_BATCH_LIMIT"
        :filter-values="filterDrafts"
        :action-labels="actionLabels"
        :preference-key="`content:${definition.module}`"
        empty-description="没有符合当前条件的记录"
        @selection-change="setSelection"
        @sort-change="onSort"
        @filter-change="onColumnFilter"
        @edit="editRow"
      >
        <template #cell="{ row, column }">
          <AdminListAvatar
            v-if="column.kind === 'image'"
            :media="rowMedia(row, column)"
            :name="mediaAlt(row, column)"
          />
          <AdminQuickField
            v-else-if="column.quickEdit && column.options?.length && data?.permissions.edit"
            :model-value="row[column.key] as AdminListPrimitive"
            :options="column.options"
            :kind="column.kind ?? 'text'"
            :loading="quickSaving === `${String(row.uid)}:${column.key}`"
            :aria-label="`快速修改${column.label}`"
            @change="value => quickUpdate(row, column, value)"
          />
          <ElButton v-else-if="column.primary" link type="primary" class="admin-unified-primary-cell" @click="editRow(row)"><span :class="{ 'admin-two-line-cell': column.twoLine }">{{ displayed(row, column) }}</span></ElButton>
          <ElTag v-else-if="['boolean', 'enum', 'visibility', 'status'].includes(column.kind ?? '')" :type="cellTone(row, column)" size="small" effect="plain">{{ displayed(row, column) }}</ElTag>
          <span v-else :class="{ 'admin-two-line-cell': column.twoLine }">{{ displayed(row, column) }}</span>
        </template>
        <template #actions="{ row }">
          <AdminRowActions>
            <ElButton size="small" plain type="primary" @click="editRow(row)"><Edit3 :size="14" />{{ primaryActionLabel }}</ElButton>
            <ElButton v-if="definition.module === 'messages'" size="small" plain :disabled="!rowEmail(row)" :title="rowEmail(row) ? '复制留言人邮箱' : '没有邮箱地址'" @click="copyEmail(row)"><Copy :size="14" />复制邮箱</ElButton>
            <ElButton v-else-if="canDelete" size="small" plain type="danger" :loading="deletingUid === String(row.uid)" @click="removeRow(row)"><Trash2 :size="14" />删除</ElButton>
          </AdminRowActions>
        </template>
      </AdminDataTable>
      <footer v-if="data && data.total > 0" class="admin-pagination">
        <span>共 {{ data.total }} 条；本页最多选择 {{ ADMIN_CONTENT_BATCH_LIMIT }} 条</span>
        <ElPagination
          background
          layout="sizes, prev, pager, next, jumper"
          :current-page="Number(apiQuery.page)"
          :page-size="Number(apiQuery.pageSize)"
          :page-sizes="[...ADMIN_CONTENT_PAGE_SIZES]"
          :total="data.total"
          @update:current-page="page => setQuery({ page })"
          @update:page-size="pageSize => setQuery({ pageSize, page: 1 })"
        />
      </footer>
    </AdminListShell>

    <AdminContentBatchDialog
      v-model="batchOpen"
      :definition="definition"
      :selected="selected"
      :submitting="batchMutation.isPending.value"
      @submit="payload => batchMutation.mutate(payload)"
    />
  </section>
</template>

<style scoped>
.admin-pagination { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-top: .85rem; color: var(--admin-muted); font-size: .75rem; }
@media (max-width:720px) { .admin-pagination { align-items: flex-start; flex-direction: column; overflow-x: auto; } }
</style>
