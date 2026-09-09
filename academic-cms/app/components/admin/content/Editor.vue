<script setup lang="ts">
import { useAdminEditorLifecycle } from '~/composables/useAdminEditorLifecycle'
import { useMutation, useQuery } from '@tanstack/vue-query'
import { Clock3, RotateCcw, Search, Trash2 } from '@lucide/vue'
import {
  ElAlert,
  ElButton,
  ElForm,
  ElMessage,
  ElMessageBox,
  ElSkeleton,
  ElSkeletonItem,
  ElTag,
} from 'element-plus'
import { adminErrorDetails, type AdminErrorDetails } from '~/admin/errors'
import { formatAdminDateTime } from '~/admin/formatters'
import { adminQueryKeys, getAdminQueryClient } from '~/admin/query-client'
import { changedWritableFieldValues, contentRecordPath, defaultFieldValue, writableFieldValues } from '~/admin/content-utils'
import { contentEditorFieldDescriptor } from '~/admin/editor-fields'
import { adminMediaFieldFallback } from '~/utils/media-fallback'
import { ADMIN_UID_PATTERN, suggestedAdminUid } from '~~/shared/admin/identity'
import type { AdminContentModuleDefinition, AdminContentRouteMode, AdminContentValue } from '~~/shared/admin/content-modules'
import type { PublicationGeneratedFields, PublicationMetadataFields } from '~~/shared/admin/publication-tools'
import { hasAdminPermission } from '~~/shared/admin/registry'
import type { AdminContentDeleteView, AdminContentDetailView, AdminContentMutationView } from '~~/shared/contracts/admin-content'
import { safeAdminReturnPath } from '~~/shared/admin/paths'
import AdminEditorShell from '../shared/AdminEditorShell.vue'
import AdminCheckedFormItem from '../shared/AdminCheckedFormItem.vue'
import AdminFieldRenderer from '../shared/AdminFieldRenderer.vue'
import AdminIdentitySection from '../shared/AdminIdentitySection.vue'
import AdminPublicationMetadataAssistant from '../complete/AdminPublicationMetadataAssistant.vue'
import AdminPublicationCitationGenerator from '../complete/AdminPublicationCitationGenerator.vue'

const props = defineProps<{ definition: AdminContentModuleDefinition; mode: Exclude<AdminContentRouteMode, 'list'>; uid: string | null }>()
const route = useRoute()
const router = useRouter()
const api = useAdminApi()
const auth = useAuthSession()
const form = reactive<Record<string, AdminContentValue>>(Object.create(null) as Record<string, AdminContentValue>)
const uidValue = ref(suggestedAdminUid(props.definition.module))
const fieldErrors = ref<Record<string, string>>({})
const baseline = ref('')
const baselineValues = shallowRef<Readonly<Record<string, AdminContentValue>>>(Object.freeze({}))
const recordUpdatedAt = ref<string | null>(null)
const savingAndReturn = ref(false)
const mutationFailure = shallowRef<AdminErrorDetails | null>(null)
interface PublicationAssistantExpose { lookupFrom: (preferred?: 'doi' | 'title' | 'auto') => Promise<void> }
interface PublicationAppliedChange { original: AdminContentValue; next: AdminContentValue; source: string }
const publicationAssistant = ref<PublicationAssistantExpose | null>(null)
const publicationApplied = reactive<Record<string, PublicationAppliedChange>>({})

