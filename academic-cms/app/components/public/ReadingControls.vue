<script setup lang="ts">
import type { PublicReadingMode } from '~/composables/usePublicReadingMode'
defineProps<{ modelValue: PublicReadingMode; locale: 'zh' | 'en' }>()
defineEmits<{ 'update:modelValue': [value: PublicReadingMode] }>()
const modes = ['standard', 'comfortable', 'large'] as const
const labels = { zh: ['标准', '舒适', '大字'], en: ['Standard', 'Comfort', 'Large'] }
</script>

<template>
  <div class="public-reading-controls" role="group" :aria-label="locale === 'zh' ? '阅读字号' : 'Reading size'">
    <button v-for="(mode, index) in modes" :key="mode" type="button" :aria-pressed="modelValue === mode" @click="$emit('update:modelValue', mode)">
      {{ labels[locale][index] }}
    </button>
  </div>
</template>
