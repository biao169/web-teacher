<script setup lang="ts">
import { Archive } from '@lucide/vue'

defineProps<{ title: string; description: string }>()
</script>

<template>
  <div class="public-empty-state" role="status">
    <span class="public-empty-state__icon" aria-hidden="true"><Archive :size="24" /></span>
    <div><strong>{{ title }}</strong><p>{{ description }}</p></div>
  </div>
</template>
