<script setup lang="ts">
import { useAdminEditorLifecycle } from '~/composables/useAdminEditorLifecycle'
import { Clock3, Trash2 } from '@lucide/vue'
import { ElAlert, ElButton, ElDescriptions, ElDescriptionsItem, ElMessage, ElMessageBox, ElSkeleton, ElTag } from 'element-plus'
import { adminErrorDetails } from '~/admin/errors'
import { formatAdminDateTime } from '~/admin/formatters'
import { hasAdminPermission } from '~~/shared/admin/registry'
import { newsEditorReturnPath, newsListReturnPath } from '~/admin/news-rich-text'
import AdminCompleteRichTextEditor from './AdminCompleteRichTextEditor.client.vue'
import AdminEditorShell from '../shared/AdminEditorShell.vue'

interface NewsRecord extends Record<string, unknown> {
  uid?: string
  title?: string
  slug?: string
  category?: string
  content?: string
  content_format?: string
  visibility?: string
  published_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

const props = defineProps<{ uid: string }>()
const emit = defineEmits<{ dirty: [value: boolean]; saved: [record: NewsRecord] }>()
const { request } = useCompleteAdminApi()
const route = useRoute()
const auth = useAuthSession()
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const record = ref<NewsRecord | null>(null)
const documentValue = ref<unknown>(null)
const html = ref('')
const draftHtml = ref('')
const baselineDocument = ref<string | null>(null)
const editorBusy = ref(false)
const returnPath = computed(() => newsEditorReturnPath(route.query.returnTo))
const backLabel = computed(() => new URL(returnPath.value, 'https://cms.invalid').searchParams.has('edit') ? '返回新闻信息' : '返回列表')
const error = ref<{ message: string; requestId: string | null } | null>(null)

const currentUser = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)
const canWrite = computed(() => hasAdminPermission(currentUser.value, 'news', 'edit'))
const canDelete = computed(() => hasAdminPermission(currentUser.value, 'news', 'delete'))
const dirty = computed(() => !loading.value && Boolean(record.value) && baselineDocument.value !== null && (record.value?.content_format !== 'html' || JSON.stringify(documentValue.value) !== baselineDocument.value))
const editor = useAdminEditorLifecycle({ dirty: () => dirty.value, busy: () => editorBusy.value })
const saveDisabled = computed(() => loading.value || saving.value || deleting.value || editorBusy.value || !documentValue.value || !dirty.value || !canWrite.value)
const publicationState = computed(() => {
  if (record.value?.visibility !== 'public') return '草稿 / 非公开'
  if (!record.value?.published_at) return '待排期'
  return Date.parse(String(record.value.published_at)) > Date.now() ? '定时发布' : '已发布'
})
const sections = Object.freeze([
  { id: 'news-rich-overview', label: '动态信息' },
  { id: 'news-rich-content', label: '富文本正文' },
])

async function load(): Promise<void> {
  const current = editor.startLoad()
  loading.value = true
  record.value = null
  documentValue.value = null
  baselineDocument.value = null
  error.value = null
  try {
    const value = await request<{ record: NewsRecord }>(`/api/v1/admin/complete/resource/news/${encodeURIComponent(props.uid)}`)
    if (!current()) return
    record.value = value.record
    html.value = String(value.record.content || '')
    draftHtml.value = html.value
  } catch (failure) {
    if (!current()) return
    const details = adminErrorDetails(failure)
    error.value = { message: details.message || '新闻读取失败', requestId: details.requestId }
  } finally {
    if (current()) loading.value = false
  }
}

async function save(andReturn: boolean): Promise<void> { await editor.run(() => saveImpl(andReturn)) }
async function saveImpl(andReturn: boolean): Promise<void> {
  if (saveDisabled.value || !record.value) return
  saving.value = true
  error.value = null
  try {
    const value = await request<{ record: NewsRecord }>(`/api/v1/admin/complete/news/${encodeURIComponent(props.uid)}/rich-text`, {
      method: 'PATCH',
      body: { document: documentValue.value, expectedUpdatedAt: record.value.updated_at },
    })
    record.value = value.record
    html.value = String(value.record.content || '')
    draftHtml.value = html.value
    baselineDocument.value = JSON.stringify(documentValue.value)
    editor.commit()
    emit('saved', value.record)
    ElMessage.success('富文本正文已保存')
    if (andReturn) await navigateTo(returnPath.value)
  } catch (failure) {
    const details = adminErrorDetails(failure)
    error.value = { message: details.message || '正文保存失败', requestId: details.requestId }
  } finally {
    saving.value = false
  }
}

async function reloadLatest(): Promise<void> {
  await editor.run(async () => {
    if (!await editor.confirmDiscard('加载最新版本将放弃当前富文本修改，确定继续吗？')) return
    const value = await request<{ record: NewsRecord }>(`/api/v1/admin/complete/resource/news/${encodeURIComponent(props.uid)}`).catch(failure => {
      const details = adminErrorDetails(failure)
      error.value = { message: details.message || '最新新闻读取失败，当前输入已保留', requestId: details.requestId }
      return null
    })
    if (!value) return
    loading.value = true
    await nextTick()
    record.value = value.record
    html.value = String(value.record.content || '')
    draftHtml.value = html.value
    documentValue.value = null
    baselineDocument.value = null
    error.value = null
    loading.value = false
  })
}
async function requestBack(): Promise<void> { if (!editor.busy.value) await navigateTo(returnPath.value) }

