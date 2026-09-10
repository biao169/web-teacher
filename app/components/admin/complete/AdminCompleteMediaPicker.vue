<script setup lang="ts">
import { ElAlert, ElButton, ElDialog, ElEmpty, ElInput, ElPagination } from 'element-plus'
import { adminUploadedMediaRow, type AdminUploadedMedia } from '~/admin/media-upload'
import type { AdminMediaList, AdminMediaPreviews, AdminMediaRow } from '~/admin/media'
import { adminErrorMessage } from '~/admin/errors'
import { useLatestRequest } from '~/composables/useLatestRequest'
import { hasAdminPermission } from '~~/shared/admin/registry'
import { ADMIN_UID_PATTERN, suggestedAdminUid } from '~~/shared/admin/identity'
import AdminCheckedFormItem from '../shared/AdminCheckedFormItem.vue'
import AdminMediaPreview from '../shared/AdminMediaPreview.vue'
import AdminCompleteImageCropper from './AdminCompleteImageCropper.client.vue'

const props = withDefaults(defineProps<{ modelValue?: string | null; accept?: string[]; label?: string; disabled?: boolean }>(), { modelValue: '', accept: () => [], label: '选择媒体', disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string | null]; selected: [value: { objectKey: string; title: string; mimeType: string }] }>()
const { request } = useCompleteAdminApi()
const { uploadAdminMedia } = useAdminMediaUpload()
const auth = useAuthSession()
const currentUser = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)
const canUpload = computed(() => hasAdminPermission(currentUser.value, 'media_assets', 'create'))
const open = ref(false)
const loading = ref(false)
const uploading = ref(false)
const rows = ref<AdminMediaRow[]>([])
const listReads = useLatestRequest()
const uploadReads = useLatestRequest()
const copyReads = useLatestRequest()
const copying = ref(false)
const q = ref('')
const page = ref(1)
const total = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)
const error = ref('')
const notice = ref('')
const previewUrls = reactive<Record<string, string>>({})
const immediatePreviewFiles = reactive<Record<string, File>>({})
const uploadUid = ref(suggestedAdminUid('media'))
const cropOpen = ref(false)
const pendingFile = ref<File | null>(null)
const pendingTitle = ref('')
const pendingCategory = ref('admin')
const uploadedUid = ref('')

