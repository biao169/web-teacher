<script setup lang="ts">
import AdminFormItem from '../shared/AdminFormItem.vue'
import { ElAlert, ElButton, ElDescriptions, ElDescriptionsItem, ElEmpty, ElForm, ElInput, ElMessage, ElSegmented } from 'element-plus'
type MetadataKind = 'doi' | 'patent'

const props = withDefaults(defineProps<{ initialKind?: MetadataKind }>(), { initialKind: 'doi' })
const route = useRoute()
const kind = ref<MetadataKind>(route.query.type === 'patent' || props.initialKind === 'patent' ? 'patent' : 'doi')
const query = ref('')
const loading = ref(false)
const error = ref('')
const result = ref<Record<string, unknown> | null>(null)

const placeholder = computed(() => kind.value === 'doi' ? '例如：10.1145/1234567.1234568' : '例如：US12345678B2')
const title = computed(() => kind.value === 'doi' ? '论文 DOI 元数据' : '专利元数据')
const rows = computed(() => result.value ? Object.entries(result.value).filter(([, value]) => value !== null && value !== undefined && value !== '') : [])

watch(kind, () => {
  result.value = null
  error.value = ''
})

async function lookup() {
  const value = query.value.trim()
  if (!value) {
    error.value = '请输入查询标识。'
    return
  }
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const endpoint = kind.value === 'doi'
      ? '/api/v1/admin/complete/metadata/doi'
      : '/api/v1/admin/complete/metadata/patent'
    const response = await $fetch<Record<string, unknown>>(endpoint, {
      query: kind.value === 'doi'
        ? { doi: value }
        : { number: value },
      credentials: 'include',
    })
    const candidate = response.data ?? response.metadata ?? response.result ?? response
    result.value = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : { value: candidate }
  } catch (caught) {
    const value = caught as { data?: { error?: { message?: string } }; message?: string }
    error.value = value.data?.error?.message ?? value.message ?? '元数据查询失败。'
  } finally {
    loading.value = false
  }
}

async function copyResult() {
  if (!result.value) return
  await navigator.clipboard.writeText(JSON.stringify(result.value, null, 2))
  ElMessage.success('元数据已复制，可在编辑表单中按需核对后使用。')
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(item => String(item)).join('；')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
</script>

<template>
  <section class="complete-metadata-workspace" aria-labelledby="metadata-workspace-title">
    <header class="workspace-header">
      <div>
        <p class="workspace-eyebrow">外部元数据辅助</p>
        <h2 id="metadata-workspace-title">{{ title }}</h2>
        <p>查询结果仅用于预览和辅助录入，保存前仍经过业务表单校验。</p>
      </div>
      <ElSegmented v-model="kind" :options="[{ label: '论文 DOI', value: 'doi' }, { label: '专利', value: 'patent' }]" />
    </header>

    <ElForm class="lookup-form" @submit.prevent="lookup">
      <AdminFormItem :label="kind === 'doi' ? 'DOI' : '专利号'">
        <ElInput v-model="query" :placeholder="placeholder" clearable @keyup.enter="lookup" />
        <p class="admin-field-help">{{ kind === 'doi' ? '填写完整 DOI 标识；查询结果仅作为论文录入参考。' : '填写公开专利号；查询结果仅作为专利录入参考。' }}</p>
      </AdminFormItem>
      <ElButton type="primary" :loading="loading" @click="lookup">查询元数据</ElButton>
    </ElForm>

    <ElAlert v-if="error" type="error" :title="error" show-icon :closable="false" />

    <ElEmpty v-else-if="!result && !loading" description="输入标识后查询受控元数据服务" />

    <div v-else-if="result" class="metadata-result">
      <div class="result-actions">
        <strong>查询结果</strong>
        <ElButton @click="copyResult">复制 JSON</ElButton>
      </div>
      <ElDescriptions :column="1" border>
        <ElDescriptionsItem v-for="([key, value]) in rows" :key="key" :label="key">
          {{ formatValue(value) }}
        </ElDescriptionsItem>
      </ElDescriptions>
    </div>
  </section>
</template>

<style scoped>
.complete-metadata-workspace { display: grid; gap: 1rem; }
.workspace-header { display: flex; gap: 1rem; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
.workspace-header h2 { margin: .2rem 0; }
.workspace-header p { margin: 0; color: var(--el-text-color-secondary); }
.workspace-eyebrow { font-size: .78rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.lookup-form { display: grid; grid-template-columns: minmax(16rem, 1fr) auto; align-items: end; gap: .75rem; }
.lookup-form :deep(.el-form-item) { margin-bottom: 0; }
.metadata-result { display: grid; gap: .75rem; }
.result-actions { display: flex; justify-content: space-between; align-items: center; }
@media (max-width: 640px) { .lookup-form { grid-template-columns: 1fr; } }
</style>
