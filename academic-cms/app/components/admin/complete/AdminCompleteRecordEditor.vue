<script setup lang="ts">
import { useAdminEditorLifecycle } from '~/composables/useAdminEditorLifecycle'
import { Clock3, Trash2 } from '@lucide/vue'
import {
  ElAlert,
  ElButton,
  ElForm,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElSkeleton,
  ElSkeletonItem,
  ElTag,
} from 'element-plus'
import { ElOption, ElSelect } from '~/admin/element-plus-ts6'
import { adminErrorDetails } from '~/admin/errors'
import { formatAdminDateTime } from '~/admin/formatters'
import type { CompleteResourceSchema } from '~/admin/complete-resource'
import { completeEditorFieldDescriptor } from '~/admin/editor-fields'
import { adminMediaFieldFallback } from '~/utils/media-fallback'
import { ADMIN_UID_PATTERN, isAdminIdentityResource, suggestedAdminUid, type AdminIdentityResource } from '~~/shared/admin/identity'
import AdminEditorShell from '../shared/AdminEditorShell.vue'
import AdminCheckedFormItem from '../shared/AdminCheckedFormItem.vue'
import AdminFieldRenderer from '../shared/AdminFieldRenderer.vue'
import AdminIdentitySection from '../shared/AdminIdentitySection.vue'
import AdminNavigationFilterTool from '../shared/AdminNavigationFilterTool.vue'

const props = defineProps<{
  resource: CompleteResourceSchema
  uid?: string | null
  readOnly?: boolean
  canDelete?: boolean
  canEditNews?: boolean
}>()
const emit = defineEmits<{
  back: []
  saved: [uid: string, andReturn: boolean]
  deleted: []
  dirty: [value: boolean]
  'open-rich-text': [uid: string]
}>()
const { request } = useCompleteAdminApi()
type SecretAction = 'keep' | 'replace' | 'clear'
interface SecretOperation { action: SecretAction; value: string }

const loading = ref(true)
const loaded = ref(false)
const saving = ref(false)
const deleting = ref(false)
const error = ref('')
const model = reactive<Record<string, any>>({})
const original = ref<Record<string, any>>({})
const secretOperations = reactive<Record<string, SecretOperation>>({})
const fieldErrors = reactive<Record<string, string>>({})
const baseline = ref('')
const identityResource = computed<AdminIdentityResource>(() => {
  if (!isAdminIdentityResource(props.resource.key)) throw new Error(`Unsupported identity resource: ${props.resource.key}`)
  return props.resource.key
})
const uidValue = ref(suggestedAdminUid(identityResource.value))

const isEdit = computed(() => Boolean(props.uid))
const completeAdminReadOnly = computed(() => Boolean(props.readOnly || props.resource.readOnly))
const title = computed(() => `${completeAdminReadOnly.value ? '查看' : (isEdit.value ? '编辑' : '新建')}${props.resource.label}`)

function mediaFallback(field: string): string {
  return adminMediaFieldFallback(props.resource.key, field, model)
}

function applyNavigationFilter(path: string): void {
  if (completeAdminReadOnly.value) return
  Object.assign(model, { kind: 'button', url_name: null, path })
  for (const field of ['kind', 'url_name', 'path']) delete fieldErrors[field]
}

function hasValue(value: unknown): boolean { return value !== null && value !== undefined && String(value).trim() !== '' }
function conditionMatches(condition: any): boolean {
  if (!condition) return true
  const value = model[condition.field]
  if (Array.isArray(condition.in)) return condition.in.some((item: unknown) => String(item) === String(value))
  if (Array.isArray(condition.notIn)) return !condition.notIn.some((item: unknown) => String(item) === String(value))
  if (Object.hasOwn(condition, 'equals')) return String(value) === String(condition.equals)
  return true
}
function fieldVisible(field: any): boolean { return conditionMatches(field.visibleWhen) }
function fieldRequired(field: any): boolean { return Boolean(field.required || (field.requiredWhen && conditionMatches(field.requiredWhen))) }
const groups = computed(() => {
  const map = new Map<string, any[]>()
  for (const field of props.resource.fields) {
    if (!fieldVisible(field)) continue
    const key = field.group || '基本信息'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push({ field, descriptor: completeEditorFieldDescriptor(props.resource.key, field) })
  }
  return [...map.entries()].map(([label, fields], index) => ({ id: `complete-record-section-${index}`, label, fields }))
})
const sections = computed(() => [
  { id: 'complete-record-identity-uid', label: '数据库 UID' },
  ...groups.value.map(({ id, label }) => ({ id, label })),
])

