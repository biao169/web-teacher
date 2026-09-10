<script setup lang="ts">
import AdminFormItem from '../shared/AdminFormItem.vue'
import { ElAlert, ElButton, ElButtonGroup, ElDialog, ElForm, ElInput, ElMessage, ElRadioButton, ElRadioGroup } from 'element-plus'
import type { Editor as TiptapEditor } from '@tiptap/vue-3'
import { suggestedAdminUid } from '~~/shared/admin/identity'
import { newsEditorInitialContent } from '~/admin/news-rich-text'
import PublicContentRichHtml from '../../public/content/RichHtml.vue'
import AdminCompleteMediaPicker from './AdminCompleteMediaPicker.vue'

type ImageLayout = 'none' | 'left' | 'right' | 'center' | 'wide'
interface SelectedMedia { objectKey: string; title: string; mimeType: string }
interface EditorDocumentReader { getJSON: () => unknown; getHTML: () => string }

const props = withDefaults(defineProps<{ modelValue?: string; initialHtml?: string; initialFormat?: string; disabled?: boolean }>(), { modelValue: '', initialHtml: '', initialFormat: 'html', disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string]; document: [value: unknown]; ready: [value: unknown]; busy: [value: boolean] }>()
const { request } = useCompleteAdminApi()
const { uploadAdminMedia } = useAdminMediaUpload()
const editor = shallowRef<TiptapEditor | null>(null)
const host = ref<HTMLElement | null>(null)
const ready = ref(false)
const loadError = ref('')
const unavailable = computed(() => props.disabled || !ready.value)
let disposed = false
const uploading = ref(false)
const mediaOpen = ref(false)
const pdfOpen = ref(false)
const selectedPdf = ref<string | null>('')
const pdfTitle = ref('')
function insertPdf(): void {
  if (!selectedPdf.value || unavailable.value) return
  editor.value?.chain().focus().insertContent({ type: 'pdf', attrs: { objectKey: selectedPdf.value, title: pdfTitle.value.trim().slice(0, 500) } }).run()
  pdfOpen.value = false; selectedPdf.value = ''; pdfTitle.value = ''
}
function onPdfSelected(media: SelectedMedia): void { selectedPdf.value = media.objectKey; pdfTitle.value = defaultAlt(media.title) }
const settingsOpen = ref(false)
const previewOpen = ref(false)
const previewLoading = ref(false)
const previewHtml = ref('')
const currentDocument = ref<unknown>(null)
const selectedMedia = ref<string | null>('')
const imageAlt = ref('')
const imageLayout = ref<ImageLayout>('none')
const imageSelected = ref(false)
let previewTimer: ReturnType<typeof setTimeout> | null = null
let previewRequest = 0

function mediaUrl(objectKey: string): string { return `/media/${objectKey.split('/').map(encodeURIComponent).join('/')}` }
function defaultAlt(name: string): string { return name.replace(/\.[a-z0-9]{1,8}$/iu, '').replace(/[-_]+/gu, ' ').trim().slice(0, 500) || '新闻图片' }
function publishDocument(instance: EditorDocumentReader | null = editor.value): void {
  if (!instance) return
  currentDocument.value = instance.getJSON()
  emit('update:modelValue', instance.getHTML())
  emit('document', currentDocument.value)
}

async function createEditor(): Promise<void> {
  loadError.value = ''
  try {
  const [{ Editor }, { newsRichTextExtensions }] = await Promise.all([
    import('@tiptap/vue-3'), import('./news-rich-text-extensions'),
  ])
  if (disposed || !host.value) return
  editor.value = new Editor({
    element: host.value!, editable: !props.disabled,
    extensions: newsRichTextExtensions(),
    content: newsEditorInitialContent(props.initialHtml || props.modelValue, props.initialFormat),
    editorProps: {
      handlePaste: (_view, event) => { const files = imageFiles(event.clipboardData?.files); if (!files.length || props.disabled) return false; void uploadAndInsert(files); return true },
      handleDrop: (view, event, _slice, moved) => { if (moved || props.disabled) return false; const files = imageFiles(event.dataTransfer?.files); if (!files.length) return false; const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos; if (typeof position === 'number') editor.value?.commands.setTextSelection(position); void uploadAndInsert(files); return true },
    },
    onUpdate: ({ editor: instance }) => publishDocument(instance),
    onSelectionUpdate: ({ editor: instance }) => { imageSelected.value = instance.isActive('image') },
  })
  ready.value = true
  publishDocument()
  emit('ready', currentDocument.value)
  } catch {
    editor.value?.destroy()
    editor.value = null
    ready.value = false
    loadError.value = '富文本工具加载失败，正文尚未修改，请重试。'
  }
}

