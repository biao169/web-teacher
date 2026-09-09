<script setup lang="ts">
defineProps<{ title: string; text: string | null; id?: string }>()
</script>
<template>
  <section v-if="text" class="public-detail-section" :aria-labelledby="id">
    <h2 :id="id">{{ title }}</h2><p class="public-long-text">{{ text }}</p>
  </section>
</template>