function snapshot(): string {
  return JSON.stringify({
    uid: uidValue.value,
    values: props.resource.fields.map(field => [field.key, model[field.key] ?? null]),
    secrets: Object.entries(secretOperations).map(([key, operation]) => [key, operation.action, operation.value ?? '']),
  })
}
const dirty = computed(() => baseline.value !== '' && snapshot() !== baseline.value)
const editor = useAdminEditorLifecycle({ dirty: () => dirty.value })
const saveDisabled = computed(() => loading.value || !loaded.value || saving.value || deleting.value || !ADMIN_UID_PATTERN.test(uidValue.value) || (isEdit.value && !dirty.value))

function clearState(): void {
  for (const key of Object.keys(model)) Reflect.deleteProperty(model, key)
  initializeSecretOperations()
  for (const key of Object.keys(fieldErrors)) Reflect.deleteProperty(fieldErrors, key)
  error.value = ''
  original.value = {}
  uidValue.value = suggestedAdminUid(identityResource.value)
  baseline.value = ''
  loaded.value = false
}
function initializeSecretOperations(): void {
  for (const key of Object.keys(secretOperations)) Reflect.deleteProperty(secretOperations, key)
  for (const field of props.resource.fields) {
    if (field.secret) secretOperations[field.key] = { action: 'keep', value: '' }
  }
}
function secretOperation(fieldKey: string): SecretOperation {
  return secretOperations[fieldKey] ?? (secretOperations[fieldKey] = { action: 'keep', value: '' })
}
function updateSecretAction(fieldKey: string, value: unknown): void {
  if (!['keep', 'replace', 'clear'].includes(String(value))) return
  const operation = secretOperation(fieldKey)
  operation.action = String(value) as SecretAction
  if (operation.action !== 'replace') operation.value = ''
  Reflect.deleteProperty(fieldErrors, fieldKey)
}
function updateSecretValue(fieldKey: string, value: unknown): void {
  secretOperation(fieldKey).value = String(value ?? '')
  Reflect.deleteProperty(fieldErrors, fieldKey)
}
function displayRecord(record: Record<string, any>): Record<string, any> {
  const result = { ...record }
  for (const field of props.resource.fields) {
    if (field.format !== 'json' || typeof result[field.key] !== 'string') continue
    try { result[field.key] = JSON.stringify(JSON.parse(result[field.key]), null, 2) }
    catch { /* Preserve malformed stored JSON so it can be repaired. */ }
  }
  return result
}
function markClean(record: Record<string, any>): void {
  original.value = { ...record }
  uidValue.value = String(record.uid ?? props.uid ?? suggestedAdminUid(identityResource.value))
  for (const key of Object.keys(model)) Reflect.deleteProperty(model, key)
  Object.assign(model, record)
  initializeSecretOperations()
  baseline.value = snapshot()
  loaded.value = true
}
async function load(): Promise<void> {
  const current = editor.startLoad()
  clearState()
  loading.value = true
  try {
    if (!props.uid) {
      const initial: Record<string, any> = {}
      for (const field of props.resource.fields) {
        if (Object.hasOwn(field, 'default')) initial[field.key] = field.default
        else if (field.type === 'boolean') initial[field.key] = 0
      }
      markClean(initial)
      return
    }
    const value = await request<{ record: Record<string, any> }>(`/api/v1/admin/complete/resource/${props.resource.key}/${encodeURIComponent(props.uid)}`)
    if (current()) markClean(displayRecord(value.record))
  } catch (failure) {
    if (current()) error.value = adminErrorDetails(failure).message || '记录读取失败'
  } finally { if (current()) loading.value = false }
}