function imageFiles(list?: FileList | null): File[] { return list ? Array.from(list).filter(file => file.type.startsWith('image/')).slice(0, 10) : [] }
function insertManagedImage(objectKey: string, alt: string, layout: ImageLayout): void { editor.value?.chain().focus().insertContent({ type: 'image', attrs: { src: mediaUrl(objectKey), objectKey, alt, float: layout } }).run() }
async function uploadAndInsert(files: File[]): Promise<void> {
  if (uploading.value) return
  uploading.value = true
  try {
    for (const file of files) { const media = await uploadAdminMedia(file, { uid: suggestedAdminUid('media'), title: file.name, category: 'news-rich-text' }); insertManagedImage(media.objectKey, defaultAlt(media.title || file.name), 'none') }
    ElMessage.success(files.length > 1 ? `已上传并插入 ${files.length} 张图片` : '已上传并插入图片')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '图片上传失败') }
  finally { uploading.value = false }
}

function command(name: string): void {
  if (unavailable.value) return
  const chain = editor.value?.chain().focus(); if (!chain) return
  if (name === 'bold') chain.toggleBold().run(); else if (name === 'italic') chain.toggleItalic().run(); else if (name === 'underline') chain.toggleUnderline().run(); else if (name === 'strike') chain.toggleStrike().run()
  else if (name === 'paragraph') chain.setParagraph().run(); else if (name === 'h2') chain.toggleHeading({ level: 2 }).run(); else if (name === 'h3') chain.toggleHeading({ level: 3 }).run(); else if (name === 'h4') chain.toggleHeading({ level: 4 }).run()
  else if (name === 'bullet') chain.toggleBulletList().run(); else if (name === 'ordered') chain.toggleOrderedList().run(); else if (name === 'quote') chain.toggleBlockquote().run(); else if (name === 'code') chain.toggleCodeBlock().run(); else if (name === 'rule') chain.setHorizontalRule().run()
  else if (name === 'left') chain.setTextAlign('left').run(); else if (name === 'center') chain.setTextAlign('center').run(); else if (name === 'right') chain.setTextAlign('right').run(); else if (name === 'justify') chain.setTextAlign('justify').run()
  else if (name === 'clear') chain.unsetAllMarks().clearNodes().run(); else if (name === 'undo') chain.undo().run(); else if (name === 'redo') chain.redo().run()
  else if (name === 'link') { const current = editor.value; if (!current) return; const href = window.prompt('请输入 HTTPS、HTTP 或 mailto 链接', current.getAttributes('link').href || 'https://'); if (href) chain.extendMarkRange('link').setLink({ href }).run() }
  else if (name === 'image') mediaOpen.value = true
}

function onMediaSelected(media: SelectedMedia): void { selectedMedia.value = media.objectKey; imageAlt.value = defaultAlt(media.title) }
function insertImage(): void { if (!selectedMedia.value) return; insertManagedImage(selectedMedia.value, imageAlt.value.trim().slice(0, 500), imageLayout.value); mediaOpen.value = false; selectedMedia.value = ''; imageAlt.value = ''; imageLayout.value = 'none' }
function editSelectedImage(): void { if (!editor.value?.isActive('image')) return; const attributes = editor.value.getAttributes('image'); imageAlt.value = String(attributes.alt || ''); imageLayout.value = ['none', 'left', 'right', 'center', 'wide'].includes(String(attributes.float)) ? attributes.float as ImageLayout : 'none'; settingsOpen.value = true }
function applyImageSettings(): void { editor.value?.chain().focus().updateAttributes('image', { alt: imageAlt.value.trim().slice(0, 500), float: imageLayout.value }).run(); settingsOpen.value = false }

