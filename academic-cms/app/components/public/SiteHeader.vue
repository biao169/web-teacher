<script setup lang="ts">
import { LogIn, LogOut, Menu, ShieldCheck, UserRound, X } from '@lucide/vue'
import { visibleAdminModules } from '~~/shared/admin/registry'
import type { PublicHomeViewModel, PublicShellViewModel, PublicSiteLocale } from '~~/shared/contracts/public-site'
import { switchLocalePath } from '~~/shared/utils/locale-path'
import type { PublicReadingMode } from '~/composables/usePublicReadingMode'
import ReadingControls from './ReadingControls.vue'
import NavigationLink from './NavigationLink.vue'
import { PUBLIC_LOCALE_COOKIE, PUBLIC_LOCALE_COOKIE_OPTIONS } from '~~/shared/utils/public-locale'

const props = defineProps<{
  model: PublicHomeViewModel | PublicShellViewModel | null
  locale: PublicSiteLocale
  readingMode?: PublicReadingMode
  fallbackSiteName: string
}>()

defineEmits<{ 'update:readingMode': [value: PublicReadingMode] }>()
const route = useRoute()
const transferExtension = computed(() => ((useRuntimeConfig().public as Record<string, unknown>).fileTransfer as { enabled?: boolean } | undefined)?.enabled ? resolveComponent('FileTransferNavEntry') : null)
const auth = useAuthSession()
const user = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)
const adminPath = computed(() => visibleAdminModules(user.value)[0]?.path)
const loggingOut = ref(false)
const accountError = ref<'load' | 'logout' | null>(null)
const loginTarget = computed(() => ({ path: `/${props.locale}/login`, query: {
  next: /^\/(?:zh|en)\/(?:login|register)(?:\/|$)/u.test(route.path) ? `/${props.locale}/account` : route.fullPath,
} }))
async function logout(): Promise<void> {
  if (loggingOut.value || auth.pending.value) return
  loggingOut.value = true
  accountError.value = null
  try { await auth.logout() }
  catch { accountError.value = 'logout' }
  finally { loggingOut.value = false }
}
watch(() => auth.session.value, () => { accountError.value = null })
const open = ref(false)
const menuButton = ref<HTMLButtonElement | null>(null)
const targetLocale = computed<PublicSiteLocale>(() => props.locale === 'zh' ? 'en' : 'zh')
const homePath = computed(() => props.locale === 'zh' ? '/zh' : '/en')
const languageTarget = computed(() => {
  try { return switchLocalePath(route.fullPath, targetLocale.value) }
  catch { return switchLocalePath(route.path, targetLocale.value) }
})
const localePreference = useCookie<string | null>(PUBLIC_LOCALE_COOKIE, { ...PUBLIC_LOCALE_COOKIE_OPTIONS, secure: useRequestURL().protocol === 'https:' })
function rememberLocale(): void { localePreference.value = targetLocale.value }
const siteName = computed(() => props.model?.site.name || props.fallbackSiteName)
const navigation = computed(() => props.model?.navigation.header ?? [])
const labels = computed(() => props.locale === 'zh'
  ? { home: '返回首页', nav: '主导航', open: '打开导航', close: '关闭导航', admin: '管理后台', account: '账号', language: 'EN', languageLabel: 'Switch to English' }
  : { home: 'Back to home', nav: 'Primary navigation', open: 'Open navigation', close: 'Close navigation', admin: 'Administration', account: 'Account', language: '中文', languageLabel: '切换到中文' })

