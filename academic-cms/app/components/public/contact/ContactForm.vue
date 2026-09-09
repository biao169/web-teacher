<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CheckCircle2, Send } from '@lucide/vue'
import type { ContactAvailabilityView, ContactMessageType, ContactReceiptView } from '~~/shared/contracts/interactions'
import { apiErrorDetails } from '~/utils/interaction-errors'
import { requestBackoffSeconds } from '~/utils/request-backoff'

const props = defineProps<{ locale: 'zh' | 'en'; news?: { uid: string; title: string } }>()
const auth = useAuthSession()
const route = useRoute()
const availability = ref<ContactAvailabilityView | null>(null)
const loading = ref(true)
const availabilityError = ref(false)
const name = ref('')
const email = ref('')
const messageType = ref<ContactMessageType>(props.news ? 'other' : 'collaboration')
const initialSubject = () => props.news ? [...props.news.title].slice(0, 200).join('') : ''
const subject = ref(initialSubject())
const content = ref('')
const website = ref('')
const pending = ref(false)
const receipt = ref<ContactReceiptView | null>(null)
const error = ref<{ message: string; requestId: string | null } | null>(null)
const retryIn = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
let disposed = false
let initializing = false
const controller = new AbortController()

const labels = computed(() => props.locale === 'zh' ? {
  disabled: '当前未开放匿名留言，请登录后提交。', unavailable: '暂时无法读取留言设置，请稍后重试。', login: '前往登录', loading: '正在准备留言区…', retry: '重试',
  name: '姓名', email: '邮箱', type: '留言类型', subject: '主题', content: '留言内容', hint: '请填写至少 20 个字符。', submit: '提交留言', pending: '正在提交…',
  success: '留言已提交，我们会在后台查看。', another: '再写一条', reference: '回执编号', fallback: '留言提交失败，请稍后重试。', cooldown: `操作较频繁，请在 ${retryIn.value} 秒后重试。`,
  types: { admissions: '招生', collaboration: '合作', publication: '论文', project: '项目', course: '课程', other: '其他' },
} : {
  disabled: 'Anonymous messages are closed. Sign in before submitting.', unavailable: 'Contact settings are temporarily unavailable. Please try again.', login: 'Sign in', loading: 'Preparing the message form…', retry: 'Retry',
  name: 'Name', email: 'Email', type: 'Message type', subject: 'Subject', content: 'Message', hint: 'Please enter at least 20 characters.', submit: 'Send message', pending: 'Sending…',
  success: 'Your message was submitted to the team.', another: 'Send another', reference: 'Reference', fallback: 'The message could not be submitted. Please try again.', cooldown: `Please wait ${retryIn.value} seconds before trying again.`,
  types: { admissions: 'Admissions', collaboration: 'Collaboration', publication: 'Publication', project: 'Project', course: 'Course', other: 'Other' },
})
const enabled = computed(() => Boolean(availability.value?.enabled))
const anonymousRequired = computed(() => !auth.session.value.authenticated)

function cooldown(cause: unknown): void {
  const seconds = requestBackoffSeconds(cause)
  if (!seconds || disposed) return
  clearInterval(timer)
  retryIn.value = seconds
  const deadline = Date.now() + seconds * 1000
  timer = setInterval(() => {
    retryIn.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    if (!retryIn.value) clearInterval(timer)
  }, 1000)
}
async function initialize(force = false): Promise<void> {
  if (initializing || retryIn.value || disposed) return
  initializing = true; loading.value = true; availabilityError.value = false
  try {
    await auth.load(force)
    if (disposed) return
    availability.value = await $fetch<ContactAvailabilityView>('/api/v1/public/contact', { retry: 0, signal: controller.signal })
  } catch (cause) {
    if (!disposed) { availabilityError.value = true; cooldown(cause) }
  } finally { initializing = false; loading.value = false }
}
async function submit(): Promise<void> {
  if (pending.value || retryIn.value || !enabled.value || loading.value || disposed) return
  pending.value = true; error.value = null; receipt.value = null
  try {
    const headers: Record<string, string> = {}
    if (auth.session.value.authenticated) headers['x-csrf-token'] = auth.session.value.csrfToken
    receipt.value = await $fetch<ContactReceiptView>('/api/v1/public/contact', {
      method: 'POST', headers, retry: 0,
      body: { ...(props.news ? { newsUid: props.news.uid } : {}), name: name.value || null, email: email.value || null, messageType: messageType.value, subject: subject.value, content: content.value, website: website.value || null },
    })
    subject.value = initialSubject(); content.value = ''; website.value = ''
  } catch (cause) {
    if (disposed) return
    cooldown(cause)
    const detail = apiErrorDetails(cause, labels.value.fallback)
    const messages: Record<string, string> = props.locale === 'en' ? {
      INTERACTION_INPUT: 'Check your name, email and message length.', INTERACTION_AUTH_REQUIRED: 'Please sign in before submitting.',
      INTERACTION_DISABLED: 'Messages are currently closed for this page.',
    } : {}
    error.value = { message: messages[detail.code] ?? detail.message, requestId: detail.requestId }
  } finally { pending.value = false }
}
function reset(): void { receipt.value = null; error.value = null; void initialize(true) }
onMounted(() => { void initialize() })
onBeforeUnmount(() => { disposed = true; controller.abort(); clearInterval(timer) })
</script>

