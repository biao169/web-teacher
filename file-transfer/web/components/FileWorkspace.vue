<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from '#imports'
import { useTransferFiles } from '../composables/useTransferFiles'
import { captureDrop } from '../files/collection.mjs'
import { browserFileSupport } from '../files/save.mjs'
import { validateManifest, policyWarnings } from '../../shared/manifest.mjs'
import type { ReadHandle, PickerScope } from '../../shared/files'
import type { AccessRule } from '../../shared/client'
const props = defineProps<{ mode: 'send' | 'receive'; zh: boolean; rule?: AccessRule | undefined }>()
const emit = defineEmits<{ 'switch-mode': [mode: 'send' | 'receive'] }>()
const files = useTransferFiles()
const { collection, preview, busy, progress, problem, result, receiveCode, note } = files
const fileInput = ref<HTMLInputElement | null>(null); const folderInput = ref<HTMLInputElement | null>(null)
const support = ref({ directoryRead: false, directoryWrite: false, streamSave: false }); const folderFallback = ref(false)
const more = ref<HTMLElement | null>(null); let observer: IntersectionObserver | null = null; let mounted = false
const visible = ref(100); const dragging = ref(false)
const current = computed(() => props.mode === 'send' ? collection.value : preview.value)
const stats = computed(() => current.value ? validateManifest(current.value.manifest) : null)
const entries = computed(() => current.value?.manifest.entries.slice(0, visible.value) || [])
const warnings = computed(() => policyWarnings(collection.value.manifest, props.rule))
const percent = computed(() => progress.value.totalBytes === '0' ? 0 : Math.min(100, Number(BigInt(progress.value.bytes) * 100n / BigInt(progress.value.totalBytes))))
const messages: Record<string, [string, string]> = {
  FT_UNSAFE_PATH: ['文件名或目录路径不适合安全跨平台保存，请改名后再选。', 'Rename this file or folder for safe cross-platform saving.'],
  FT_PATH_CONFLICT: ['目录清单存在冲突，未写入目标文件。', 'The directory manifest contains conflicting paths.'],
  FT_COLLECTION_LIMIT: ['超过清单容量：最多 20,000 个文件和目录，路径信息最多 8 MiB。请分批选择。', 'Selection limit: 20,000 entries and 8 MiB of path metadata. Select in batches.'],
  FT_DOWNLOAD_BUSY: ['浏览器仍在处理最近的兼容下载，请稍后再试。流式保存不受此等待影响。', 'Recent fallback downloads are still being handed to the browser. Try again shortly; streaming saves avoid this wait.'],
  FT_MEMORY_LIMIT: ['当前兼容下载单次最多 128 MiB。请减少文件，或使用支持流式保存的浏览器。', 'Fallback downloads are limited to 128 MiB. Select fewer files or use streaming save support.'],
  FT_NO_FILES: ['没有采集到文件。若选择的是空文件夹，请使用支持目录读取的浏览器或拖放目录。', 'No entries were collected. For empty folders, use directory access support or folder drag and drop.'],
  FT_DIRECTORY_UNSUPPORTED: ['当前浏览器无法执行此目录操作，可尝试选择文件或 ZIP 下载。', 'This directory operation is unsupported. Try file selection or ZIP download.'],
  FT_CANCELLED: ['操作已取消，原选择仍保留。', 'Cancelled. Your previous selection is retained.'],
  FT_FILE_CHANGED: ['选择后的源文件已变化，请重新选择，避免保存错版。', 'The source file changed. Select it again before saving.'],
  FT_PERMISSION_DENIED: ['未获得文件访问权限，可重新选择并授权。', 'File access was denied. Select again to grant access.'],
  FT_READ_FAILED: ['文件读取或保存失败，请检查权限、源文件及磁盘空间。', 'Reading or saving failed. Check access, source files and available disk space.'],
  FT_SIZE_MISMATCH: ['读到的文件大小与清单不一致，本次写入已中止。', 'File size differs from the manifest. The current write was aborted.'],
  FT_STREAM_INVALID: ['文件数据流不符合要求，本次保存已中止。', 'The file stream is invalid. Saving was aborted.'],
  FT_DESTINATION_EXISTS: ['目标子文件夹已存在，请重试创建新目录。', 'The destination subfolder already exists. Retry with a fresh folder.'],
  FT_MANIFEST_INVALID: ['文件清单格式不正确，未开始保存。', 'Invalid file manifest. Saving did not start.'],
  FT_POLICY_UNKNOWN: ['尚未取得使用规则；本机预览仍可使用。', 'Access rules are unavailable; local preview still works.'],
  FT_SEND_DENIED: ['当前身份的预设规则不允许发送；本机整理不上传文件。', 'Your configured access denies sending. Local preparation does not upload files.'],
  FT_FILE_COUNT_LIMIT: ['所选文件数超过当前身份的预设上限。', 'The selection exceeds your configured file-count limit.'],
  FT_TASK_SIZE_LIMIT: ['所选总量超过当前身份的预设任务上限。', 'The selection exceeds your configured task-size limit.'],
  FT_FILE_SIZE_LIMIT: ['有文件超过当前身份的预设单文件上限。', 'A file exceeds your configured per-file limit.'],
}
function message(code: string) { return (messages[code] || messages.FT_READ_FAILED)![props.zh ? 0 : 1] }
function size(value: string) {
  const n = BigInt(value); const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']; let unit = 0; let scale = 1n
  while (unit < units.length - 1 && n >= scale * 1024n) { scale *= 1024n; unit++ }
  return unit === 0 ? `${n} B` : `${n / scale}.${n % scale * 10n / scale} ${units[unit]}`
}
function observeMore() {
  observer?.disconnect()
  if (!mounted || !more.value || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(items => { if (items.some(item => item.isIntersecting)) visible.value += 100 }, { rootMargin: '120px' })
  observer.observe(more.value)
}
onMounted(() => { mounted = true; support.value = browserFileSupport(window); folderFallback.value = 'webkitdirectory' in document.createElement('input'); observeMore() })
onBeforeUnmount(() => { mounted = false; observer?.disconnect() })
watch(() => [visible.value, current.value, props.mode], async () => { await nextTick(); observeMore() })
watch(() => [props.mode, current.value], () => { visible.value = 100 })
function selected(event: Event, directory: boolean) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files || []); input.value = ''
  if (selected.length) void files.addFiles(selected, directory)
  else if (directory) void files.addFiles([], true)
}
function chooseFolder() {
  if (busy.value) return
  const picker = (window as unknown as PickerScope).showDirectoryPicker
  if (support.value.directoryRead && picker) {
    try { void files.addHandle(picker.call(window, { mode: 'read' }) as Promise<ReadHandle>) }
    catch { void files.addHandle(Promise.reject({ code: 'FT_DIRECTORY_UNSUPPORTED' })) }
  } else folderInput.value?.click()
}
function drop(event: DragEvent) {
  dragging.value = false
  if (busy.value || props.mode !== 'send') return
  const captured = captureDrop(event.dataTransfer)
  void files.addDrop(captured)
}
function prepare() { files.preparePreview(); emit('switch-mode', 'receive') }
</script>
<template>
  <div v-show="mode === 'send' || preview" class="ft-file-workspace">
    <div v-show="mode === 'send'" class="ft-empty ft-drop-zone" :class="{ 'is-dragging': dragging }" @dragover.prevent="dragging = !busy" @dragleave.prevent="dragging = false" @drop.prevent="drop">
      <div class="ft-symbol" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/><path d="M12 17v-7m-3 3 3-3 3 3"/></svg></div>
      <h2>{{ zh ? '把文件放到这里' : 'Bring your files here' }}</h2><p>{{ zh ? '选择或拖入文件、文件夹，先查看目录结构。这里只做本机整理，不上传、不消耗 VPN 传输流量。' : 'Choose or drop files and folders to inspect their structure. Preparation stays on this device and uploads no files.' }}</p>
      <input ref="fileInput" class="ft-hidden-input" type="file" multiple tabindex="-1" aria-hidden="true" @change="selected($event, false)">
      <input ref="folderInput" class="ft-hidden-input" type="file" webkitdirectory multiple tabindex="-1" aria-hidden="true" @change="selected($event, true)">
      <div class="ft-actions"><button class="ft-button" :disabled="!!busy" @click="fileInput?.click()">{{ zh ? '选择文件' : 'Choose files' }}</button><button class="ft-button ft-secondary" :disabled="!!busy || (!support.directoryRead && !folderFallback)" @click="chooseFolder">{{ zh ? '选择文件夹' : 'Choose folder' }}</button></div>
      <p class="ft-muted ft-after-actions">{{ zh ? '同名项目自动加序号；不会静默覆盖。单次清单最多 20,000 个文件和目录。' : 'Duplicate names receive a suffix. Nothing is silently replaced. Up to 20,000 entries per selection.' }}</p>
      <p v-if="!support.directoryRead && !folderFallback" class="ft-muted ft-after-actions">{{ zh ? '当前浏览器不支持文件夹选择，可改为选择多个文件。' : 'Folder selection is unavailable here. Select multiple files instead.' }}</p>
      <label class="ft-field ft-note" for="ft-send-note">{{ zh ? '任务备注（仅当前页面会话）' : 'Task note (this page session)' }}<input id="ft-send-note" v-model="note" maxlength="120" :disabled="!!busy" :placeholder="zh ? '例如：会议资料' : 'e.g. Meeting documents'"></label>
    </div>
    <div v-show="mode === 'receive' && preview" class="ft-empty ft-receive-zone"><h2>{{ zh ? '本机接收预览' : 'Local receive preview' }}</h2><p>{{ zh ? '这里预览的是本机选择的文件；来自另一台设备的接收任务显示在上方。' : 'This previews files selected on this device. Incoming transfers appear above.' }}</p><span class="ft-badge ft-preview-badge">{{ zh ? '本机预览 · 未跨设备传输' : 'Local preview · No network transfer' }}</span></div>
    <section v-if="current?.manifest.entries.length" class="ft-file-selection" :aria-label="zh ? '文件清单' : 'File manifest'">
      <div class="ft-selection-heading"><div><h3>{{ note || (mode === 'send' ? (zh ? '待发送文件' : 'Files to send') : (zh ? '本机接收预览' : 'Local receive preview')) }}</h3><p class="ft-muted">{{ stats?.files }} {{ zh ? '个文件' : 'files' }} · {{ stats?.directories }} {{ zh ? '个目录' : 'folders' }} · {{ size(stats?.totalBytes || '0') }}<template v-if="stats?.emptyDirectories"> · {{ stats.emptyDirectories }} {{ zh ? '个空目录' : 'empty folders' }}</template></p></div><button v-if="mode === 'send'" class="ft-text-button" :disabled="!!busy" @click="files.clear">{{ zh ? '清空选择' : 'Clear selection' }}</button></div>
      <p v-if="current.warnings.includes('FT_EMPTY_DIRECTORIES_UNKNOWN')" class="ft-notice">{{ zh ? '本次包含兼容目录选择：能保留已选文件的路径，但该接口不能提供空目录，空目录可能缺失。' : 'This selection includes the fallback folder picker. File paths are preserved, but empty folders may be missing.' }}</p>
      <details v-if="current.renamed.length" class="ft-renamed"><summary>{{ zh ? '查看自动改名记录' : 'Review renamed entries' }} ({{ current.renamed.length }})</summary><ul><li v-for="(change, index) in current.renamed.slice(0, 100)" :key="index">{{ change.from }} → {{ change.to }}</li></ul><p v-if="current.renamed.length > 100" class="ft-muted">{{ zh ? '仅显示前 100 条；文件清单显示最终名称。' : 'First 100 changes shown; the manifest uses final names.' }}</p></details>
      <ul class="ft-file-list"><li v-for="entry in entries" :key="entry.relativePath"><span class="ft-file-kind" aria-hidden="true">{{ entry.kind === 'directory' ? '▱' : '▤' }}</span><div class="ft-file-name"><span>{{ entry.relativePath }}{{ entry.kind === 'directory' ? '/' : '' }}</span><small>{{ entry.kind === 'directory' ? (zh ? '目录' : 'Folder') : size(entry.sizeBytes) }}</small></div><button v-if="mode === 'send'" class="ft-text-button" :disabled="!!busy" :aria-label="(zh ? '移除 ' : 'Remove ') + entry.relativePath" @click="files.remove(entry.relativePath)">{{ zh ? '移除' : 'Remove' }}</button><button v-else-if="entry.kind === 'file'" class="ft-text-button" :disabled="!!busy" :aria-label="(zh ? '保存 ' : 'Save ') + entry.relativePath" @click="files.save('file', entry)">{{ zh ? '保存文件' : 'Save file' }}</button></li></ul>
      <button v-if="current.manifest.entries.length > visible" ref="more" class="ft-text-button" @click="visible += 100">{{ zh ? '加载接下来 100 条' : 'Show next 100 entries' }} ({{ visible }} / {{ current.manifest.entries.length }})</button>
      <div v-if="mode === 'send'" class="ft-actions ft-selection-actions"><button class="ft-button" :disabled="!!busy" @click="prepare">{{ zh ? '预览接收与保存（本机）' : 'Preview receiving & saving (local)' }}</button></div>
      <div v-else class="ft-export"><div class="ft-actions"><button class="ft-button" :disabled="!!busy || !support.directoryWrite" @click="files.save('directory')">{{ zh ? '保存为文件夹' : 'Save as folder' }}</button><button class="ft-button ft-secondary" :disabled="!!busy" @click="files.save('zip')">{{ zh ? '下载 ZIP' : 'Download ZIP' }}</button></div><p class="ft-muted">{{ support.directoryWrite ? (zh ? '在你选择的目录内新建独立子文件夹，保留层级和空目录。' : 'Creates a fresh subfolder in your chosen destination, preserving structure and empty folders.') : (zh ? '当前浏览器不支持直接写入目录，请使用 ZIP 保留目录结构。' : 'Direct folder writing is unavailable. ZIP preserves the directory structure.') }}</p><p class="ft-muted">{{ support.streamSave ? (zh ? '已支持流式保存：按块写入磁盘。ZIP 仅打包、不压缩，减少处理等待。' : 'Streaming save is supported. Files are written in chunks; ZIP packages without compression.') : (zh ? '兼容下载单次最多 128 MiB（含 ZIP 开销）；超出请分批选择。ZIP 仅打包、不压缩。' : 'Fallback downloads are limited to 128 MiB, including ZIP overhead. Split larger selections. ZIP uses no compression.') }}</p></div>
    </section>
    <p v-else class="ft-muted ft-selection-empty">{{ mode === 'send' ? (zh ? '还没有选择文件。空文件和支持采集的空目录也可以保留。' : 'No files selected. Empty files and supported empty folders are preserved.') : (zh ? '尚无接收任务。可在发送视图选择文件，生成本机接收预览。' : 'No received tasks. Select files in Send to create a local preview.') }}</p>
    <div v-if="busy" class="ft-file-progress" role="status"><div><strong>{{ busy === 'scan' ? (zh ? '正在整理文件清单…' : 'Reading file metadata…') : (zh ? '正在本机保存…' : 'Saving locally…') }}</strong><p v-if="busy === 'save'">{{ size(progress.bytes) }} / {{ size(progress.totalBytes) }} · {{ progress.path }}</p><progress v-if="busy === 'save'" max="100" :value="percent" :aria-label="zh ? '本机保存进度' : 'Local save progress'" /></div><button class="ft-text-button" @click="files.cancel">{{ zh ? '取消' : 'Cancel' }}</button></div>
    <div v-if="problem" class="ft-notice ft-file-error" role="alert"><p>{{ message(problem.code) }} <span v-if="problem.path">{{ problem.path }}</span></p><p v-if="problem.partialDirectory">{{ zh ? '可能保留部分已保存内容：' : 'Partially saved content may remain in: ' }}{{ problem.partialDirectory }} · {{ problem.completedFiles }} {{ zh ? '个文件已完成；重试会新建目录。' : 'files completed. Retrying creates a new folder.' }}</p></div>
    <p v-if="result" class="ft-notice" role="status">{{ result.status === 'saved' ? (zh ? '本机保存完成：' : 'Saved locally: ') : (zh ? '已交给浏览器下载，请在下载列表确认：' : 'Download requested. Check your browser downloads: ') }}{{ result.name }}</p>
    <div v-if="mode === 'send' && collection.manifest.entries.length && warnings.length" class="ft-policy-warnings"><p v-for="code in warnings" :key="code" class="ft-muted">{{ message(code) }}</p></div>
    <p class="ft-muted ft-workspace-note">{{ zh ? '本机整理区 · 文件和接收码只保留在当前页面会话；刷新或关闭后需重新选择。' : 'Local preparation · Files and codes stay in this page session. Reselect after refreshing or closing.' }}</p>
  </div>
</template>