const returnPath = computed(() => safeAdminReturnPath(typeof route.query.return === 'string' ? route.query.return : props.definition.path, props.definition.path))
const detailQuery = useQuery({
  queryKey: computed(() => adminQueryKeys.detail(props.definition.module, props.uid ?? '__new__')),
  queryFn: () => api.request<AdminContentDetailView>(`/api/v1/admin/content/${props.definition.module}/${encodeURIComponent(props.uid ?? '')}`),
  enabled: computed(() => props.mode === 'edit' && Boolean(props.uid)),
}, getAdminQueryClient())
const detail = detailQuery.data
const details = computed(() => detailQuery.error.value ? adminErrorDetails(detailQuery.error.value) : null)
const permissions = computed(() => {
  if (detail.value) return detail.value.permissions
  const user = auth.session.value.authenticated ? auth.session.value.user : null
  return {
    create: props.definition.canCreate && hasAdminPermission(user, props.definition.module, 'create'),
    edit: hasAdminPermission(user, props.definition.module, 'edit'),
    delete: props.definition.canDelete && hasAdminPermission(user, props.definition.module, 'delete'),
    export: hasAdminPermission(user, props.definition.module, 'export'),
  }
})
const canWrite = computed(() => props.mode === 'create' ? permissions.value.create : permissions.value.edit)
const title = computed(() => props.mode === 'create' ? `新建${props.definition.singularTitle}` : `${canWrite.value ? '编辑' : '查看'}${props.definition.singularTitle}`)
const groupedFields = computed(() => props.definition.groups.map(group => ({
  group,
  fields: props.definition.fields
    .filter(field => field.group === group.id)
    .map(field => ({ field, descriptor: contentEditorFieldDescriptor(props.definition.module, field) })),
})).filter(item => item.fields.length > 0))
const editorSections = computed(() => [
  { id: 'admin-form-identity-uid', label: '数据库 UID' },
  ...groupedFields.value.map(item => ({ id: `admin-form-${item.group.id}`, label: item.group.label })),
])
function formSnapshot(): string {
  return JSON.stringify({ uid: uidValue.value, values: props.definition.fields.map(field => [field.name, form[field.name] ?? null]) })
}
const currentSnapshot = computed(formSnapshot)
const dirty = computed(() => baseline.value !== '' && currentSnapshot.value !== baseline.value)
const editor = useAdminEditorLifecycle({ dirty: () => dirty.value })
const canSubmit = computed(() => (props.mode === 'create' || Boolean(recordUpdatedAt.value)) && !deleteMutation.isPending.value && canWrite.value && ADMIN_UID_PATTERN.test(uidValue.value) && !saveMutation.isPending.value && (props.mode === 'create' || dirty.value))
const publicationAppliedCount = computed(() => Object.keys(publicationApplied).length)

function mediaFallback(field: string): string {
  return adminMediaFieldFallback(props.definition.module, field, form)
}

function reset(values: Readonly<Record<string, AdminContentValue>> | null = null, updatedAt: string | null = null, uid: string | null = null): void {
  uidValue.value = uid ?? suggestedAdminUid(props.definition.module)
  for (const key of Object.keys(form)) Reflect.deleteProperty(form, key)
  for (const field of props.definition.fields) form[field.name] = values && Object.hasOwn(values, field.name) ? values[field.name]! : defaultFieldValue(field)
  fieldErrors.value = {}
  mutationFailure.value = null
  for (const key of Object.keys(publicationApplied)) Reflect.deleteProperty(publicationApplied, key)
  baselineValues.value = Object.freeze(writableFieldValues(props.definition, form))
  recordUpdatedAt.value = updatedAt
  baseline.value = formSnapshot()
}

function publicationFieldLabelMark(field: string): string {
  return props.definition.module === 'publications' && field === 'corresponding_authors' ? '*' : ''
}

function setPublicationAssistant(instance: unknown): void {
  publicationAssistant.value = instance as PublicationAssistantExpose | null
}

function isPublicationLookupField(field: string): field is 'doi' | 'title' {
  return props.definition.module === 'publications' && (field === 'doi' || field === 'title')
}

function displayPublicationOriginal(value: AdminContentValue): string {
  return value === null || value === '' ? '（原为空）' : String(value)
}

function applyPublicationFields(fields: PublicationMetadataFields | Partial<PublicationGeneratedFields>, source: string): void {
  if (props.definition.module !== 'publications' || !canWrite.value) return
  const allowed = new Set(props.definition.fields.filter(field => !field.readOnly).map(field => field.name))
  for (const [field, rawValue] of Object.entries(fields)) {
    if (!allowed.has(field) || rawValue === undefined || rawValue === null) continue
    const next: AdminContentValue = typeof rawValue === 'number' ? rawValue : String(rawValue)
    if (String(form[field] ?? '') === String(next)) continue
    if (!publicationApplied[field]) publicationApplied[field] = { original: form[field] ?? null, next, source }
    else publicationApplied[field] = { ...publicationApplied[field], next, source }
    form[field] = next
    Reflect.deleteProperty(fieldErrors.value, field)
  }
  ElMessage.success('候选信息已填入表单；保存前仍可逐项撤销。')
}

