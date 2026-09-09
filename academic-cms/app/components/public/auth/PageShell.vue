<script setup lang="ts">
defineProps<{ eyebrow: string; title: string; description: string }>()
</script>

<template>
  <section class="public-auth-page public-section">
    <div class="public-container public-auth-page__inner">
      <header class="public-auth-heading">
        <span>{{ eyebrow }}</span>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
      </header>
      <div class="public-auth-card"><slot /></div>
    </div>
  </section>
</template>
