<script setup lang="ts">
defineProps<{ tone?: 'info' | 'success' | 'error'; requestId?: string | null }>()
</script>
<template>
  <div class="public-form-status" :data-tone="tone || 'info'" role="status">
    <slot />
    <small v-if="requestId">Request ID: {{ requestId }}</small>
  </div>
</template>