function undoPublicationField(field: string): void {
  const change = publicationApplied[field]
  if (!change) return
  form[field] = change.original
  Reflect.deleteProperty(publicationApplied, field)
}

function undoAllPublicationFields(): void {
  for (const field of Object.keys(publicationApplied)) undoPublicationField(field)
  ElMessage.success('已恢复联网查验或引文解析前的字段值。')
}
watch(detail, record => { if (record && !dirty.value && !editor.busy.value) reset(record.values, record.updatedAt, record.uid) }, { immediate: true })
watch(() => props.mode, mode => { if (mode === 'create') reset(null, null) }, { immediate: true })

async function refreshRelatedQueries(record?: AdminContentDetailView): Promise<void> {
  const client = getAdminQueryClient()
  if (record) client.setQueryData(adminQueryKeys.detail(props.definition.module, record.uid), record)
  await Promise.all([
    client.invalidateQueries({ queryKey: ['admin', 'list', props.definition.module] }),
    client.invalidateQueries({ queryKey: adminQueryKeys.dashboard }),
  ])
}

const saveMutation = useMutation({
  mutationFn: async () => {
    fieldErrors.value = {}
    mutationFailure.value = null
    if (props.mode === 'create') {
      const values = writableFieldValues(props.definition, form)
      return api.request<AdminContentMutationView>(`/api/v1/admin/content/${props.definition.module}`, { method: 'POST', body: { uid: uidValue.value, values } })
    }
    if (!detail.value || !props.uid || !recordUpdatedAt.value) throw new Error('Record is not loaded')
    const values = changedWritableFieldValues(props.definition, form, baselineValues.value)
    return api.request<AdminContentMutationView>(`/api/v1/admin/content/${props.definition.module}/${encodeURIComponent(props.uid)}`, {
      method: 'PATCH', body: { values, expectedUpdatedAt: recordUpdatedAt.value },
    })
  },
  onSuccess: async result => {
    ElMessage.success(result.message)
    reset(result.record.values, result.record.updatedAt, result.record.uid)
    editor.commit()
    await refreshRelatedQueries(result.record)
    if (savingAndReturn.value) {
      await router.replace(returnPath.value)
      return
    }
    if (props.mode === 'create') {
      await router.replace({ path: contentRecordPath(props.definition, result.record.uid), query: { return: returnPath.value } })
    }
  },
  onError: async failure => {
    const info = adminErrorDetails(failure)
    mutationFailure.value = info
    fieldErrors.value = { ...info.fieldErrors }
    ElMessage.error(info.code === 'ADMIN_CONTENT_CONFLICT' ? '记录已被其他管理员修改，请刷新后重新编辑。' : info.message)
    await focusFirstFieldError(info.fieldErrors)
  },
}, getAdminQueryClient())

const deleteMutation = useMutation({
  mutationFn: async () => {
    if (!detail.value || !props.uid || !recordUpdatedAt.value) throw new Error('Record is not loaded')
    return api.request<AdminContentDeleteView>(`/api/v1/admin/content/${props.definition.module}/${encodeURIComponent(props.uid)}`, {
      method: 'DELETE', body: { expectedUpdatedAt: recordUpdatedAt.value },
    })
  },
  onSuccess: async result => { ElMessage.success(result.message); baseline.value = formSnapshot(); editor.commit(); await refreshRelatedQueries(); await router.replace(returnPath.value) },
  onError: failure => {
    const info = adminErrorDetails(failure)
    mutationFailure.value = info
    ElMessage.error(info.message)
  },
}, getAdminQueryClient())

