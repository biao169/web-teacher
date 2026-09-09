<script setup lang="ts">
import { ElAlert, ElButton, ElDialog, ElEmpty, ElInput, ElTable, ElTableColumn } from 'element-plus'
const props = withDefaults(defineProps<{
  modelValue?: string | null
  resource: string
  labelField?: string
  disabled?: boolean
}>(), { modelValue: '', labelField: 'title', disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
const { request } = useCompleteAdminApi()
const open = ref(false), loading = ref(false), error = ref(''), q = ref(''), rows = ref<any[]>([])

function label(row: any): string {
  const value = row?.[props.labelField]
  return value === null || value === undefined || String(value).trim() === '' ? String(row?.uid ?? '') : String(value)
}
async function load() {
  loading.value = true; error.value = ''
  try {
    const value = await request<any>(`/api/v1/admin/content/${encodeURIComponent(props.resource)}`, { query: { page: 1, pageSize: 50, q: q.value } })
    rows.value = Array.isArray(value.items) ? value.items.map((item: any) => ({ uid: item.uid, ...(item.values ?? {}) })) : []
  } catch (e: any) { error.value = e?.data?.error?.message ?? e?.message ?? '关联记录读取失败' }
  finally { loading.value = false }
}
function choose(row: any) { emit('update:modelValue', String(row.uid)); open.value = false }
watch(open, value => { if (value) void load() })
</script>

<template>
  <div class="admin-relation-field">
    <ElInput
      :model-value="modelValue || ''"
      :readonly="disabled"
      clearable
      placeholder="可直接输入 UID，或从已有记录中选择"
      @update:model-value="emit('update:modelValue', String($event || ''))"
      @clear="emit('update:modelValue', null)"
    >
      <template #append><ElButton :disabled="disabled" @click="open=true">选择记录</ElButton></template>
    </ElInput>
    <ElDialog v-model="open" title="选择关联记录" width="min(820px,94vw)" append-to-body destroy-on-close>
      <div class="admin-relation-toolbar"><ElInput v-model="q" clearable placeholder="搜索名称或 UID" @keyup.enter="load" /><ElButton :loading="loading" @click="load">搜索</ElButton></div>
      <ElAlert v-if="error" type="error" :title="error" show-icon :closable="false" />
      <ElTable v-loading="loading" :data="rows" row-key="uid" border stripe>
        <ElTableColumn label="名称" min-width="260"><template #default="{row}"><strong>{{ label(row) }}</strong></template></ElTableColumn>
        <ElTableColumn prop="uid" label="UID" min-width="240" show-overflow-tooltip />
        <ElTableColumn label="操作" width="90"><template #default="{row}"><ElButton type="primary" link @click="choose(row)">选择</ElButton></template></ElTableColumn>
        <template #empty><ElEmpty :description="q ? '没有匹配的记录' : '当前没有可关联记录'" /></template>
      </ElTable>
    </ElDialog>
  </div>
</template>

<style scoped>
.admin-relation-toolbar{display:grid;grid-template-columns:minmax(12rem,1fr) auto;gap:.75rem;margin-bottom:1rem}@media(max-width:640px){.admin-relation-toolbar{grid-template-columns:1fr}}
</style>
