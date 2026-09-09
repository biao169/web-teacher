<script setup lang="ts">
import NavigationLink from './NavigationLink.vue'
import RichHtml from './content/RichHtml.vue'
import type { PublicHomeViewModel, PublicShellViewModel, PublicSiteLocale } from '~~/shared/contracts/public-site'
const props = defineProps<{ model: PublicHomeViewModel | PublicShellViewModel | null; locale: PublicSiteLocale; fallbackSiteName: string }>()
const footerNavigation = computed(() => props.model?.navigation.footer ?? [])
const footerHtml = computed(() => props.model?.site.footerHtml ?? null)
const legacyText = computed(() => props.model?.site.footerHtml === undefined ? props.model?.site.footerText : null)
</script>
<template>
  <footer v-if="footerHtml || legacyText || footerNavigation.length" class="public-footer">
    <div class="public-container public-footer__content">
      <RichHtml v-if="footerHtml" :html="footerHtml" :locale="locale" />
      <p v-else-if="legacyText" class="public-footer__text">{{ legacyText }}</p>
      <nav v-if="footerNavigation.length" class="public-footer__nav" :aria-label="locale === 'zh' ? '页脚导航' : 'Footer navigation'">
        <NavigationLink v-for="item in footerNavigation" :key="item.uid" :link="item" />
      </nav>
    </div>
  </footer>
</template>
<style scoped>
.public-footer__content{display:flex;flex-wrap:wrap;align-items:start;justify-content:space-between;gap:1rem 2rem;padding-block:1.5rem;font-size:var(--public-text-small,.8rem);line-height:1.8}
.public-footer__content>.public-rich-html,.public-footer__text{flex:1 1 20rem;min-width:0;overflow-wrap:anywhere}
.public-footer__text{white-space:pre-line;margin:0}.public-footer__content :deep(p){margin:.25em 0}.public-footer__content :deep(a){color:var(--public-accent);text-underline-offset:.2em}.public-footer__content :deep(.rich-align-center){text-align:center}.public-footer__content :deep(.rich-align-right){text-align:right}.public-footer__content :deep(.rich-align-justify){text-align:justify}
</style>