function accepted(mime: string): boolean {
  if (!props.accept.length) return true
  return props.accept.some(rule => rule.endsWith('/*') ? mime.startsWith(rule.slice(0, -1)) : mime === rule)
}
async function load() {
  if (uploading.value || !open.value) return
  const isCurrent = listReads.start()
  loading.value = true; error.value = ''
  try {
    const value = await request<AdminMediaList>('/api/v1/admin/complete/resource/media', { query: { page: page.value, pageSize: 50, q: q.value, f_status: 'active', f_mime_type: props.accept.join(',') } })
    if (!isCurrent()) return
    rows.value = (value.rows ?? []).filter(row => accepted(String(row.mime_type ?? '')))
    total.value = Number(value.total ?? 0)
    for (const key of Object.keys(previewUrls)) Reflect.deleteProperty(previewUrls, key)
    if (rows.value.length) {
      const previews = await request<AdminMediaPreviews>('/api/v1/admin/complete/media/previews', { query: { uids: rows.value.map(row => row.uid).join(',') } })
      if (!isCurrent()) return
      for (const item of previews.items ?? []) {
        if (item.view?.available && item.view.url) {
          previewUrls[item.uid] = item.view.url
          Reflect.deleteProperty(immediatePreviewFiles, String(item.uid))
        }
      }
    }
  } catch (e) { if (isCurrent()) error.value = adminErrorMessage(e, '媒体加载失败') }
  finally { if (isCurrent()) loading.value = false }
}
function choose(row: AdminMediaRow) { if (!props.disabled && !uploading.value && !copying.value) { const objectKey = String(row.object_key); emit('update:modelValue', objectKey); emit('selected', { objectKey, title: String(row.title || row.object_key), mimeType: String(row.mime_type || '') }); open.value = false } }
function triggerUpload() { if (!props.disabled && !uploading.value && !copying.value) fileInput.value?.click() }
function close(done: () => void): void { if (!uploading.value && !copying.value) done() }
async function resolveUploadedPreview(media: AdminUploadedMedia, isCurrent: () => boolean): Promise<void> {
  try {
    const previews = await request<AdminMediaPreviews>('/api/v1/admin/complete/media/previews', { query: { uids: media.uid } })
    if (!isCurrent()) return
    const view = previews.items?.[0]?.view
    if (view?.available && view.url) {
      previewUrls[media.uid] = String(view.url)
      Reflect.deleteProperty(immediatePreviewFiles, media.uid)
    }
    else notice.value = '媒体已上传并选中；服务端预览暂不可用，当前显示本地预览。'
  } catch {
    if (isCurrent()) notice.value = '媒体已上传并选中；服务端预览刷新失败，当前显示本地预览，可稍后重新载入。'
  }
}
async function uploadFile(file: File) {
  if (uploading.value || props.disabled || !open.value) return
  if (!ADMIN_UID_PATTERN.test(uploadUid.value)) { error.value = '数据库 UID 格式无效'; return }
  if (!accepted(file.type)) { error.value = '文件类型不符合当前字段要求'; return }
  uploading.value = true; error.value = ''; notice.value = ''
  const isCurrent = uploadReads.start()
  listReads.invalidate(); loading.value = false
  try {
    const mediaTitle = pendingTitle.value || file.name
    const media = await uploadAdminMedia(file, { uid: uploadUid.value, title: mediaTitle, category: pendingCategory.value || 'admin' })
    if (!isCurrent()) return
    const row = adminUploadedMediaRow(media)
    immediatePreviewFiles[media.uid] = file
    rows.value = [row, ...rows.value.filter(item => String(item.uid) !== media.uid)]
    total.value += 1
    uploadedUid.value = media.uid
    emit('update:modelValue', media.objectKey)
    emit('selected', { objectKey: media.objectKey, title: media.title || mediaTitle, mimeType: media.mimeType || file.type })
    notice.value = '媒体已上传、加入候选列表并选中。确认预览后可关闭选择器。'
    uploadUid.value = suggestedAdminUid('media')
    pendingFile.value = null
    await nextTick()
    void resolveUploadedPreview(media, isCurrent)
  } catch (e) { if (isCurrent()) error.value = adminErrorMessage(e, '上传失败') }
  finally { uploading.value = false; if (fileInput.value) fileInput.value.value = '' }
}
function selectUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  pendingFile.value = file
  pendingTitle.value = file.name
  pendingCategory.value = 'admin'
  if (file.type.startsWith('image/')) cropOpen.value = true
  else void uploadFile(file)
}
function useCropResult(file: File) { pendingFile.value = file; void uploadFile(file) }
function useOriginal(file: File) { pendingFile.value = file; void uploadFile(file) }
async function editCopy(row: AdminMediaRow) {
  const url = previewUrls[String(row.uid)]
  if (!url || uploading.value || copying.value || props.disabled) return
  const isCurrent = copyReads.start()
  copying.value = true
  error.value = ''
  try {
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) throw new Error('原图读取失败')
    const blob = await response.blob()
    if (!isCurrent()) return
    const extension = String(row.mime_type).split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    pendingFile.value = new File([blob], `${String(row.title || row.uid).replace(/[\\/:*?"<>|]/gu, '-')}.${extension}`, { type: String(row.mime_type), lastModified: Date.now() })
    pendingTitle.value = `${String(row.title || row.object_key)}（裁剪副本）`
    pendingCategory.value = String(row.category || 'admin')
    uploadUid.value = suggestedAdminUid('media')
    cropOpen.value = true
  } catch (e) { if (isCurrent()) error.value = adminErrorMessage(e, '无法编辑该媒体') }
  finally { if (isCurrent()) copying.value = false }
}
watch(open, value => {
  if (value) { page.value = 1; notice.value = ''; uploadedUid.value = ''; void load() }
  else {
    listReads.invalidate(); uploadReads.invalidate(); copyReads.invalidate()
    loading.value = false; copying.value = false
    for (const key of Object.keys(immediatePreviewFiles)) Reflect.deleteProperty(immediatePreviewFiles, key)
    pendingFile.value = null
  }
})
</script>

