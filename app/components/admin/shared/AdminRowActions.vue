<script setup lang="ts">
withDefaults(defineProps<{ align?: 'start' | 'end' }>(), { align: 'end' })
</script>

<template>
  <div class="admin-row-actions" :class="`is-${align}`"><slot /></div>
</template>