async function save(andReturn: boolean): Promise<void> {
  if (!canSubmit.value) return
  await editor.run(async () => {
    savingAndReturn.value = andReturn
    try { await saveMutation.mutateAsync() } catch { /* onError retains the form and reports details. */ }
  })
}
async function focusFirstFieldError(errors: Readonly<Record<string, string>>): Promise<void> {
  const field = Object.keys(errors).find(key => key !== '_form')
  if (!field) return
  await nextTick()
  const container = document.querySelector<HTMLElement>(`[data-admin-field="${field}"]`)
  container?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  container?.querySelector<HTMLElement>('input, textarea, button, [tabindex]')?.focus({ preventScroll: true })
}
async function reloadLatest(): Promise<void> { await editor.run(() => reloadLatestImpl()) }
async function reloadLatestImpl(): Promise<void> {
  if (!await editor.confirmDiscard('加载最新版本将放弃当前未保存修改，确定继续吗？')) return
  const result = await detailQuery.refetch()
  if (result.data) {
    reset(result.data.values, result.data.updatedAt, result.data.uid)
    ElMessage.success('已加载最新记录。')
  }
}
async function remove(): Promise<void> { await editor.run(() => removeImpl()) }
async function removeImpl(): Promise<void> {
  if (!permissions.value.delete || !recordUpdatedAt.value) return
  try {
    await ElMessageBox.confirm(`删除后将无法在后台恢复这条${props.definition.singularTitle}记录。确定继续吗？`, '确认删除', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger',
    })
  }
  catch { return }
  try { await deleteMutation.mutateAsync() } catch { /* onError keeps the record available. */ }
}
</script>

