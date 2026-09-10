<script setup lang="ts">
import { ElAlert, ElButton, ElDialog, ElForm, ElInput } from 'element-plus'
import { ElOption, ElSelect } from '~/admin/element-plus-ts6'
import type { PublicFilterGroup } from '~~/shared/contracts/public-content'
import { PUBLIC_LIST_TARGETS, normalizePublicListHref, publicListDefinition, publicListHref, unpackPublicListQuery } from '~~/shared/utils/public-list-link'
import AdminFormItem from './AdminFormItem.vue'

const props = defineProps<{ path?: string | null; preset?: string | null; fragment?: string | null; disabled?: boolean }>()
const emit = defineEmits<{ apply: [path: string] }>()
const visible = ref(false)
const module = ref('publications')
const search = ref('')
const values = reactive<Record<string, string>>({})
const pageSize = ref('12')
const selectedFragment = ref('')
const groups = ref<PublicFilterGroup[]>([])
const loading = ref(false)
const candidateError = ref('')
const initialError = ref('')
const candidateLoading = reactive<Record<string, boolean>>({})
const searches = new Map<string, number>()
let generation = 0
const selected = computed(() => PUBLIC_LIST_TARGETS.find(target => target.module === module.value)!)
const fields = computed(() => Object.entries(selected.value.filters))
const link = computed(() => {
  try {
    const filters = Object.fromEntries(fields.value.map(([key]) => [key, values[key] || null]))
    const path = publicListHref(`/${module.value}`, { ...filters, q: search.value, pageSize: pageSize.value }, {}, selectedFragment.value)
    if (path.length > 2000) throw new Error('筛选链接过长，请减少筛选内容。')
    return { path, error: '' }
  } catch { return { path: '', error: '筛选内容过长或含无效字符。关键词最多 256 字节，单项筛选最多 192 字节，链接最多 2000 个字符。' } }
})
function open(): void {
  if (props.disabled) return
  initialError.value = ''
  for (const key of Object.keys(values)) Reflect.deleteProperty(values, key)
  search.value = ''; pageSize.value = '12'; selectedFragment.value = ''
  module.value = publicListDefinition(props.preset === 'featured_publications' ? 'publications/featured' : props.preset || '')?.module || 'publications'
  if (props.path) {
    try {
      const url = new URL(props.path, 'https://public.invalid')
      const target = publicListDefinition(url.pathname)
      if (!target) throw new Error('Not a list')
      const canonical = normalizePublicListHref(`${url.pathname}${url.search}`)
      const query = unpackPublicListQuery(Object.fromEntries(new URL(canonical, url).searchParams))
      module.value = target.module
      search.value = String(query.q ?? '')
      pageSize.value = String(query.pageSize ?? '12')
      selectedFragment.value = url.hash
      for (const key of Object.keys(target.filters)) values[key] = String(query[key] ?? '')
    } catch { initialError.value = '原路径不是有效的列表筛选链接。应用后将替换原路径；取消会保留原值。' }
  }
  if (props.fragment) selectedFragment.value = `#${props.fragment}`
  visible.value = true
}
function options(key: string) { return groups.value.find(group => group.key === key)?.options ?? [] }
async function searchOptions(key: string, keyword: string): Promise<void> {
  const ticket = (searches.get(key) ?? 0) + 1
  searches.set(key, ticket)
  const owner = module.value
  const ownerGeneration = generation
  candidateLoading[key] = true
  try {
    const conditions = Object.fromEntries(fields.value.filter(([field]) => field !== key && values[field]).map(([field]) => [field, values[field]]))
    const result = await $fetch<{ options: PublicFilterGroup['options'] }>('/api/v1/public/filter-options', {
      query: { locale: 'zh', module: owner, field: key, candidate: keyword, candidatePage: 1, q: search.value || undefined, ...conditions }, timeout: 10000,
    })
    if (owner !== module.value || ownerGeneration !== generation || ticket !== searches.get(key)) return
    const previous = options(key).find(option => option.value === values[key])
    const candidates = [...result.options]
    if (previous && !candidates.some(option => option.value === previous.value)) candidates.unshift(previous)
    groups.value = [...groups.value.filter(group => group.key !== key), { key, label: key, options: candidates }]
    candidateError.value = ''
  } catch {
    if (owner === module.value && ownerGeneration === generation && ticket === searches.get(key)) candidateError.value = '候选搜索失败，可重试或直接输入筛选值。'
  } finally { if (ticket === searches.get(key)) candidateLoading[key] = false }
}
function changeModule(): void {
  for (const key of Object.keys(values)) Reflect.deleteProperty(values, key)
}
watch([visible, module], async ([isOpen, currentModule]) => {
  const requestGeneration = ++generation
  groups.value = []; candidateError.value = ''; loading.value = false
  if (!isOpen) return
  loading.value = true
  try {
    const result = await $fetch<{ filters: PublicFilterGroup[] }>(`/api/v1/public/${currentModule}`, { query: { locale: 'zh' }, timeout: 10000 })
    if (requestGeneration === generation) groups.value = result.filters
  } catch {
    if (requestGeneration === generation) candidateError.value = '现有候选项读取失败，可关闭后重新打开工具重试，或直接输入筛选值。'
  } finally { if (requestGeneration === generation) loading.value = false }
})
function apply(): void {
  if (props.disabled || !link.value.path) return
  emit('apply', link.value.path)
  visible.value = false
}
</script>

