<script setup lang="ts">
import { ref } from 'vue'
import type { usePublicCopy } from '~/composables/usePublicCopy'
// Shared in-flow feedback. Manual text is mounted only after an actual clipboard failure.
defineProps<{ copy: ReturnType<typeof usePublicCopy> }>()
const manual = ref<HTMLTextAreaElement | null>(null)
function selectText() { manual.value?.focus(); manual.value?.select() }
</script>
<template>
  <div class="public-copy-feedback" :data-state="copy.status.value" :hidden="copy.status.value === 'idle'">
    <span role="status" aria-live="polite" aria-atomic="true">{{ copy.status.value === 'copying' ? (copy.locale.value === 'zh' ? `正在复制 ${copy.processed.value}/${copy.count.value}…` : `Copying ${copy.processed.value}/${copy.count.value}…`) : copy.status.value === 'copied' ? copy.message.value : '' }}</span>
    <template v-if="copy.status.value === 'failed'">
      <p role="alert">{{ copy.message.value }}</p>
      <div class="public-copy-actions"><button type="button" @click="copy.retry()">{{ copy.locale.value === 'zh' ? '重试复制' : 'Retry copy' }}</button><slot /></div>
      <template v-if="copy.fallback.value">
        <label class="public-copy-manual-label">{{ copy.locale.value === 'zh' ? '手动复制文本' : 'Text for manual copying' }}<textarea ref="manual" class="public-copy-manual" :value="copy.fallback.value.text" readonly rows="4" /></label>
        <div class="public-copy-actions"><button type="button" @click="selectText">{{ copy.locale.value === 'zh' ? '选中文本' : 'Select text' }}</button><span>{{ copy.locale.value === 'zh' ? '选中后按 Ctrl/Cmd+C，或使用系统复制。' : 'Then press Ctrl/Cmd+C or use the system Copy action.' }}</span></div>
      </template>
    </template>
  </div>
</template>
