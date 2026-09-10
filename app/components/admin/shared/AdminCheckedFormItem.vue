<script setup lang="ts">
import { ElButton, ElTag } from 'element-plus'
import AdminFormItem from './AdminFormItem.vue'
import { adminErrorDetails } from '~/admin/errors'
import {
  adminDuplicateRule,
  type AdminDuplicateCheckResult,
  type AdminIdentityResource,
} from '~~/shared/admin/identity'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  resource: AdminIdentityResource
  field: string
  value: unknown
  label: string
  labelMark?: string
  required?: boolean
  error?: string
  excludeUid?: string | null
}>(), { labelMark: '', required: false, error: '', excludeUid: null })

const { request } = useCompleteAdminApi()
const checking = ref(false)
const result = shallowRef<AdminDuplicateCheckResult | null>(null)
const checkError = ref('')
let requestVersion = 0
const rule = computed(() => adminDuplicateRule(props.resource, props.field))
const checkable = computed(() => typeof props.value === 'string' && props.value.trim().length > 0)

watch(() => [props.value, props.excludeUid], () => {
  requestVersion += 1
  checking.value = false
  result.value = null
  checkError.value = ''
})

async function check(): Promise<void> {
  if (!rule.value || !checkable.value || checking.value) return
  checking.value = true
  const version = ++requestVersion
  checkError.value = ''
  result.value = null
  try {
    const query = new URLSearchParams({
      resource: props.resource,
      field: props.field,
      value: String(props.value),
    })
    if (props.excludeUid) query.set('excludeUid', props.excludeUid)
    const response = await request<AdminDuplicateCheckResult>(`/api/v1/admin/complete/duplicates/check?${query.toString()}`)
    if (version === requestVersion) result.value = response
  }
  catch (failure) { if (version === requestVersion) checkError.value = adminErrorDetails(failure, '查重失败，请稍后重试。').message }
  finally { if (version === requestVersion) checking.value = false }
}
</script>

<template>
  <AdminFormItem v-bind="$attrs" :label="label" :label-mark="labelMark" :required="required" :error="error">
    <template v-if="rule" #label-actions>
      <ElButton text type="primary" size="small" :loading="checking" :disabled="!checkable" @click.prevent="check">数据库查重</ElButton>
    </template>
    <slot />
    <div v-if="checkError" class="admin-duplicate-result is-error" role="alert">{{ checkError }}</div>
    <div v-else-if="result" class="admin-duplicate-result" :class="result.matches.length ? (result.mode === 'hard' ? 'is-hard' : 'is-warning') : 'is-clear'" aria-live="polite">
      <template v-if="!result.matches.length">未发现重复记录。</template>
      <template v-else>
        <span>{{ result.mode === 'hard' ? '发现相同值，保存会被拒绝：' : '发现可能重复的记录，请确认：' }}</span>
        <span class="admin-duplicate-links">
          <a v-for="match in result.matches" :key="match.uid" :href="match.adminPath" target="_blank" rel="noopener noreferrer">{{ match.title }}</a>
        </span>
        <ElTag v-if="result.truncated" size="small" type="info">仅显示前 10 条</ElTag>
      </template>
    </div>
  </AdminFormItem>
</template>

<style scoped>
.admin-duplicate-result{display:flex;width:100%;flex-wrap:wrap;align-items:center;gap:.35rem;margin-top:.28rem;padding:.38rem .5rem;border-radius:.45rem;font-size:var(--admin-font-size-caption);line-height:1.42}.admin-duplicate-result.is-clear{color:var(--el-color-success-dark-2);background:var(--el-color-success-light-9)}.admin-duplicate-result.is-warning{color:var(--el-color-warning-dark-2);background:var(--el-color-warning-light-9)}.admin-duplicate-result.is-hard,.admin-duplicate-result.is-error{color:var(--el-color-danger-dark-2);background:var(--el-color-danger-light-9)}.admin-duplicate-links{display:inline-flex;flex-wrap:wrap;gap:.35rem}.admin-duplicate-links a{color:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px}
</style>