async function loadPreview(): Promise<void> {
  if (!currentDocument.value) return
  const requestId = ++previewRequest
  previewLoading.value = true
  try { const value = await request<{ html: string }>('/api/v1/admin/complete/news/rich-text-preview', { method: 'POST', body: { document: currentDocument.value } }); if (requestId === previewRequest) previewHtml.value = value.html }
  catch (error) { if (requestId === previewRequest) { previewHtml.value = ''; ElMessage.error(error instanceof Error ? error.message : '预览生成失败') } }
  finally { if (requestId === previewRequest) previewLoading.value = false }
}
function schedulePreview(): void { if (!previewOpen.value) return; if (previewTimer) clearTimeout(previewTimer); previewTimer = setTimeout(() => void loadPreview(), 350) }

onMounted(() => void createEditor())
onBeforeUnmount(() => { disposed = true; previewRequest++; if (previewTimer) clearTimeout(previewTimer); editor.value?.destroy() })
// initialHtml is a seed, not a controlled value. Saving must preserve selection and undo history.
watch(() => props.disabled, value => editor.value?.setEditable(!value))
watch(uploading, value => emit('busy', value))
watch(currentDocument, schedulePreview)
watch(previewOpen, value => { if (value) void loadPreview() })
</script>

<template>
  <div class="rich-editor" :class="{ 'is-loading': !ready, 'is-disabled': disabled }">
    <ElAlert v-if="loadError" type="error" :title="loadError" :closable="false"><ElButton @click="createEditor">重新加载工具</ElButton></ElAlert>
    <div class="rich-toolbar" role="toolbar" aria-label="富文本工具栏">
      <ElButtonGroup><ElButton :disabled="unavailable" @click="command('undo')">撤销</ElButton><ElButton :disabled="unavailable" @click="command('redo')">重做</ElButton></ElButtonGroup>
      <ElButtonGroup><ElButton :disabled="unavailable" @click="command('paragraph')">正文</ElButton><ElButton :disabled="unavailable" @click="command('h2')">H2</ElButton><ElButton :disabled="unavailable" @click="command('h3')">H3</ElButton><ElButton :disabled="unavailable" @click="command('h4')">H4</ElButton></ElButtonGroup>
      <ElButtonGroup><ElButton :disabled="unavailable" @click="command('bold')"><strong>B</strong></ElButton><ElButton :disabled="unavailable" @click="command('italic')"><em>I</em></ElButton><ElButton :disabled="unavailable" @click="command('underline')"><u>U</u></ElButton><ElButton :disabled="unavailable" @click="command('strike')"><s>S</s></ElButton><ElButton :disabled="unavailable" @click="command('clear')">清除格式</ElButton></ElButtonGroup>
      <ElButtonGroup><ElButton :disabled="unavailable" @click="command('bullet')">无序列表</ElButton><ElButton :disabled="unavailable" @click="command('ordered')">有序列表</ElButton><ElButton :disabled="unavailable" @click="command('quote')">引用</ElButton><ElButton :disabled="unavailable" @click="command('code')">代码</ElButton><ElButton :disabled="unavailable" @click="command('rule')">分隔线</ElButton></ElButtonGroup>
      <ElButtonGroup><ElButton :disabled="unavailable" @click="command('left')">左</ElButton><ElButton :disabled="unavailable" @click="command('center')">中</ElButton><ElButton :disabled="unavailable" @click="command('right')">右</ElButton><ElButton :disabled="unavailable" @click="command('justify')">两端</ElButton></ElButtonGroup>
      <ElButton :disabled="unavailable" @click="command('link')">链接</ElButton><ElButton type="primary" :loading="uploading" :disabled="unavailable" @click="command('image')">插入媒体图片</ElButton><ElButton :disabled="unavailable || !imageSelected" @click="editSelectedImage">图片设置</ElButton><ElButton :disabled="unavailable" @click="pdfOpen = true">插入 PDF</ElButton><ElButton type="success" plain @click="previewOpen = true">前台实时预览</ElButton>
    </div>
    <p class="rich-hint">可直接粘贴或拖入本地图片；已插入的图片可拖到新位置，点选后可修改布局和替代文本。</p>
    <div ref="host" class="rich-content" />
    <ElDialog v-model="mediaOpen" title="插入媒体图片" width="min(860px,94vw)" append-to-body><ElForm label-position="top" class="rich-image-settings"><AdminFormItem label="替代文本"><ElInput v-model="imageAlt" maxlength="500" show-word-limit placeholder="选择图片后自动生成，也可手动覆盖" /></AdminFormItem><AdminFormItem label="图片布局"><ElRadioGroup v-model="imageLayout"><ElRadioButton value="none">独占一行</ElRadioButton><ElRadioButton value="left">左浮动</ElRadioButton><ElRadioButton value="right">右浮动</ElRadioButton><ElRadioButton value="center">居中停靠</ElRadioButton><ElRadioButton value="wide">通栏</ElRadioButton></ElRadioGroup></AdminFormItem></ElForm><AdminCompleteMediaPicker v-model="selectedMedia" :accept="['image/*']" @selected="onMediaSelected" /><template #footer><ElButton @click="mediaOpen = false">取消</ElButton><ElButton type="primary" :disabled="!selectedMedia" @click="insertImage">插入</ElButton></template></ElDialog>
    <ElDialog v-model="pdfOpen" title="插入 PDF 正文" width="min(860px,94vw)" append-to-body><ElForm label-position="top"><AdminFormItem label="文档名称"><ElInput v-model="pdfTitle" maxlength="500" /></AdminFormItem></ElForm><p class="rich-hint">PDF 在新闻详情中以分隔线衔接正文，滚动时逐页加载；列表不显示正文。</p><AdminCompleteMediaPicker v-model="selectedPdf" :accept="['application/pdf']" @selected="onPdfSelected" /><template #footer><ElButton @click="pdfOpen = false">取消</ElButton><ElButton type="primary" :disabled="!selectedPdf" @click="insertPdf">插入</ElButton></template></ElDialog>
    <ElDialog v-model="settingsOpen" title="修改图片设置" width="min(680px,94vw)" append-to-body><ElForm label-position="top" class="rich-image-settings"><AdminFormItem label="替代文本"><ElInput v-model="imageAlt" maxlength="500" show-word-limit /></AdminFormItem><AdminFormItem label="图片布局"><ElRadioGroup v-model="imageLayout"><ElRadioButton value="none">独占一行</ElRadioButton><ElRadioButton value="left">左浮动</ElRadioButton><ElRadioButton value="right">右浮动</ElRadioButton><ElRadioButton value="center">居中停靠</ElRadioButton><ElRadioButton value="wide">通栏</ElRadioButton></ElRadioGroup></AdminFormItem></ElForm><template #footer><ElButton @click="settingsOpen = false">取消</ElButton><ElButton type="primary" @click="applyImageSettings">应用</ElButton></template></ElDialog>
    <ElDialog v-model="previewOpen" title="新闻前台效果实时预览" width="min(1080px,96vw)" append-to-body><div v-loading="previewLoading" class="rich-preview public-rich-content"><PublicContentRichHtml v-if="previewHtml" :html="previewHtml" /><p v-else>暂无可预览内容</p></div><template #footer><ElButton @click="previewOpen = false">返回编辑</ElButton><ElButton :loading="previewLoading" @click="loadPreview">立即刷新</ElButton></template></ElDialog>
  </div>