function payload(): Record<string, any> {
  const values: Record<string, any> = {}
  if (!isEdit.value) values.uid = uidValue.value
  for (const field of props.resource.fields) {
    if (field.readonly || field.secret) continue
    const value = model[field.key]
    if (!isEdit.value || value !== original.value[field.key]) values[field.key] = value
  }
  if (isEdit.value) values.expectedUpdatedAt = original.value.updated_at
  const operations: Record<string, any> = {}
  for (const [field, operation] of Object.entries(secretOperations)) {
    if (operation.action !== 'keep') operations[field] = operation
  }
  if (Object.keys(operations).length) values.secretOperations = operations
  return values
}
function validateClient(): boolean {
  for (const key of Object.keys(fieldErrors)) Reflect.deleteProperty(fieldErrors, key)
  if (!ADMIN_UID_PATTERN.test(uidValue.value)) fieldErrors.uid = 'UID 格式无效，请使用字母、数字、冒号、点、下划线或短横线。'
  for (const field of props.resource.fields) {
    if (field.readonly || field.secret || !fieldVisible(field)) continue
    const value = model[field.key]
    if (fieldRequired(field) && !hasValue(value)) fieldErrors[field.key] = '此字段为必填项'
    if (field.format === 'json' && hasValue(value)) {
      try {
        const parsed = JSON.parse(String(value))
        if (field.jsonType === 'array' && !Array.isArray(parsed)) fieldErrors[field.key] = '请输入 JSON 数组'
        if (field.jsonType === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) fieldErrors[field.key] = '请输入 JSON 对象'
      } catch { fieldErrors[field.key] = 'JSON 格式无效' }
    }
  }
  for (const [key, operation] of Object.entries(secretOperations)) {
    if (operation.action === 'replace' && !String(operation.value ?? '').trim()) fieldErrors[key] = '替换密钥时必须输入新值'
  }
  for (const rule of props.resource.validation ?? []) {
    if (!conditionMatches(rule.when)) continue
    const populated = (rule.fields ?? []).filter((key: string) => hasValue(model[key]))
    if (rule.type === 'anyRequired' && populated.length === 0) fieldErrors[rule.fields[0]] = rule.message || '请至少填写一项'
    if (rule.type === 'atMostOne' && populated.length > 1) fieldErrors[populated[1]] = rule.message || '这些字段不能同时填写'
    if (rule.type === 'allowedValues' && !rule.values?.some((value: unknown) => String(value) === String(model[rule.field]))) fieldErrors[rule.field] = rule.message || '当前值不可用'
  }
  const first = Object.keys(fieldErrors)[0]
  if (first) nextTick(() => document.querySelector<HTMLElement>(`[data-complete-field="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  return !first
}
function applyServerErrors(failure: any): void {
  const details = adminErrorDetails(failure)
  error.value = details.message || '保存失败'
  for (const [key, message] of Object.entries(details.fieldErrors)) fieldErrors[key] = String(message)
  const raw = failure?.data?.error?.fieldErrors
  if (raw && typeof raw === 'object') {
    for (const [key, messages] of Object.entries(raw)) fieldErrors[key] = Array.isArray(messages) ? String(messages[0] ?? error.value) : String(messages)
  }
}
async function save(andReturn: boolean, openRichText = false): Promise<void> { await editor.run(() => saveImpl(andReturn, openRichText)) }
async function saveImpl(andReturn: boolean, openRichText = false): Promise<void> {
  if (completeAdminReadOnly.value || saveDisabled.value || !validateClient()) return
  saving.value = true
  error.value = ''
  try {
    const endpoint = `/api/v1/admin/complete/resource/${props.resource.key}${props.uid ? `/${encodeURIComponent(props.uid)}` : ''}`
    const body = payload()
    if (openRichText && !isEdit.value) body.visibility = 'hidden'
    const value = await request<{ record: Record<string, any> }>(endpoint, { method: isEdit.value ? 'PATCH' : 'POST', body })
    const record = displayRecord(value.record)
    markClean(record)
    editor.commit()
    ElMessage.success('记录已保存')
    if (openRichText) {
      emit('open-rich-text', String(record.uid))
      return
    }
    emit('saved', String(record.uid ?? props.uid ?? ''), andReturn)
  } catch (failure: any) { applyServerErrors(failure) }
  finally { saving.value = false }
}
async function openNewsRichText(): Promise<void> {
  if (props.resource.key !== 'news' || !props.canEditNews || completeAdminReadOnly.value || saving.value || deleting.value || !loaded.value) return
  if (isEdit.value && !dirty.value) emit('open-rich-text', uidValue.value)
  else await save(false, true)
}
function updateNewsFormat(value: unknown): void {
  if (value === 'html' && original.value.content_format !== 'html') void openNewsRichText()
  else model.content_format = value
}
async function reloadLatest(): Promise<void> {
  await editor.run(async () => {
    if (!props.uid || !await editor.confirmDiscard('加载最新版本将放弃当前未保存修改，确定继续吗？')) return
    try {
      const value = await request<{ record: Record<string, unknown> }>(`/api/v1/admin/complete/resource/${props.resource.key}/${encodeURIComponent(props.uid)}`)
      markClean(displayRecord(value.record))
      error.value = ''
      for (const key of Object.keys(fieldErrors)) Reflect.deleteProperty(fieldErrors, key)
    } catch (failure) { error.value = adminErrorDetails(failure).message || '最新记录读取失败，当前输入已保留' }
  })
}
async function requestBack(): Promise<void> { if (!editor.busy.value) emit('back') }
async function remove(): Promise<void> { await editor.run(() => removeImpl()) }
async function removeImpl(): Promise<void> {
  if (!props.uid || !props.canDelete || !original.value.updated_at) return
  try {
    await ElMessageBox.confirm(`确定删除这条${props.resource.label}记录吗？此操作不能撤销。`, '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    deleting.value = true
    await request(`/api/v1/admin/complete/resource/${props.resource.key}/${encodeURIComponent(props.uid)}?updatedAt=${encodeURIComponent(String(original.value.updated_at))}`, { method: 'DELETE' })
    baseline.value = snapshot()
    editor.commit()
    ElMessage.success('记录已删除')
    emit('deleted')
  } catch (failure) {
    if (failure !== 'cancel' && failure !== 'close') ElMessage.error(adminErrorDetails(failure).message || '删除失败')
  } finally { deleting.value = false }
}

initializeSecretOperations()
onMounted(() => { void load() })
watch(() => [props.resource.key, props.uid] as const, () => void load(), { flush: 'sync' })
watch(dirty, value => emit('dirty', value), { immediate: true })
watch(model, () => {
  for (const field of props.resource.fields) {
    if (field.clearWhenHidden && !fieldVisible(field) && hasValue(model[field.key])) {
      model[field.key] = null
      Reflect.deleteProperty(fieldErrors, field.key)
    }
  }
}, { deep: true })
</script>

<template>
  <AdminEditorShell
    eyebrow="系统配置"
    :title="title"
    :description="resource.description || `维护${resource.label}记录的完整字段。`"
    :sections="sections"
    :can-write="!completeAdminReadOnly"
    :dirty="dirty"
    :saving="saving"
    :busy="editor.busy.value || loading"
    :save-disabled="saveDisabled"
    @back="requestBack"
    @save="save(false)"
    @save-and-return="save(true)"
  >
    <template #header-actions><ElButton v-if="isEdit && loaded" plain @click="reloadLatest">加载最新版本</ElButton></template>
    <div v-if="loading" class="admin-editor-skeleton">
      <ElSkeleton animated><template #template><ElSkeletonItem v-for="index in 10" :key="index" variant="text" style="height:2.4rem;margin-bottom:1rem" /></template></ElSkeleton>
    </div>
    <AdminStatePanel v-else-if="!loaded" tone="error" title="记录加载失败" :description="error || '暂时无法读取这条记录。'">
      <template #actions><ElButton type="primary" @click="load">重新加载</ElButton></template>
    </AdminStatePanel>
    <template v-else>
      <ElAlert v-if="error" type="error" :title="error" show-icon :closable="false" class="admin-form-alert" />
      <ElAlert v-if="completeAdminReadOnly" type="info" title="当前为只读模式" description="当前角色可以查看这条记录，但没有编辑权限。" show-icon :closable="false" class="admin-form-alert" />
      <ElForm label-position="top" class="admin-complete-editor-form" @submit.prevent="save(false)">
        <AdminIdentitySection
          :model-value="uidValue"
          :resource="identityResource"
          :existing="isEdit"
          :disabled="completeAdminReadOnly"
          :error="fieldErrors.uid ?? ''"
          section-id="complete-record-identity-uid"
          @update:model-value="value => { uidValue = value; fieldErrors.uid = '' }"
        />
        <section v-for="group in groups" :id="group.id" :key="group.id" class="admin-form-section">
          <header><div><small>编辑分组</small><h2>{{ group.label }}</h2></div></header>
          <div class="admin-form-grid">
            <AdminCheckedFormItem v-for="entry in group.fields" :key="entry.descriptor.key" :label="entry.descriptor.label" :required="fieldRequired(entry.field)" :error="fieldErrors[entry.descriptor.key] ?? ''" :data-complete-field="entry.descriptor.key" :class="{ 'is-wide': entry.descriptor.wide }" :resource="identityResource" :field="entry.descriptor.key" :value="model[entry.descriptor.key]" :exclude-uid="isEdit ? uidValue : null">
              <template v-if="entry.field.secret">
                <ElSelect :model-value="secretOperation(entry.descriptor.key).action" :disabled="completeAdminReadOnly" class="secret-operation" :placeholder="entry.descriptor.placeholder" @update:model-value="updateSecretAction(entry.descriptor.key, $event)"><ElOption label="保留现有值" value="keep" /><ElOption label="替换" value="replace" /><ElOption label="清除" value="clear" /></ElSelect>
                <ElInput v-if="secretOperation(entry.descriptor.key).action === 'replace'" :model-value="secretOperation(entry.descriptor.key).value" :readonly="completeAdminReadOnly" type="password" show-password autocomplete="new-password" :placeholder="entry.descriptor.placeholder" @update:model-value="updateSecretValue(entry.descriptor.key, $event)" />
                <small v-if="model[`${entry.descriptor.key}_configured`]">当前已配置</small>
              </template>
              <div v-else-if="resource.key === 'news' && entry.descriptor.key === 'content_format'" class="news-format-actions">
                <ElSelect :model-value="model.content_format" :disabled="completeAdminReadOnly || saving" aria-label="新闻正文格式" @update:model-value="updateNewsFormat">
                  <ElOption label="纯文本" value="plain" /><ElOption label="Markdown" value="markdown" /><ElOption label="安全富文本" value="html" :disabled="!canEditNews" />
                </ElSelect>
                <ElButton type="primary" plain :loading="saving" :disabled="completeAdminReadOnly || !canEditNews || deleting" @click="openNewsRichText">{{ !isEdit ? '保存草稿并打开富文本' : dirty ? '保存并打开富文本' : '打开富文本设计器' }}</ElButton>
              </div>
              <AdminFieldRenderer
                v-else
                v-model="model[entry.descriptor.key]"
                :descriptor="entry.descriptor"
                :disabled="completeAdminReadOnly || entry.descriptor.readOnly"
                :managed-value="original[entry.descriptor.key]"
                :media-fallback="mediaFallback(entry.descriptor.key)"
              />
              <AdminNavigationFilterTool
                v-if="resource.key === 'navigation' && entry.descriptor.key === 'path' && ['route', 'button'].includes(model.kind) && model.location !== 'admin-sidebar'"
                :path="model.path" :preset="model.url_name" :fragment="model.fragment" :disabled="completeAdminReadOnly"
                @apply="applyNavigationFilter"
              />
              <small class="admin-field-help">{{ entry.descriptor.help }}</small>
            </AdminCheckedFormItem>
          </div>
        </section>
      </ElForm>
    </template>
    <template #record-meta>
      <Clock3 :size="16" />
      <span v-if="isEdit">创建于 {{ formatAdminDateTime(original.created_at) }}；更新于 {{ formatAdminDateTime(original.updated_at) }}</span>
      <span v-else>UID 已生成建议值，首次保存前可以自定义。</span>
      <ElTag v-if="dirty" type="warning" effect="light">有未保存修改</ElTag>
    </template>
    <template #danger-actions><ElButton v-if="isEdit && canDelete" type="danger" plain :loading="deleting" @click="remove"><Trash2 :size="16" />删除</ElButton></template>
  </AdminEditorShell>
</template>

<style scoped>
.admin-form-alert{margin-bottom:1rem}.admin-complete-editor-form{display:grid;gap:1rem}.secret-operation{width:10rem}.admin-form-grid .is-wide :deep(.el-form-item__content){display:grid;gap:.6rem}
.news-format-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;width:100%}.news-format-actions .el-select{flex:1;min-width:10rem}
</style>
