<script setup lang="ts">
import { ElAlert, ElButton, ElEmpty, ElForm, ElInput, ElMessage, ElTable, ElTableColumn } from 'element-plus'
import { ElOption, ElSelect } from '~/admin/element-plus-ts6'

const modules = [
  { value: 'profiles', label: '教师与团队' },
  { value: 'publications', label: '论文' },
  { value: 'projects', label: '项目' },
  { value: 'patents', label: '专利与软件著作' },
  { value: 'students', label: '学生' },
  { value: 'news', label: '新闻动态' },
  { value: 'courses', label: '课程' },
]
const fields: Record<string, { value: string; label: string }[]> = {
  profiles: [{ value: 'role', label: '角色' }, { value: 'title', label: '职称' }, { value: 'organization', label: '单位' }, { value: 'lab', label: '实验室' }],
  publications: [{ value: 'venue', label: '期刊/会议' }, { value: 'year', label: '年份' }, { value: 'publication_type', label: '论文类型' }, { value: 'author_role', label: '作者角色' }, { value: 'index_type', label: '收录类型' }, { value: 'display_tags', label: '展示标签' }],
  projects: [{ value: 'source', label: '项目来源' }, { value: 'fund_name', label: '基金/计划' }, { value: 'project_role', label: '承担角色' }, { value: 'principal', label: '负责人' }, { value: 'status', label: '状态' }],
  patents: [{ value: 'country', label: '国家或地区' }, { value: 'patent_type', label: '类型' }, { value: 'owner', label: '权利人' }, { value: 'legal_status', label: '法律状态' }],
  students: [{ value: 'degree', label: '培养层次' }, { value: 'category', label: '分类' }, { value: 'grade', label: '年级' }, { value: 'direction', label: '方向' }, { value: 'status', label: '状态' }],
  news: [{ value: 'category', label: '分类' }],
  courses: [{ value: 'semester', label: '学期' }, { value: 'audience', label: '授课对象' }],
}

const module = ref('publications')
const field = ref('venue')
const query = ref('')
const loading = ref(false)
const items = ref<string[]>([])
const error = ref('')
const availableFields = computed(() => fields[module.value] ?? [])

watch(module, () => {
  field.value = availableFields.value[0]?.value ?? ''
  items.value = []
})

async function search() {
  loading.value = true
  error.value = ''
  try {
    const response = await $fetch<Record<string, unknown>>('/api/v1/admin/complete/suggestions', {
      query: { module: module.value, field: field.value, q: query.value.trim() },
      credentials: 'include',
    })
    const values = response.items ?? response.suggestions ?? response.data ?? response.values ?? []
    items.value = Array.isArray(values)
      ? values.map(item => typeof item === 'string' ? item : String((item as Record<string, unknown>)?.value ?? '')).filter(Boolean)
      : []
  } catch (caught) {
    const value = caught as { data?: { error?: { message?: string } }; message?: string }
    error.value = value.data?.error?.message ?? value.message ?? '历史值查询失败。'
    items.value = []
  } finally {
    loading.value = false
  }
}

async function copy(value: string) {
  await navigator.clipboard.writeText(value)
  ElMessage.success('已复制历史值。')
}
</script>

<template>
  <section class="suggestion-workspace" aria-labelledby="suggestion-title">
    <header>
      <p>辅助输入</p>
      <h2 id="suggestion-title">历史值建议</h2>
      <span>按模块和字段读取去重后的历史值，便于核对命名和录入格式。</span>
    </header>

    <ElForm class="suggestion-filters" @submit.prevent="search">
      <ElSelect v-model="module" aria-label="业务模块">
        <ElOption v-for="item in modules" :key="item.value" :label="item.label" :value="item.value" />
      </ElSelect>
      <ElSelect v-model="field" aria-label="字段">
        <ElOption v-for="item in availableFields" :key="item.value" :label="item.label" :value="item.value" />
      </ElSelect>
      <ElInput v-model="query" placeholder="输入前缀，可留空查看常用值" clearable @keyup.enter="search" />
      <ElButton type="primary" :loading="loading" @click="search">查询</ElButton>
    </ElForm>

    <ElAlert v-if="error" type="error" :title="error" :closable="false" show-icon />
    <ElEmpty v-else-if="!items.length && !loading" description="选择模块和字段后查询历史值" />
    <ElTable v-else :data="items.map(value => ({ value }))" stripe>
      <ElTableColumn prop="value" label="历史值" min-width="320" />
      <ElTableColumn label="操作" width="100">
        <template #default="scope"><ElButton link type="primary" @click="copy(scope.row.value)">复制</ElButton></template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped>
.suggestion-workspace { display: grid; gap: 1rem; }
.suggestion-workspace header p { margin: 0; font-size: .78rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.suggestion-workspace header h2 { margin: .2rem 0; }
.suggestion-workspace header span { color: var(--el-text-color-secondary); }
.suggestion-filters { display: grid; grid-template-columns: 12rem 12rem minmax(16rem, 1fr) auto; gap: .75rem; }
@media (max-width: 800px) { .suggestion-filters { grid-template-columns: 1fr; } }
</style>