<template>
  <div class="admin-media-field">
    <ElInput :model-value="modelValue || ''" readonly clearable :disabled="disabled" @clear="!disabled && emit('update:modelValue', null)">
      <template #append><ElButton :disabled="disabled" @click="open = true">{{ label }}</ElButton></template>
    </ElInput>
    <ElDialog v-model="open" title="媒体选择器" width="min(980px, 94vw)" destroy-on-close :before-close="close">
      <div class="admin-media-toolbar">
        <ElInput v-model="q" :disabled="uploading || copying" clearable placeholder="搜索标题、object key、分类或 MIME" @keyup.enter="page=1;load()" />
        <ElButton :loading="loading" :disabled="uploading || copying" @click="page=1;load()">搜索</ElButton>
        <ElButton v-if="canUpload" type="primary" :loading="uploading" :disabled="disabled || copying || !ADMIN_UID_PATTERN.test(uploadUid)" @click="triggerUpload">上传文件</ElButton>
        <input ref="fileInput" class="sr-only" type="file" :accept="accept.join(',')" @change="selectUpload">
      </div>
      <AdminCheckedFormItem v-if="canUpload" class="admin-media-upload-uid" label="新上传媒体 UID" resource="media" field="uid" :value="uploadUid" :error="ADMIN_UID_PATTERN.test(uploadUid) ? '' : 'UID 格式无效。'"><ElInput v-model="uploadUid" :disabled="uploading" maxlength="128" show-word-limit placeholder="上传前可自定义稳定 UID" /><p class="admin-media-uid-help">自动生成的建议值可在首次上传前修改，上传后不可变。</p></AdminCheckedFormItem>
      <ElAlert v-if="error" type="error" :title="error" show-icon :closable="false" />
      <ElAlert v-if="notice" class="admin-media-notice" type="success" :title="notice" show-icon :closable="false" />
      <div v-if="error && pendingFile" class="admin-media-upload-retry"><span>待重试：{{ pendingFile.name }}</span><ElButton type="primary" plain :loading="uploading" @click="uploadFile(pendingFile)">重新上传</ElButton></div>
      <ElEmpty v-if="!loading && !rows.length" description="没有符合条件的媒体" />
      <div v-else v-loading="loading" class="admin-media-grid">
        <article v-for="row in rows" :key="row.uid" class="admin-media-card" :class="{ 'is-selected': modelValue === row.object_key, 'is-just-uploaded': uploadedUid === row.uid }">
          <AdminMediaPreview :file="immediatePreviewFiles[row.uid] ?? null" :src="previewUrls[row.uid] ?? ''" :mime-type="String(row.mime_type || '')" :alt="row.title || row.object_key" :fallback-text="String(row.mime_type).includes('pdf') ? 'PDF' : String(row.mime_type).startsWith('video/') ? '视频' : String(row.mime_type).startsWith('image/') ? '图片' : '文件'" height="7.5rem" :resolve="false" :expected="/^(?:image|video)\//u.test(String(row.mime_type || ''))" :loading="loading" @retry="load" />
          <span v-if="uploadedUid === row.uid" class="admin-media-card__fresh">刚刚上传 · 已选中</span>
          <div class="admin-media-card__info"><strong class="admin-media-card__title" :title="row.title || row.object_key">{{ row.title || row.object_key }}</strong><small>{{ row.mime_type }} · {{ Math.ceil(Number(row.size || 0) / 1024) }} KiB</small>
          <div class="admin-media-card__actions">
            <ElButton size="small" type="primary" plain :disabled="disabled || uploading || copying" @click="choose(row)">{{ modelValue === row.object_key ? '已选择' : '选择' }}</ElButton>
            <ElButton v-if="canUpload && String(row.mime_type).startsWith('image/') && previewUrls[row.uid]" size="small" plain :loading="copying" :disabled="disabled || uploading" @click="editCopy(row)">裁剪副本</ElButton>
          </div></div>
        </article>
      </div>
      <ElPagination v-if="total > 50" v-model:current-page="page" :disabled="uploading || copying" class="admin-media-pager" :page-size="50" :total="total" layout="total,prev,pager,next" @current-change="load" />
      <template #footer><ElButton :disabled="uploading || copying" @click="open = false">{{ modelValue ? '完成选择' : '关闭' }}</ElButton></template>
    </ElDialog>
    <AdminCompleteImageCropper v-model="cropOpen" :file="pendingFile" @cropped="useCropResult" @original="useOriginal" />
  </div>
</template>

<style scoped>
.admin-media-toolbar{display:grid;grid-template-columns:minmax(12rem,1fr) auto auto;gap:.75rem;margin-bottom:1rem}.admin-media-upload-uid{margin-bottom:1rem}.admin-media-uid-help{width:100%;margin-top:.35rem;color:var(--el-text-color-secondary);font-size:.72rem}.admin-media-notice{margin-bottom:.75rem}.admin-media-upload-retry{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin:.65rem 0;padding:.55rem .7rem;border-radius:.5rem;background:var(--el-color-danger-light-9);font-size:.8rem}.admin-media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.55rem;max-height:58vh;overflow:auto}.admin-media-card{position:relative;display:flex;flex-direction:column;gap:.25rem;padding:.5rem;text-align:left;border:1px solid var(--el-border-color);border-radius:.65rem;background:transparent}.admin-media-card:hover,.admin-media-card.is-selected{border-color:var(--el-color-primary)}.admin-media-card.is-just-uploaded{box-shadow:0 0 0 2px var(--el-color-success-light-7) inset}.admin-media-card__fresh{position:absolute;top:.45rem;left:.45rem;padding:.18rem .42rem;border-radius:999px;color:var(--el-color-success-dark-2);background:var(--el-color-success-light-9);font-size:.68rem;font-weight:750}.admin-media-card__info{display:flex;flex-direction:column;gap:.2rem;margin-top:auto;padding-top:.15rem;min-width:0}.admin-media-card__title{margin-top:.1rem;min-height:0;font-size:.8rem;line-height:1.35;font-weight:600;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere}.admin-media-card small{font-size:.7rem;line-height:1.3;color:var(--el-text-color-secondary);overflow-wrap:anywhere}.admin-media-card__actions{padding-top:.2rem;display:flex;flex-wrap:wrap;gap:.35rem}.admin-media-pager{justify-content:flex-end;margin-top:1rem}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:640px){.admin-media-toolbar{grid-template-columns:1fr}.admin-media-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