<template>
  <div v-if="loading" class="public-form" role="status">{{ labels.loading }}</div>
  <div v-else-if="availabilityError" class="public-form">
    <PublicAuthStatusMessage tone="error">{{ retryIn ? labels.cooldown : labels.unavailable }}</PublicAuthStatusMessage>
    <button class="public-form-submit" type="button" :disabled="retryIn > 0" @click="initialize(true)">{{ labels.retry }}</button>
  </div>
  <div v-else-if="!enabled" class="public-form">
    <PublicAuthStatusMessage>{{ labels.disabled }}</PublicAuthStatusMessage>
    <NuxtLink class="public-form-submit" :to="{ path: `/${locale}/login`, query: { next: route.fullPath || `/${locale}/contact` } }">{{ labels.login }}</NuxtLink>
  </div>
  <div v-else-if="receipt" class="public-form public-contact-receipt" role="status">
    <CheckCircle2 :size="38" aria-hidden="true" />
    <PublicAuthStatusMessage tone="success">{{ labels.success }}</PublicAuthStatusMessage>
    <dl class="public-account-summary"><div><dt>{{ labels.reference }}</dt><dd><code>{{ receipt.reference }}</code></dd></div></dl>
    <button class="public-form-submit" type="button" @click="reset">{{ labels.another }}</button>
  </div>
  <form v-else class="public-form" :aria-busy="pending" @submit.prevent="submit">
    <PublicAuthStatusMessage v-if="error || retryIn" tone="error" :request-id="error?.requestId ?? null">{{ retryIn ? labels.cooldown : error?.message }}</PublicAuthStatusMessage>
    <div class="public-form-grid">
      <label class="public-field"><span>{{ labels.name }}</span><input v-model.trim="name" autocomplete="name" :required="anonymousRequired" :maxlength="availability?.limits.name || 120"></label>
      <label class="public-field"><span>{{ labels.email }}</span><input v-model.trim="email" type="email" autocomplete="email" :required="anonymousRequired" :maxlength="availability?.limits.email || 320"></label>
    </div>
    <label v-if="!news" class="public-field"><span>{{ labels.type }}</span><select v-model="messageType"><option v-for="type in availability?.messageTypes || []" :key="type" :value="type">{{ labels.types[type] }}</option></select></label>
    <label class="public-field"><span>{{ labels.subject }}</span><input v-model.trim="subject" required minlength="3" :maxlength="availability?.limits.subject || 200"></label>
    <label class="public-field"><span>{{ labels.content }}</span><textarea v-model="content" required minlength="20" :maxlength="availability?.limits.content || 10000" rows="6" :placeholder="labels.hint"></textarea></label>
    <label class="public-honeypot" aria-hidden="true" tabindex="-1"><span>Website</span><input v-model="website" name="website" autocomplete="off" tabindex="-1"></label>
    <button class="public-form-submit" type="submit" :disabled="pending || retryIn > 0"><Send :size="18" aria-hidden="true" />{{ pending ? labels.pending : labels.submit }}</button>
  </form>
</template>
