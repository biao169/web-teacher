<script setup lang="ts">
defineProps<{ items: Array<{ label: string; value: string | number | null | undefined }> }>()
</script>
<template>
  <dl class="public-fact-grid">
    <template v-for="item in items" :key="item.label">
      <div v-if="item.value !== null && item.value !== undefined && String(item.value).trim()">
        <dt>{{ item.label }}</dt><dd>{{ item.value }}</dd>
      </div>
    </template>
  </dl>
</template>