<template>
  <div class="navigation-filter-tool">
    <ElButton type="primary" plain :disabled="disabled" @click="open">配置筛选按钮</ElButton>
    <small>选择列表与基础条件；保存后，访问者只能在此范围内继续搜索和筛选。</small>
    <ElDialog v-model="visible" title="配置筛选按钮" width="min(92vw, 680px)" append-to-body destroy-on-close :close-on-click-modal="false">
      <ElAlert v-if="initialError" :title="initialError" type="warning" :closable="false" />
      <ElForm label-position="top" class="navigation-filter-form" @submit.prevent="apply">
        <AdminFormItem label="目标列表" required>
          <ElSelect v-model="module" aria-label="目标列表" @change="changeModule">
            <ElOption v-for="target in PUBLIC_LIST_TARGETS" :key="target.module" :value="target.module" :label="target.label" />
          </ElSelect>
        </AdminFormItem>
        <AdminFormItem label="搜索关键词">
          <ElInput v-model="search" aria-label="搜索关键词" placeholder="可留空；与下方筛选条件同时生效" />
        </AdminFormItem>
        <AdminFormItem v-for="[key, label] in fields" :key="key" :label="label">
          <ElSelect v-model="values[key]" :aria-label="label" filterable remote :remote-method="(keyword: string) => searchOptions(key, keyword)" allow-create default-first-option clearable :loading="loading || candidateLoading[key]" placeholder="搜索已有值或输入后按回车；留空不限">
            <ElOption v-for="option in options(key)" :key="option.value" :value="option.value" :label="option.label" />
          </ElSelect>
        </AdminFormItem>
        <AdminFormItem label="每页条数">
          <ElSelect v-model="pageSize" aria-label="每页条数"><ElOption v-for="size in [12, 24, 36]" :key="size" :value="String(size)" :label="String(size)" /></ElSelect>
        </AdminFormItem>
        <ElAlert v-if="candidateError" :title="candidateError" type="warning" :closable="false" />
        <ElAlert v-if="link.error" :title="link.error" type="error" :closable="false" />
        <div v-else class="navigation-filter-preview">
          <small>预览匹配内容（新标签页）；保存并通过导航进入后固定范围</small>
          <a :href="`/zh${link.path}`" target="_blank" rel="noopener noreferrer">中文列表</a>
          <a :href="`/en${link.path}`" target="_blank" rel="noopener noreferrer">English list</a>
          <code>{{ link.path }}</code>
        </div>
      </ElForm>
      <template #footer>
        <ElButton @click="visible = false">取消</ElButton>
        <ElButton type="primary" :disabled="disabled || !link.path" @click="apply">应用到编辑区</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.navigation-filter-tool{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;width:100%;margin-top:.4rem}
.navigation-filter-tool small{color:var(--el-text-color-secondary)}
.navigation-filter-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 1rem}
.navigation-filter-form :deep(.el-select){width:100%}
.navigation-filter-form>.el-alert,.navigation-filter-preview{grid-column:1/-1}
.navigation-filter-preview{display:flex;flex-wrap:wrap;gap:.5rem 1rem}
.navigation-filter-preview small,.navigation-filter-preview code{width:100%}
.navigation-filter-preview code{overflow-wrap:anywhere;color:var(--el-text-color-secondary)}
@media(max-width:560px){.navigation-filter-form{grid-template-columns:minmax(0,1fr)}}
</style>
