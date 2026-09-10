<script setup lang="ts">
import AdminFormItem from '../shared/AdminFormItem.vue'
import { ElButton, ElDialog, ElForm, ElInputNumber, ElMessage, ElRadioButton, ElRadioGroup, ElSlider } from 'element-plus'
import { ADMIN_CROP_PRESETS, adminCropFocusAtPoint, adminCropRect } from '~/admin/media-crop'

const props = defineProps<{ modelValue: boolean; file: File | null }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  cropped: [file: File]
  original: [file: File]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const image = shallowRef<HTMLImageElement | null>(null)
const url = ref('')
const presetKey = ref('square')
const zoom = ref(1)
const focusX = ref(.5)
const focusY = ref(.5)
const width = ref(1200)
const height = ref(1200)
const format = ref('image/jpeg')
const quality = ref(.9)
const working = ref(false)
const dragging = ref(false)

const targetRatio = computed(() => {
  return Math.max(64, width.value) / Math.max(64, height.value)
})

function cleanup(): void {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
  image.value = null
}

function boundedOutput(value: number): number {
  return Math.max(64, Math.min(4096, Math.round(value)))
}

function applyPreset(value: string | number | boolean | undefined): void {
  if (typeof value !== 'string') return
  presetKey.value = value
  const preset = ADMIN_CROP_PRESETS.find(item => item.key === value)
  if (!preset) return
  if (preset.key === 'original' && image.value) {
    const scale = Math.min(1, 4096 / Math.max(image.value.naturalWidth, image.value.naturalHeight))
    width.value = boundedOutput(image.value.naturalWidth * scale)
    height.value = boundedOutput(image.value.naturalHeight * scale)
  } else {
    width.value = preset.width
    height.value = preset.height
  }
  zoom.value = 1
}

function outputChanged(): void {
  presetKey.value = 'custom'
}

function previewSize(ratio: number): { width: number; height: number } {
  const maximumWidth = 760
  const maximumHeight = 560
  if (maximumWidth / maximumHeight > ratio) return { width: Math.round(maximumHeight * ratio), height: maximumHeight }
  return { width: maximumWidth, height: Math.round(maximumWidth / ratio) }
}

function sourceRect() {
  const img = image.value
  if (!img) return null
  return adminCropRect(img.naturalWidth, img.naturalHeight, targetRatio.value, zoom.value, { x: focusX.value, y: focusY.value })
}

function draw(): void {
  const element = canvas.value
  const img = image.value
  const crop = sourceRect()
  if (!element || !img || !crop) return
  const size = previewSize(targetRatio.value)
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  element.width = Math.round(size.width * dpr)
  element.height = Math.round(size.height * dpr)
  element.style.width = `${size.width}px`
  const context = element.getContext('2d')
  if (!context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, size.width, size.height)
  context.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height)
  const guideX = Math.max(10, Math.min(size.width - 10, ((focusX.value * img.naturalWidth - crop.x) / crop.width) * size.width))
  const guideY = Math.max(10, Math.min(size.height - 10, ((focusY.value * img.naturalHeight - crop.y) / crop.height) * size.height))
  context.save()
  context.strokeStyle = 'rgba(255,255,255,.95)'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(guideX - 10, guideY)
  context.lineTo(guideX + 10, guideY)
  context.moveTo(guideX, guideY - 10)
  context.lineTo(guideX, guideY + 10)
  context.stroke()
  context.strokeStyle = 'rgba(0,0,0,.55)'
  context.lineWidth = 1
  context.strokeRect(guideX - 11.5, guideY - 11.5, 23, 23)
  context.restore()
}

async function load(): Promise<void> {
  cleanup()
  if (!props.file) return
  url.value = URL.createObjectURL(props.file)
  const nextImage = new Image()
  nextImage.decoding = 'async'
  nextImage.onload = () => {
    image.value = nextImage
    focusX.value = .5
    focusY.value = .5
    applyPreset('original')
    nextTick(draw)
  }
  nextImage.onerror = () => ElMessage.error('无法读取这张图片')
  nextImage.src = url.value
}

function setFocus(event: PointerEvent): void {
  const element = canvas.value
  const img = image.value
  const crop = sourceRect()
  if (!element || !img || !crop) return
  const bounds = element.getBoundingClientRect()
  const next = adminCropFocusAtPoint(crop, img.naturalWidth, img.naturalHeight, event.clientX - bounds.left, event.clientY - bounds.top, bounds.width, bounds.height)
  focusX.value = next.x
  focusY.value = next.y
}

function pointerDown(event: PointerEvent): void {
  dragging.value = true
  canvas.value?.setPointerCapture(event.pointerId)
  setFocus(event)
}

function pointerMove(event: PointerEvent): void {
  if (dragging.value) setFocus(event)
}

function pointerUp(event: PointerEvent): void {
  dragging.value = false
  if (canvas.value?.hasPointerCapture(event.pointerId)) canvas.value.releasePointerCapture(event.pointerId)
}

function wheel(event: WheelEvent): void {
  zoom.value = Math.max(1, Math.min(4, Number((zoom.value + (event.deltaY < 0 ? .08 : -.08)).toFixed(2))))
}