<template>
  <AdminEditorShell
    eyebrow="内容编辑"
    :title="title"
    :description="definition.description"
    :sections="editorSections"
    :can-write="canWrite"
    :dirty="dirty"
    :saving="saveMutation.isPending.value"
    :busy="editor.busy.value"
    :save-disabled="!canSubmit"
    @back="router.push(returnPath)"
    @save="save(false)"
    @save-and-return="save(true)"
  >
    <div v-if="props.mode === 'edit' && detailQuery.isPending.value" class="admin-editor-skeleton">
      <ElSkeleton animated><template #template><ElSkeletonItem v-for="index in 12" :key="index" variant="text" style="height:2.4rem;margin-bottom:1rem" /></template></ElSkeleton>
    </div>
    <AdminStatePanel v-else-if="details" tone="error" title="记录加载失败" :description="details.message" :request-id="details.requestId"><template #actions><ElButton type="primary" @click="detailQuery.refetch()">重新加载</ElButton></template></AdminStatePanel>
    <AdminStatePanel v-else-if="mode === 'create' && !permissions.create" tone="error" title="无权创建记录" description="当前角色没有该模块的创建权限。" />
    <template v-else>
      <ElAlert v-if="!canWrite" class="admin-editor-readonly" type="info" :closable="false" show-icon title="当前为只读模式" description="当前角色可以查看此记录，但没有编辑权限。" />
      <div v-if="mutationFailure" class="admin-editor-mutation-error" role="alert">
        <ElAlert type="error" :closable="false" show-icon title="保存操作未完成" :description="mutationFailure.message" />
        <ElButton v-if="mutationFailure.code === 'ADMIN_CONTENT_CONFLICT' || mutationFailure.code === 'ADMIN_CONFLICT'" type="primary" plain @click="reloadLatest">加载最新版本</ElButton>
      </div>
      <ElAlert v-if="fieldErrors._form" class="admin-editor-errors" type="error" :closable="false" show-icon title="表单无法保存" :description="fieldErrors._form" />

      <ElForm class="admin-content-form" label-position="top" @submit.prevent="save(false)">
        <AdminIdentitySection
          v-model="uidValue"
          :resource="definition.module"
          :existing="mode === 'edit'"
          :disabled="!canWrite"
          :error="fieldErrors.uid ?? ''"
          @update:model-value="fieldErrors.uid = ''"
        />
        <section v-for="item in groupedFields" :id="`admin-form-${item.group.id}`" :key="item.group.id" class="admin-form-section">
          <header><div><small>编辑分组</small><h2>{{ item.group.label }}</h2><p v-if="item.group.description">{{ item.group.description }}</p></div></header>
          <AdminPublicationCitationGenerator
            v-if="definition.module === 'publications' && item.group.id === 'citation'"
            :record="form"
            :record-uid="uidValue"
            :disabled="!canWrite"
            @apply="applyPublicationFields"
          />
          <div class="admin-form-grid">
            <AdminCheckedFormItem
              v-for="entry in item.fields"
              :key="entry.descriptor.key"
              :label="entry.descriptor.label"
              :label-mark="publicationFieldLabelMark(entry.descriptor.key)"
              :required="entry.descriptor.required"
              :error="fieldErrors[entry.descriptor.key] ?? ''"
              :data-admin-field="entry.descriptor.key"
              :class="{ 'is-wide': entry.descriptor.wide }"
              :resource="definition.module"
              :field="entry.descriptor.key"
              :value="form[entry.descriptor.key] ?? null"
              :exclude-uid="mode === 'edit' ? uidValue : null"
            >
              <AdminPublicationMetadataAssistant
                v-if="definition.module === 'publications' && entry.descriptor.key === 'source_citation'"
                :ref="setPublicationAssistant"
                :source-citation="typeof form.source_citation === 'string' ? form.source_citation : ''"
                :record="form"
                :disabled="!canWrite"
                :applied-count="publicationAppliedCount"
                @update:source-citation="value => { form.source_citation = value }"
                @apply="applyPublicationFields"
                @undo-all="undoAllPublicationFields"
              />
              <AdminFieldRenderer
                v-else
                :model-value="form[entry.descriptor.key] ?? null"
                :descriptor="entry.descriptor"
                :disabled="entry.descriptor.readOnly || !canWrite"
                :media-fallback="mediaFallback(entry.descriptor.key)"
                @update:model-value="value => { form[entry.descriptor.key] = value }"
              />
              <div v-if="isPublicationLookupField(entry.descriptor.key)" class="publication-field-actions">
                <ElButton text type="primary" size="small" :disabled="!canWrite || !String(form[entry.descriptor.key] ?? '').trim()" @click.prevent="publicationAssistant?.lookupFrom(entry.descriptor.key)">
                  <Search :size="14" />联网查验补全
                </ElButton>
              </div>
              <p class="admin-field-help">{{ entry.descriptor.help }}</p>
              <div v-if="publicationApplied[entry.descriptor.key]" class="publication-original-value" aria-live="polite">
                <span><strong>{{ publicationApplied[entry.descriptor.key]!.source }}</strong>填充前：{{ displayPublicationOriginal(publicationApplied[entry.descriptor.key]!.original) }}</span>
                <ElButton text type="warning" size="small" @click.prevent="undoPublicationField(entry.descriptor.key)"><RotateCcw :size="13" />撤销此项</ElButton>
              </div>
            </AdminCheckedFormItem>
          </div>
        </section>
      </ElForm>
    </template>
    <template #record-meta>
      <div class="admin-record-meta">
        <Clock3 :size="16" />
        <span v-if="detail">创建于 {{ formatAdminDateTime(detail.createdAt) }}；更新于 {{ formatAdminDateTime(detail.updatedAt) }}</span>
        <span v-else>UID 已生成建议值，首次保存前可以自定义。</span>
        <ElTag v-if="dirty" type="warning" effect="light">有未保存修改</ElTag>
      </div>
    </template>
    <template #danger-actions>
      <ElButton v-if="mode === 'edit' && detail?.permissions.delete && definition.canDelete" type="danger" plain :loading="deleteMutation.isPending.value" @click="remove"><Trash2 :size="16" />删除</ElButton>
    </template>
  </AdminEditorShell>
</template>

<style scoped>
.publication-field-actions{display:flex;width:100%;justify-content:flex-end;margin-top:.15rem}.publication-original-value{display:flex;width:100%;align-items:center;justify-content:space-between;gap:.6rem;margin-top:.35rem;padding:.42rem .55rem;border-radius:.45rem;color:var(--el-color-warning-dark-2);background:var(--el-color-warning-light-9);font-size:.73rem;line-height:1.5}.publication-original-value span{min-width:0;overflow-wrap:anywhere}.publication-original-value strong{margin-right:.35rem}@media(max-width:640px){.publication-original-value{align-items:flex-start;flex-direction:column}}
</style>
