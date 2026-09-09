<script setup lang="ts">
import { ArrowLeft, Home, RotateCcw } from '@lucide/vue'

const props = defineProps<{ error: { statusCode?: number } }>()
const route = useRoute()
const locale = computed(() => route.path.startsWith('/en') ? 'en' : 'zh')
const homePath = computed(() => locale.value === 'en' ? '/en' : '/zh')
const status = computed(() => Number.isInteger(props.error?.statusCode) ? Number(props.error.statusCode) : 500)
const copy = computed(() => {
  if (locale.value === 'en') {
    if (status.value === 404) return { title: 'Page not found', description: 'The requested public page does not exist or is no longer available.' }
    if (status.value === 429) return { title: 'Please pause for a moment', description: 'Requests arrived too quickly. Wait a minute, then try again.' }
    if (status.value === 403) return { title: 'Access denied', description: 'This content is not available with the current access level.' }
    return { title: 'The page is temporarily unavailable', description: 'A safe error page is available while the underlying service recovers.' }
  }
  if (status.value === 404) return { title: '页面不存在', description: '请求的公开页面不存在，或内容已不再提供。' }
  if (status.value === 429) return { title: '请稍候再试', description: '请求较频繁，请等待一分钟后再试。' }
  if (status.value === 403) return { title: '无权访问', description: '当前访问级别不能查看此内容。' }
  return { title: '页面暂时不可用', description: '底层服务恢复期间，系统仍会提供安全、独立的错误页面。' }
})

useHead(() => ({
  htmlAttrs: { lang: locale.value === 'en' ? 'en' : 'zh-CN' },
  bodyAttrs: { class: 'system-error-body' },
  title: `${status.value} · ${copy.value.title}`,
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
}))

function retry(): void {
  clearError({ redirect: route.fullPath || homePath.value })
}
</script>

<template>
  <main class="system-error-page">
    <section class="system-error-card" aria-labelledby="error-title">
      <p class="system-error-code">{{ status }}</p>
      <h1 id="error-title">{{ copy.title }}</h1>
      <p>{{ copy.description }}</p>
      <div class="system-error-actions">
        <button class="system-error-button system-error-button--primary" type="button" @click="retry">
          <RotateCcw :size="17" aria-hidden="true" />{{ locale === 'zh' ? '重新尝试' : 'Try again' }}
        </button>
        <NuxtLink class="system-error-button system-error-button--secondary" :to="homePath" @click="clearError()">
          <Home :size="17" aria-hidden="true" />{{ locale === 'zh' ? '返回首页' : 'Go home' }}
        </NuxtLink>
      </div>
      <button class="system-error-back" type="button" @click="$router.back()">
        <ArrowLeft :size="15" aria-hidden="true" />{{ locale === 'zh' ? '返回上一页' : 'Go back' }}
      </button>
    </section>
  </main>
</template>

<style scoped>
.system-error-page {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: clamp(1rem, 4vw, 3rem);
  color: #18232f;
  background:
    radial-gradient(circle at 15% 15%, rgb(37 99 235 / 10%), transparent 32rem),
    #f5f7fa;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.system-error-card {
  width: min(100%, 38rem);
  padding: clamp(1.5rem, 5vw, 3rem);
  border: 1px solid #d8e0e8;
  border-radius: 1.25rem;
  background: #fff;
  box-shadow: 0 1.5rem 4rem rgb(15 23 42 / 10%);
  text-align: center;
}

.system-error-code {
  margin: 0 0 .5rem;
  color: #2563eb;
  font: 700 clamp(2rem, 8vw, 4rem)/1 ui-monospace, SFMono-Regular, Consolas, monospace;
}

.system-error-card h1 {
  margin: 0;
  font-size: clamp(1.5rem, 4vw, 2.25rem);
  line-height: 1.2;
}

.system-error-card > p:not(.system-error-code) {
  max-width: 32rem;
  margin: 1rem auto 0;
  color: #536171;
  line-height: 1.7;
}

.system-error-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: .75rem;
  margin-top: 1.75rem;
}

.system-error-button,
.system-error-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .45rem;
  min-height: 2.75rem;
  border-radius: .75rem;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  text-decoration: none;
}

.system-error-button {
  padding: .65rem 1rem;
  border: 1px solid transparent;
}

.system-error-button--primary {
  color: #fff;
  background: #1d4ed8;
}

.system-error-button--secondary {
  color: #1e293b;
  border-color: #cbd5e1;
  background: #fff;
}

.system-error-back {
  margin: 1.25rem auto 0;
  padding: .4rem .65rem;
  border: 0;
  color: #536171;
  background: transparent;
}

.system-error-button:focus-visible,
.system-error-back:focus-visible {
  outline: 3px solid rgb(37 99 235 / 38%);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .system-error-button,
  .system-error-back { scroll-behavior: auto; }
}

@media (forced-colors: active) {
  .system-error-card,
  .system-error-button { border: 1px solid CanvasText; }
}
</style>
