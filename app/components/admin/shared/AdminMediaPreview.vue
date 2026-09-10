<script setup lang="ts">
import { useLatestRequest } from '~/composables/useLatestRequest'
const props = withDefaults(defineProps<{
  objectKey?: string | null
  src?: string | null
  mimeType?: string | null
  file?: File | null
  alt?: string | null
  fallbackText?: string | null
  height?: string
  resolve?: boolean
  controls?: boolean
  expected?: boolean
  retryable?: boolean
  loading?: boolean
  radius?: string
}>(), {
  objectKey: null,
  src: null,
  mimeType: null,
  file: null,
  alt: null,
  fallbackText: null,
  height: '9rem',
  resolve: true,
  controls: true,
  expected: false,
  retryable: true,
  loading: false,
  radius: '.55rem',
})

const emit = defineEmits<{ retry: [] }>()

interface PreviewByKeyResponse {
  readonly items?: readonly {
    readonly view?: { readonly available?: boolean; readonly url?: string; readonly mimeType?: string }
  }[]
}

const { request } = useCompleteAdminApi()
const localUrl = ref('')
const resolvedUrl = ref('')
const resolvedMime = ref('')
const resolving = ref(false)
const failed = ref(false)
const failureText = ref('')
const retryVersion = ref(0)
const reads = useLatestRequest()

const source = computed(() => localUrl.value || props.src?.trim() || resolvedUrl.value)
const mime = computed(() => props.file?.type || props.mimeType?.trim() || resolvedMime.value)
const kind = computed<'image' | 'video' | 'pdf' | 'file'>(() => {
  if (mime.value.startsWith('image/')) return 'image'
  if (mime.value.startsWith('video/')) return 'video'
  if (mime.value === 'application/pdf') return 'pdf'
  return 'file'
})
const fallback = computed(() => props.fallbackText?.trim() || (kind.value === 'pdf' ? 'PDF' : kind.value === 'video' ? '视频' : kind.value === 'file' ? '文件' : '暂无图片'))
const label = computed(() => props.alt?.trim() || props.objectKey?.trim() || fallback.value)
const isLoading = computed(() => resolving.value || props.loading)
const canRetry = computed(() => props.retryable && !isLoading.value && (failed.value || Boolean(failureText.value) || (props.expected && !source.value)))
const statusText = computed(() => isLoading.value ? '载入中' : failureText.value || (failed.value ? `${fallback.value}加载失败` : fallback.value))

function revokeLocalUrl(): void {
  if (localUrl.value) URL.revokeObjectURL(localUrl.value)
  localUrl.value = ''
}

function useFile(file: File | null): void {
  if (!import.meta.client) return
  revokeLocalUrl()
  if (file) localUrl.value = URL.createObjectURL(file)
  failed.value = false
  failureText.value = ''
}

async function resolveObjectKey(): Promise<void> {
  const isCurrent = reads.start()
  resolvedUrl.value = ''
  resolvedMime.value = ''
  failed.value = false
  failureText.value = ''
  resolving.value = false
  const objectKey = props.objectKey?.trim() ?? ''
  if (!import.meta.client || !props.resolve || props.file || props.src || !objectKey) return
  resolving.value = true
  try {
    const value = await request<PreviewByKeyResponse>('/api/v1/admin/complete/media/preview-by-key', { query: { key: objectKey } })
    if (!isCurrent()) return
    const item = value?.items?.[0]
    if (item?.view?.available && item.view.url) {
      resolvedUrl.value = String(item.view.url)
      resolvedMime.value = String(item.view.mimeType ?? '')
    }
    else failureText.value = '媒体不存在或无权预览'
  } catch {
    if (isCurrent()) failureText.value = '预览地址获取失败'
  } finally {
    if (isCurrent()) resolving.value = false
  }
}

function mediaLoaded(): void {
  failed.value = false
  failureText.value = ''
}

function mediaFailed(): void {
  failed.value = true
  failureText.value = ''
}

function retry(): void {
  failed.value = false
  failureText.value = ''
  retryVersion.value += 1
  emit('retry')
  if (props.objectKey?.trim() && props.resolve && !props.file && !props.src) void resolveObjectKey()
}

watch(() => props.file, useFile, { immediate: true })
watch(() => [props.objectKey, props.src, props.resolve, props.file] as const, () => { void resolveObjectKey() }, { immediate: true })
watch(source, () => { failed.value = false; failureText.value = '' })
onBeforeUnmount(revokeLocalUrl)
</script>

<template>
  <div
    class="admin-media-preview"
    :style="{ '--admin-media-preview-height': height, '--admin-media-preview-radius': radius }"
    :aria-label="label"
    :data-media-kind="kind"
  >
    <img v-if="source && !failed && kind === 'image'" :key="`${source}:${retryVersion}`" :src="source" :alt="label" loading="lazy" decoding="async" @load="mediaLoaded" @error="mediaFailed">
    <video v-else-if="source && !failed && kind === 'video'" :key="`${source}:${retryVersion}`" :src="source" :aria-label="label" :controls="controls" preload="metadata" @loadedmetadata="mediaLoaded" @error="mediaFailed" />
    <a v-else-if="source && !failed && kind === 'pdf'" :href="source" target="_blank" rel="noopener noreferrer" class="admin-media-preview__document">PDF</a>
    <span v-else class="admin-media-preview__fallback" aria-live="polite">
      <span>{{ statusText }}</span>
      <button v-if="canRetry" type="button" @click.stop="retry">重新载入</button>
    </span>
  </div>
</template>

<style scoped>
.admin-media-preview{width:100%;height:var(--admin-media-preview-height);display:grid;place-items:center;overflow:visible;border:0;border-radius:var(--admin-media-preview-radius);background:transparent;padding:0}
.admin-media-preview img,.admin-media-preview video{display:block;width:100%;height:100%;max-width:100%;max-height:100%;margin:0;object-fit:contain;object-position:center;background:transparent;border:0;border-radius:var(--admin-media-preview-radius)}
.admin-media-preview__fallback,.admin-media-preview__document{display:grid;place-items:center;width:100%;height:100%;overflow:hidden;color:var(--el-text-color-secondary);background:transparent;border:0;border-radius:var(--admin-media-preview-radius);text-align:center;text-decoration:none;overflow-wrap:anywhere}
.admin-media-preview__fallback{align-content:center;gap:.35rem;font-size:.8rem;font-weight:700}.admin-media-preview__fallback button{justify-self:center;padding:.18rem .42rem;border:0;border-radius:.35rem;color:var(--el-color-primary);background:transparent;font:inherit;font-weight:650;cursor:pointer}.admin-media-preview__fallback button:hover,.admin-media-preview__fallback button:focus-visible{text-decoration:underline}.admin-media-preview__document{color:var(--el-color-primary);font-weight:800}
</style>