</template>

<style scoped>
.rich-content :deep(ul),.rich-preview :deep(ul){list-style:disc;padding-inline-start:1.6em;margin:.6em 0}
.rich-content :deep(ol),.rich-preview :deep(ol){list-style:decimal;padding-inline-start:1.6em;margin:.6em 0}
.rich-content :deep(li),.rich-preview :deep(li){display:list-item;margin:.2em 0}
.rich-content :deep(p){margin:.5em 0;min-height:1em}
.rich-content :deep(blockquote){margin:.6em 0;padding:.5em 1em;border-inline-start:3px solid var(--el-color-primary)}
.rich-content :deep(pre),.rich-preview :deep(pre){white-space:pre-wrap;overflow-wrap:anywhere;padding:.75em;background:var(--el-fill-color-light);font-family:monospace}
.rich-editor{overflow:hidden;border:1px solid var(--el-border-color);border-radius:.65rem;background:var(--el-bg-color)}.rich-toolbar{display:flex;flex-wrap:wrap;gap:.4rem;padding:.55rem;border-bottom:1px solid var(--el-border-color);background:var(--el-fill-color-lighter)}.rich-hint{margin:0;padding:.45rem .8rem;color:var(--el-text-color-secondary);font-size:.76rem;background:transparent}.rich-content{min-height:28rem;padding:1rem;line-height:1.75}.rich-content :deep(.tiptap){display:flow-root;min-height:25rem;outline:none}.rich-content :deep(h2),.rich-content :deep(h3),.rich-content :deep(h4){margin:1.1em 0 .45em}.rich-content :deep(img){display:block;max-width:100%;max-height:62vh;width:auto;height:auto;object-fit:contain;cursor:grab;background:transparent}.rich-content :deep(img.ProseMirror-selectednode){outline:2px solid var(--el-color-primary);outline-offset:3px}.rich-content :deep(img[data-float="left"]){float:left;width:min(45%,28rem);margin:.4rem 1rem .7rem 0}.rich-content :deep(img[data-float="right"]){float:right;width:min(45%,28rem);margin:.4rem 0 .7rem 1rem}.rich-content :deep(img[data-float="center"]){width:min(76%,46rem);margin:1rem auto}.rich-content :deep(img[data-float="wide"]){width:100%;margin:1rem 0}.rich-image-settings{display:grid;gap:1rem;margin-bottom:1rem}.rich-preview{min-height:55vh;max-height:72vh;overflow:auto;padding:clamp(1rem,3vw,2.5rem);color:#43534f;font-size:1.02rem;line-height:1.92;background:#fff}.rich-preview :deep(.public-rich-html){display:flow-root}.rich-preview :deep(h2),.rich-preview :deep(h3),.rich-preview :deep(h4){margin-top:1.4rem;color:#172824;font-family:Georgia,"Noto Serif SC",serif;line-height:1.3}.rich-preview :deep(blockquote){margin:.4rem 0;padding:.9rem 1.2rem;border-inline-start:4px solid #176b57;background:#eaf5f1}.rich-preview :deep(figure){margin:1rem 0}.rich-preview :deep(figure img){display:block;max-width:100%;max-height:70vh;width:auto;height:auto;object-fit:contain;background:transparent}.rich-preview :deep(.rich-align-center){text-align:center}.rich-preview :deep(.rich-align-right){text-align:right}.rich-preview :deep(.rich-align-justify){text-align:justify}.rich-preview :deep(.rich-image-left){float:left;width:min(45%,28rem);margin:.4rem 1.2rem .8rem 0}.rich-preview :deep(.rich-image-right){float:right;width:min(45%,28rem);margin:.4rem 0 .8rem 1.2rem}.rich-preview :deep(.rich-image-center){width:min(76%,46rem);margin:1rem auto}.rich-preview :deep(.rich-image-wide){width:100%;margin:1.2rem 0}.is-loading{opacity:.65}.is-disabled .rich-content{background:var(--el-fill-color-extra-light)}@media(max-width:720px){.rich-content :deep(img[data-float="left"]),.rich-content :deep(img[data-float="right"]),.rich-content :deep(img[data-float="center"]){float:none;width:100%;margin:1rem 0}}
</style>
