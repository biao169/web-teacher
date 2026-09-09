<script setup lang="ts">
import { ArrowRight, Eye, EyeOff, UserPlus } from '@lucide/vue'
import type { RegistrationAvailabilityView } from '~~/shared/contracts/interactions'
import { safeApplicationRedirect } from '~~/shared/utils/redirect'
import { apiErrorDetails } from '~/utils/interaction-errors'

const props = defineProps<{ locale: 'zh' | 'en' }>()
const route = useRoute()
const auth = useAuthSession()
const username = ref('')
const displayName = ref('')
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const receipt = ref<string | null>(null)
const error = ref<{ message: string; requestId: string | null } | null>(null)
const safeNext = computed<string | null>(() => {
  if (typeof route.query.next !== 'string') return null
  const fallback = `/${props.locale}/account`
  const value = safeApplicationRedirect(route.query.next, fallback)
  return value === fallback && route.query.next !== fallback ? null : value
})
const loginDestination = computed(() => ({
  path: `/${props.locale}/login`,
  query: safeNext.value ? { next: safeNext.value } : {},
}))
const { data: availability, error: availabilityError } = await useFetch<RegistrationAvailabilityView>('/api/v1/auth/registration', {
  key: `registration-availability:${props.locale}`,
  server: true,
  lazy: false,
  dedupe: 'defer',
})
const labels = computed(() => props.locale === 'zh' ? {
  username: '用户名', displayName: '显示名称', email: '邮箱（可选）', password: '密码',
  submit: '创建账号', pending: '正在创建…', login: '返回登录', disabled: '当前未开放公开注册。',
  unavailable: '暂时无法读取注册状态。', success: '账号已创建，现在可以登录。', fallback: '注册失败，请稍后重试。',
  hint: `密码至少 ${availability.value?.minimumPasswordLength ?? 6} 个字符。`,
} : {
  username: 'Username', displayName: 'Display name', email: 'Email (optional)', password: 'Password',
  submit: 'Create account', pending: 'Creating…', login: 'Back to sign in', disabled: 'Public registration is currently closed.',
  unavailable: 'Registration status is temporarily unavailable.', success: 'Your account has been created. You can now sign in.', fallback: 'Registration failed. Please try again.',
  hint: `Use at least ${availability.value?.minimumPasswordLength ?? 6} characters.`,
})

async function submit(): Promise<void> {
  error.value = null
  receipt.value = null
  try {
    const result = await auth.register({
      username: username.value,
      password: password.value,
      displayName: displayName.value || null,
      email: email.value || null,
    })
    receipt.value = result.username
    password.value = ''
  }
  catch (cause) {
    const details = apiErrorDetails(cause, labels.value.fallback)
    error.value = { message: details.message, requestId: details.requestId }
  }
}
</script>

<template>
  <div v-if="availabilityError" class="public-form">
    <PublicAuthStatusMessage tone="error">{{ labels.unavailable }}</PublicAuthStatusMessage>
  </div>
  <div v-else-if="availability?.authenticated" class="public-form">
    <PublicAuthStatusMessage>{{ locale === 'zh' ? '当前已有账号登录。' : 'An account is already signed in.' }}</PublicAuthStatusMessage>
    <NuxtLink class="public-form-submit" :to="`/${locale}/account`">{{ locale === 'zh' ? '查看账号' : 'View account' }}</NuxtLink>
  </div>
  <div v-else-if="!availability?.enabled" class="public-form">
    <PublicAuthStatusMessage>{{ labels.disabled }}</PublicAuthStatusMessage>
    <NuxtLink class="public-form-submit" :to="loginDestination">{{ labels.login }}</NuxtLink>
  </div>
  <div v-else-if="receipt" class="public-form">
    <PublicAuthStatusMessage tone="success">{{ labels.success }}</PublicAuthStatusMessage>
    <dl class="public-account-summary"><div><dt>{{ labels.username }}</dt><dd>{{ receipt }}</dd></div></dl>
    <NuxtLink class="public-form-submit" :to="{ path: `/${locale}/login`, query: { username: receipt, ...(safeNext ? { next: safeNext } : {}) } }">
      {{ labels.login }}<ArrowRight :size="16" aria-hidden="true" />
    </NuxtLink>
  </div>
  <form v-else class="public-form" @submit.prevent="submit">
    <PublicAuthStatusMessage v-if="error" tone="error" :request-id="error.requestId">{{ error.message }}</PublicAuthStatusMessage>
    <label class="public-field"><span>{{ labels.username }}</span><input v-model.trim="username" autocomplete="username" maxlength="64" pattern="[A-Za-z][A-Za-z0-9._-]{2,63}" required></label>
    <label class="public-field"><span>{{ labels.displayName }}</span><input v-model.trim="displayName" autocomplete="name" maxlength="128"></label>
    <label class="public-field"><span>{{ labels.email }}</span><input v-model.trim="email" type="email" autocomplete="email" maxlength="320"></label>
    <label class="public-field">
      <span>{{ labels.password }}</span>
      <span class="public-password-field">
        <input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" minlength="6" maxlength="256" required>
        <button type="button" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword"><EyeOff v-if="showPassword" :size="18" aria-hidden="true" /><Eye v-else :size="18" aria-hidden="true" /></button>
      </span>
      <small>{{ labels.hint }}</small>
    </label>
    <button class="public-form-submit" type="submit" :disabled="auth.pending.value"><UserPlus :size="18" aria-hidden="true" />{{ auth.pending.value ? labels.pending : labels.submit }}</button>
    <div class="public-form-links"><NuxtLink :to="loginDestination">{{ labels.login }}<ArrowRight :size="15" aria-hidden="true" /></NuxtLink></div>
  </form>
</template>