async function crop(): Promise<void> {
  const img = image.value
  const source = sourceRect()
  if (!img || !source || !props.file) return
  working.value = true
  try {
    const output = document.createElement('canvas')
    output.width = boundedOutput(width.value)
    output.height = boundedOutput(height.value)
    const context = output.getContext('2d')
    if (!context) throw new Error('浏览器不支持 Canvas')
    if (format.value === 'image/jpeg') {
      context.fillStyle = '#fff'
      context.fillRect(0, 0, output.width, output.height)
    }
    context.drawImage(img, source.x, source.y, source.width, source.height, 0, 0, output.width, output.height)
    const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, format.value, quality.value))
    if (!blob) throw new Error('图片导出失败')
    const extension = format.value === 'image/png' ? 'png' : format.value === 'image/webp' ? 'webp' : 'jpg'
    const baseName = props.file.name.replace(/.[^.]+$/u, '') || 'image'
    emit('cropped', new File([blob], `${baseName}-cropped.${extension}`, { type: format.value, lastModified: Date.now() }))
    emit('update:modelValue', false)
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '图片裁剪失败')
  } finally {
    working.value = false
  }
}

function useOriginal(): void {
  if (!props.file) return
  emit('original', props.file)
  emit('update:modelValue', false)
}

watch(() => props.modelValue, value => { if (value) void load(); else cleanup() })
watch([zoom, focusX, focusY, width, height, presetKey], () => nextTick(draw))
onBeforeUnmount(cleanup)
</script>

<template>
  <ElDialog :model-value="modelValue" title="裁剪与缩放图片" width="min(1120px, 96vw)" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <div class="crop-layout">
      <div class="crop-workspace">
        <div class="crop-preview">
          <canvas
            ref="canvas"
            tabindex="0"
            aria-label="图片裁剪区域；点击或拖动可设置裁剪中心，滚轮可缩放"
            @pointerdown="pointerDown"
            @pointermove="pointerMove"
            @pointerup="pointerUp"
            @pointercancel="pointerUp"
            @wheel.prevent="wheel"
          />
        </div>
        <p class="admin-field-help crop-hint">点击主体可设置裁剪中心，也可拖动微调；鼠标滚轮或右侧滑块只改变缩放，裁剪中心始终锚定在同一原图位置。</p>
      </div>
      <ElForm label-position="top" class="crop-controls">
        <AdminFormItem label="裁剪比例">
          <ElRadioGroup :model-value="presetKey" size="small" class="crop-presets" @update:model-value="applyPreset">
            <ElRadioButton v-for="preset in ADMIN_CROP_PRESETS" :key="preset.key" :value="preset.key">{{ preset.label }}</ElRadioButton>
            <ElRadioButton value="custom">自定义</ElRadioButton>
          </ElRadioGroup>
        </AdminFormItem>
        <div class="crop-dimensions">
          <AdminFormItem label="输出宽度"><ElInputNumber v-model="width" :min="64" :max="4096" :step="64" controls-position="right" @change="outputChanged" /></AdminFormItem>
          <AdminFormItem label="输出高度"><ElInputNumber v-model="height" :min="64" :max="4096" :step="64" controls-position="right" @change="outputChanged" /></AdminFormItem>
        </div>
        <AdminFormItem label="缩放">
          <ElSlider v-model="zoom" :min="1" :max="4" :step=".01" show-input :show-input-controls="false" />
        </AdminFormItem>
        <p class="crop-focus">裁剪中心：{{ Math.round(focusX * 100) }}% × {{ Math.round(focusY * 100) }}%</p>
        <AdminFormItem label="输出格式">
          <ElRadioGroup v-model="format" size="small"><ElRadioButton value="image/jpeg">JPEG</ElRadioButton><ElRadioButton value="image/png">PNG</ElRadioButton><ElRadioButton value="image/webp">WebP</ElRadioButton></ElRadioGroup>
        </AdminFormItem>
        <AdminFormItem v-if="format !== 'image/png'" label="图片质量"><ElSlider v-model="quality" :min=".5" :max="1" :step=".01" /></AdminFormItem>
      </ElForm>
    </div>
    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">取消</ElButton>
      <ElButton @click="useOriginal">使用原图</ElButton>
      <ElButton type="primary" :loading="working" @click="crop">使用裁剪结果</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.crop-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:1rem;align-items:start}.crop-workspace{min-width:0}.crop-preview{display:grid;place-items:center;min-height:580px;overflow:auto;border:0;background:transparent}.crop-preview canvas{display:block;max-width:100%;height:auto;border:0;background:transparent;cursor:crosshair;touch-action:none}.crop-hint{margin:.5rem 0 0;text-align:center}.crop-controls{position:sticky;top:0}.crop-presets{display:flex;flex-wrap:wrap}.crop-dimensions{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}.crop-dimensions :deep(.el-input-number){width:100%}.crop-focus{margin:-.65rem 0 1rem;color:var(--el-text-color-secondary);font-size:.75rem}@media(max-width:820px){.crop-layout{grid-template-columns:1fr}.crop-preview{min-height:320px}.crop-controls{position:static}}
</style>