function closeNavigation(): void { open.value = false }
watch(() => route.fullPath, closeNavigation)
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (open.value) { open.value = false; menuButton.value?.focus() }
}
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  void auth.load().catch(() => { accountError.value = 'load' })
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <header class="public-header">
    <div class="public-container public-header__inner">
      <NuxtLink class="public-brand" :to="homePath" :aria-label="labels.home">
        <PublicMediaImage
          v-if="model"
          class="public-brand__media"
          :media="model.site.logo"
          :initials="siteName"
          aspect="logo"
          eager
        />
        <span v-else class="public-brand__mark" aria-hidden="true">A</span>
        <span class="public-brand__copy">
          <strong>{{ siteName }}</strong>
          <small>{{ locale === 'zh' ? '学术主页' : 'Academic profile' }}</small>
        </span>
      </NuxtLink>

      <button
        ref="menuButton"
        class="public-menu-button"
        type="button"
        :aria-expanded="open"
        aria-controls="public-primary-navigation"
        :aria-label="open ? labels.close : labels.open"
        @click="open = !open"
      >
        <X v-if="open" :size="21" aria-hidden="true" />
        <Menu v-else :size="21" aria-hidden="true" />
      </button>

      <div id="public-primary-navigation" class="public-navigation" :data-open="open ? 'true' : 'false'">
        <nav class="public-nav" :aria-label="labels.nav">
          <NavigationLink v-for="item in navigation" :key="item.uid" :link="item" />
          <component :is="transferExtension" v-if="transferExtension" :navigation="navigation" :locale="locale" />
        </nav>
      </div>
      <div class="public-header__auth">
        <button v-if="user" class="public-icon-link public-header__auth-button" type="button" :disabled="loggingOut || auth.pending.value" :aria-busy="loggingOut" @click="logout">
          <LogOut :size="16" aria-hidden="true" />{{ loggingOut ? (locale === 'zh' ? '退出中…' : 'Signing out…') : (locale === 'zh' ? '退出' : 'Sign out') }}
        </button>
        <NuxtLink v-else class="public-icon-link public-header__auth-button" :to="loginTarget">
          <LogIn :size="16" aria-hidden="true" />{{ locale === 'zh' ? '登录' : 'Sign in' }}
        </NuxtLink>
        <a v-if="adminPath" class="public-icon-link public-header__auth-button" :href="adminPath" :title="labels.admin">
          <ShieldCheck :size="16" aria-hidden="true" />{{ locale === 'zh' ? '后台' : 'Admin' }}
        </a>
      </div>
    </div>
    <div class="public-header__toolbar">
      <div class="public-container public-header__tools">
        <div class="public-header__reading">
          <span class="public-header__reading-label">{{ locale === 'zh' ? '字号' : 'Text size' }}</span>
          <ReadingControls :model-value="readingMode || 'standard'" :locale="locale" @update:model-value="$emit('update:readingMode', $event)" />
        </div>
        <div class="public-header__actions">
          <NuxtLink v-if="user" class="public-header__username" :to="`/${locale}/account`" :aria-label="`${labels.account} · ${user.displayName || user.username}`" :title="user.displayName || user.username">
            <UserRound :size="16" aria-hidden="true" />
            <span>{{ user.displayName || user.username }}</span>
          </NuxtLink>
          <NuxtLink
            class="public-language-link public-language-switch"
            role="switch"
            :aria-checked="locale === 'en'"
            :data-locale="locale"
            @keydown.space.prevent="($event.currentTarget as HTMLElement).click()"
            :to="languageTarget"
            :aria-label="locale === 'zh' ? '语言：英语' : 'Language: English'"
            :title="labels.languageLabel"
            :hreflang="targetLocale === 'en' ? 'en' : 'zh-CN'"
            @click="rememberLocale"
          >
            <span class="public-language-switch__thumb" aria-hidden="true" />
            <span lang="zh-CN" aria-hidden="true">中</span><span lang="en" aria-hidden="true">EN</span>
          </NuxtLink>
        </div>
        <span v-if="accountError" class="public-header__account-error" role="alert">{{ locale === 'zh' ? (accountError === 'logout' ? '退出失败，请稍后重试。' : '账号状态暂时无法读取，请刷新重试。') : (accountError === 'logout' ? 'Sign-out failed. Please try again.' : 'Account status is unavailable. Please refresh to retry.') }}</span>
      </div>
    </div>
  </header>
</template>
