<script setup lang="ts">
import { BookOpen, BookMarked, GitFork, Globe, GraduationCap, IdCard } from '@lucide/vue'
import type { PublicAcademicLink } from '~~/shared/contracts/public-content'
defineProps<{ links: readonly PublicAcademicLink[]; locale: 'zh' | 'en' }>()
const icons = { orcid: IdCard, homepage: Globe, 'google-scholar': GraduationCap, dblp: BookOpen, github: GitFork, cnki: BookMarked }
</script>
<template>
  <nav v-if="links.length" class="public-profile-links" :aria-label="locale === 'zh' ? '教师平台链接' : 'Faculty links'">
    <a v-for="link in links" :key="link.kind" :href="link.href" target="_blank" rel="noopener noreferrer">
      <component :is="icons[link.kind]" :size="17" aria-hidden="true" />
      <span>{{ link.label }}</span><span v-if="link.value != null && link.value !== ''" class="public-profile-links__value">{{ link.value }}</span>
    </a>
  </nav>
</template>
<style scoped>
.public-profile-links{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.8rem;font-size:var(--public-text-meta)}
.public-profile-links a{display:inline-flex;align-items:center;gap:.4rem;min-height:2rem;max-width:100%;padding:.3rem .65rem;border:1px solid var(--public-line);border-radius:.6rem;background:var(--public-surface-soft);color:var(--public-accent-strong);text-decoration:none;overflow-wrap:anywhere}
.public-profile-links a:hover{border-color:var(--public-accent);background:var(--public-accent-soft)}
.public-profile-links svg{flex:none}.public-profile-links__value{padding-left:.4rem;border-left:1px solid var(--public-line);font-variant-numeric:tabular-nums;font-weight:600}
</style>
