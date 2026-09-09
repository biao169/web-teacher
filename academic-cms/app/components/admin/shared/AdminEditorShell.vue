<script setup lang="ts">
import { ArrowLeft, Save } from '@lucide/vue'
import { ElButton, ElTag } from 'element-plus'

export interface AdminEditorSection {
  readonly id: string
  readonly label: string
}

const props = withDefaults(defineProps<{
  eyebrow?: string
  title: string
  description?: string
  sections?: readonly AdminEditorSection[]
  canWrite?: boolean
  dirty?: boolean
  busy?: boolean
  saving?: boolean
  saveDisabled?: boolean
  backLabel?: string
}>(), {
  eyebrow: '记录编辑',
  description: '',
  sections: () => [],
  canWrite: true,
  dirty: false,
  busy: false,
  saving: false,
  saveDisabled: false,
  backLabel: '返回列表',
})
const emit = defineEmits<{ back: []; save: []; 'save-and-return': [] }>()
const activeSectionId = ref('')
const busy = computed(() => props.busy || props.saving)
function goBack(): void { if (!busy.value) emit('back') }
function requestSave(andReturn = false): void {
  if (props.canWrite && !props.saveDisabled && !busy.value) {
    if (andReturn) emit('save-and-return')
    else emit('save')
  }
}

function scrollToSection(id: string): void {
  activeSectionId.value = id
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function updateActiveSection(): void {
  if (!props.sections.length) {
    activeSectionId.value = ''
    return
  }
  const root = document.documentElement
  if (window.scrollY + window.innerHeight >= root.scrollHeight - 2) {
    activeSectionId.value = props.sections.at(-1)!.id
    return
  }
  const anchorLine = Math.max(120, Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--admin-topbar-height')) || 0) + 96
  let active = props.sections[0]!.id
  for (const section of props.sections) {
    const element = document.getElementById(section.id)
    if (element && element.getBoundingClientRect().top <= anchorLine) active = section.id
  }
  activeSectionId.value = active
}

function handleShortcut(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
  event.preventDefault()
  requestSave()
}

onMounted(() => {
  window.addEventListener('scroll', updateActiveSection, { passive: true })
  window.addEventListener('resize', updateActiveSection, { passive: true })
  window.addEventListener('keydown', handleShortcut)
  nextTick(updateActiveSection)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateActiveSection)
  window.removeEventListener('resize', updateActiveSection)
  window.removeEventListener('keydown', handleShortcut)
})
watch(() => props.sections.map(section => section.id).join('|'), () => nextTick(updateActiveSection))
</script>

<template>
  <section class="admin-unified-editor-shell">
    <AdminPageHeader :eyebrow="props.eyebrow" :title="props.title" :description="props.description">
      <template #actions>
        <ElButton :disabled="busy" @click="goBack"><ArrowLeft :size="16" />{{ props.backLabel }}</ElButton>
        <span class="admin-editor-action-slot" :inert="busy || undefined"><slot name="header-actions" /></span>
      </template>
    </AdminPageHeader>
    <nav v-if="props.sections.length" class="admin-form-nav" aria-label="编辑区块">
      <button
        v-for="section in props.sections"
        :key="section.id"
        type="button"
        :class="{ 'is-active': activeSectionId === section.id }"
        :aria-current="activeSectionId === section.id ? 'location' : undefined"
        @click="scrollToSection(section.id)"
      >{{ section.label }}</button>
    </nav>
    <fieldset class="admin-editor-content" :disabled="busy" :inert="busy || undefined" :aria-busy="busy"><slot /></fieldset>
    <footer class="admin-editor-footer">
      <div class="admin-record-meta">
        <slot name="record-meta"><ElTag v-if="props.dirty" type="warning" effect="light">有未保存修改</ElTag></slot>
      </div>
      <div class="admin-editor-footer__actions">
        <span class="admin-editor-action-slot" :inert="busy || undefined"><slot name="danger-actions" /></span>
        <ElButton :disabled="busy" @click="goBack"><ArrowLeft :size="16" />{{ props.backLabel }}</ElButton>
        <ElButton v-if="props.canWrite" :disabled="props.saveDisabled || busy" :loading="props.saving" @click="requestSave()"><Save :size="16" />保存</ElButton>
        <ElButton v-if="props.canWrite" type="primary" :disabled="props.saveDisabled || busy" :loading="props.saving" @click="requestSave(true)">保存并返回</ElButton>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.admin-editor-content { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
.admin-editor-action-slot { display: contents; }
</style>