async function remove(): Promise<void> { await editor.run(() => removeImpl()) }
async function removeImpl(): Promise<void> {
  if (!record.value || !canDelete.value || deleting.value || saving.value || editorBusy.value) return
  try {
    await ElMessageBox.confirm(`确定删除“${String(record.value.title || '未命名新闻')}”吗？此操作不能撤销。`, '删除新闻', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    deleting.value = true
    await request(`/api/v1/admin/complete/resource/news/${encodeURIComponent(props.uid)}?updatedAt=${encodeURIComponent(String(record.value.updated_at || ''))}`, { method: 'DELETE' })
    record.value = null
    editor.commit()
    ElMessage.success('新闻已删除')
    await navigateTo(newsListReturnPath(returnPath.value))
  } catch (failure) {
    if (failure === 'close' || failure === 'cancel' || (failure && typeof failure === 'object' && 'message' in failure && (failure as { message?: unknown }).message === 'cancel')) return
    const details = adminErrorDetails(failure)
    error.value = { message: details.message || '新闻删除失败', requestId: details.requestId }
    ElMessage.error(error.value.message)
  } finally {
    deleting.value = false
  }
}

onMounted(() => { void load() })
watch(() => props.uid, () => void load())
watch(dirty, value => emit('dirty', value), { immediate: true })
</script>

<template>
  <AdminEditorShell
    eyebrow="内容管理"
    :title="record?.title || '新闻富文本编辑'"
    description="设计新闻正文的文字与图片布局，保存后应用到新闻页面。"
    :back-label="backLabel"
    :sections="sections"
    :can-write="canWrite"
    :dirty="dirty"
    :saving="saving"
    :busy="editor.busy.value || loading"
    :save-disabled="saveDisabled"
    @back="requestBack"
    @save="save(false)"
    @save-and-return="save(true)"
  >
    <template #header-actions><ElButton v-if="record" plain @click="reloadLatest">加载最新版本</ElButton></template>
    <ElSkeleton v-if="loading" :rows="10" animated class="admin-editor-skeleton" />
    <AdminStatePanel v-else-if="error && !record" tone="error" title="新闻读取失败" :description="error.message" :request-id="error.requestId">
      <template #actions><ElButton type="primary" @click="load">重新加载</ElButton></template>
    </AdminStatePanel>
    <template v-else-if="record">
      <ElAlert v-if="error" type="error" :title="error.message" show-icon :closable="false" class="admin-form-alert" />
      <ElAlert v-if="!canWrite" type="info" title="当前为只读模式" description="当前角色可以查看新闻，但没有修改正文的权限。" show-icon :closable="false" class="admin-form-alert" />
      <ElAlert v-if="record.content_format !== 'html'" type="info" :title="record.content_format === 'markdown' ? 'Markdown 原文已按文字导入，语法符号会保留；可在设计器中继续排版，保存后转为富文本。' : '原正文已导入；保存后转为富文本，返回放弃修改则保留原格式。'" show-icon :closable="false" class="admin-form-alert" />
      <div class="news-rich-sections">
        <section id="news-rich-overview" class="admin-form-section">
          <header><div><small>只读信息</small><h2>动态信息</h2><p>标题、发布状态和时间在新闻列表的“编辑”入口中维护。</p></div></header>
          <ElDescriptions :column="1" border class="news-rich-overview">
            <ElDescriptionsItem label="数据库 UID">{{ record.uid || uid }}</ElDescriptionsItem>
            <ElDescriptionsItem label="标题">{{ record.title || '未命名新闻' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="URL Slug">{{ record.slug || '—' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="分类">{{ record.category || '—' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="发布状态"><ElTag effect="plain">{{ publicationState }}</ElTag></ElDescriptionsItem>
            <ElDescriptionsItem label="发布时间">{{ formatAdminDateTime(record.published_at) }}</ElDescriptionsItem>
          </ElDescriptions>
        </section>
        <section id="news-rich-content" class="admin-form-section news-rich-content">
          <header><div><small>编辑分组</small><h2>富文本正文</h2><p>可插入标题、列表、引用、代码、链接和媒体库图片。</p></div></header>
          <AdminCompleteRichTextEditor :initial-html="html" :initial-format="record.content_format || 'plain'" :disabled="!canWrite || saving || deleting" @update:model-value="draftHtml = $event" @document="documentValue = $event" @ready="baselineDocument = JSON.stringify($event)" @busy="editorBusy = $event" />
          <p class="admin-field-help">编辑新闻正文；保存时服务端会过滤不安全节点、链接和媒体地址，并生成可发布的白名单 HTML。</p>
        </section>
      </div>
    </template>
    <template #record-meta>
      <Clock3 :size="16" />
      <span v-if="record">创建于 {{ formatAdminDateTime(record.created_at) }}；更新于 {{ formatAdminDateTime(record.updated_at) }}</span>
      <span v-else>正在读取新闻记录……</span>
      <ElTag v-if="dirty" type="warning" effect="light">有未保存修改</ElTag>
    </template>
    <template #danger-actions><ElButton v-if="record && canDelete" type="danger" plain :loading="deleting" @click="remove"><Trash2 :size="16" />删除新闻</ElButton></template>
  </AdminEditorShell>
</template>

<style scoped>
.admin-form-alert{margin-bottom:1rem}.news-rich-sections{display:grid;gap:1rem}.news-rich-overview{margin-top:1rem}.news-rich-content :deep(.rich-editor){margin-top:1rem}
</style>
