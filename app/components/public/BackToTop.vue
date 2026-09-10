<script setup lang="ts">
import { ArrowUp } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
defineProps<{ locale: 'zh' | 'en' }>()
const visible = ref(false)
function update() { visible.value = window.scrollY > 360 }
function goTop() { window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }
onMounted(() => { update(); window.addEventListener('scroll', update, { passive: true }) })
onBeforeUnmount(() => { window.removeEventListener('scroll', update) })
</script>
<template>
  <button v-if="visible" class="public-back-top" type="button" :aria-label="locale === 'zh' ? '返回顶部' : 'Back to top'" :title="locale === 'zh' ? '返回顶部' : 'Back to top'" @click="goTop"><ArrowUp :size="20" :stroke-width="1.8" aria-hidden="true" /></button>
</template>
<style scoped>
.public-back-top{position:fixed;right:max(1.1rem,env(safe-area-inset-right));bottom:max(1.1rem,env(safe-area-inset-bottom));z-index:30;display:grid;place-items:center;width:2.75rem;height:2.75rem;padding:0;border:1px solid var(--public-line-strong)!important;border-radius:50%;background:var(--public-surface);color:var(--public-accent-strong);box-shadow:0 4px 18px rgb(41 64 43/.12);transition:background .18s,transform .18s}
.public-back-top:hover{background:var(--public-accent-soft);transform:translateY(-2px)}.public-back-top:focus-visible{outline:2px solid var(--public-focus);outline-offset:4px}
@media(prefers-reduced-motion:reduce){.public-back-top{transition:none}.public-back-top:hover{transform:none}}@media print{.public-back-top{display:none}}
</style>
