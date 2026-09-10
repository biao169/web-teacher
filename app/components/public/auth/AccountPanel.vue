<script setup lang="ts">
import { KeyRound, LogOut, MonitorX, RefreshCw, ShieldCheck, UserRound } from '@lucide/vue'
import { apiErrorDetails } from '~/utils/interaction-errors'

const props = defineProps<{ locale: 'zh' | 'en' }>()
const auth = useAuthSession()
const error = ref<{ message: string; requestId: string | null } | null>(null)
const notice = ref<string | null>(null)
await auth.load()

const labels = computed(() => props.locale === 'zh' ? {
  anonymous: '当前未登录。', signIn: '前往登录', user: '账号', role: '角色', expiry: '本次登录到期时间',
  refresh: '刷新登录状态', password: '修改密码', logout: '退出当前设备', revoke: '退出所有设备',
  revokeConfirm: '确定撤销该账号的全部登录状态吗？当前设备也会退出。', refreshed: '登录状态已刷新。',
  revoked: '已撤销全部登录状态。', fallback: '操作失败，请稍后重试。', required: '必须修改密码后才能继续使用普通后台功能。',
} : {
  anonymous: 'You are not signed in.', signIn: 'Sign in', user: 'Account', role: 'Role', expiry: 'Session expires',
  refresh: 'Refresh session', password: 'Change password', logout: 'Sign out on this device', revoke: 'Sign out everywhere',
  revokeConfirm: 'Revoke every active session for this account? This device will also be signed out.', refreshed: 'Session refreshed.',
  revoked: 'All sessions were revoked.', fallback: 'The operation failed. Please try again.', required: 'Change your password before using ordinary administration features.',
})

async function refresh(): Promise<void> {
  error.value = null; notice.value = null
  try { await auth.refresh(); notice.value = labels.value.refreshed }
  catch (cause) { const d = apiErrorDetails(cause, labels.value.fallback); error.value = { message: d.message, requestId: d.requestId } }
}
async function logout(): Promise<void> {
  error.value = null
  try { await auth.logout(); await navigateTo(`/${props.locale}/login`) }
  catch (cause) { const d = apiErrorDetails(cause, labels.value.fallback); error.value = { message: d.message, requestId: d.requestId } }
}
async function revokeAll(): Promise<void> {
  if (import.meta.client && !window.confirm(labels.value.revokeConfirm)) return
  error.value = null
  try { await auth.revokeAll(); notice.value = labels.value.revoked; await navigateTo(`/${props.locale}/login`) }
  catch (cause) { const d = apiErrorDetails(cause, labels.value.fallback); error.value = { message: d.message, requestId: d.requestId } }
}
</script>

<template>
  <div v-if="!auth.session.value.authenticated" class="public-form">
    <PublicAuthStatusMessage>{{ labels.anonymous }}</PublicAuthStatusMessage>
    <NuxtLink class="public-form-submit" :to="{ path: `/${locale}/login`, query: { next: `/${locale}/account` } }">{{ labels.signIn }}</NuxtLink>
  </div>
  <div v-else class="public-account-panel">
    <PublicAuthStatusMessage v-if="auth.session.value.user.mustChangePassword" tone="error">{{ labels.required }}</PublicAuthStatusMessage>
    <PublicAuthStatusMessage v-if="notice" tone="success">{{ notice }}</PublicAuthStatusMessage>
    <PublicAuthStatusMessage v-if="error" tone="error" :request-id="error.requestId">{{ error.message }}</PublicAuthStatusMessage>
    <div class="public-account-avatar" aria-hidden="true"><UserRound :size="30" /></div>
    <dl class="public-account-summary">
      <div><dt>{{ labels.user }}</dt><dd>{{ auth.session.value.user.displayName || auth.session.value.user.username }} <small>@{{ auth.session.value.user.username }}</small></dd></div>
      <div><dt>{{ labels.role }}</dt><dd>{{ auth.session.value.user.role.name }}</dd></div>
      <div><dt>{{ labels.expiry }}</dt><dd><time :datetime="auth.session.value.expiresAt">{{ new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(auth.session.value.expiresAt)) }} UTC</time></dd></div>
    </dl>
    <div class="public-account-actions">
      <button type="button" class="public-form-action" :disabled="auth.pending.value" @click="refresh"><RefreshCw :size="17" aria-hidden="true" />{{ labels.refresh }}</button>
      <NuxtLink class="public-form-action" :to="`/${locale}/account/password`"><KeyRound :size="17" aria-hidden="true" />{{ labels.password }}</NuxtLink>
      <a v-if="auth.session.value.user.permissions.dashboard?.view" class="public-form-action" href="/admin"><ShieldCheck :size="17" aria-hidden="true" />{{ locale === 'zh' ? '管理后台' : 'Administration' }}</a>
      <button type="button" class="public-form-action" :disabled="auth.pending.value" @click="logout"><LogOut :size="17" aria-hidden="true" />{{ labels.logout }}</button>
      <button type="button" class="public-form-action public-form-action--danger" :disabled="auth.pending.value" @click="revokeAll"><MonitorX :size="17" aria-hidden="true" />{{ labels.revoke }}</button>
    </div>
  </div>
</template>
