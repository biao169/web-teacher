<script setup lang="ts">
import type { PublicSiteLocale } from '~~/shared/contracts/public-site'

const route = useRoute()
const config = useRuntimeConfig()
const locale = computed<PublicSiteLocale>(() => route.path.startsWith('/en') ? 'en' : 'zh')
const readingMode = usePublicReadingMode()
const { data } = await usePublicLayoutModel(locale)
// A locale transition must never reuse links from the previous language.
const shell = computed(() => data.value?.locale === locale.value ? data.value : null)
const labels = computed(() => locale.value === 'en' ? { skip: 'Skip to content' } : { skip: '跳到正文' })

useHead(() => ({
  htmlAttrs: { lang: locale.value === 'en' ? 'en' : 'zh-CN' },
  bodyAttrs: { class: 'public-body', 'data-reading': readingMode.value },
}))
</script>

<template>
  <div class="public-shell pub:min-h-screen">
    <a class="public-skip-link" href="#main-content">{{ labels.skip }}</a>
    <PublicSiteHeader v-model:reading-mode="readingMode" :model="shell" :locale="locale" :fallback-site-name="config.public.siteName" />
    <main id="main-content" class="public-main" tabindex="-1"><slot /></main>
    <PublicSiteFooter :model="shell" :locale="locale" :fallback-site-name="config.public.siteName" />
    <PublicBackToTop :locale="locale" />
  </div>
</template>

<style src="~/assets/public/base.css"></style>
