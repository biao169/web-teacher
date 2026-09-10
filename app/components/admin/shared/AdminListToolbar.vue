<script setup lang="ts">
import { RefreshCw, Search, SlidersHorizontal } from '@lucide/vue'
import { ElButton, ElInput } from 'element-plus'

const props = withDefaults(defineProps<{
  modelValue: string
  searchPlaceholder?: string
  loading?: boolean
  selectedCount?: number
  canBatch?: boolean
}>(), {
  searchPlaceholder: '搜索当前模块',
  loading: false,
  selectedCount: 0,
  canBatch: false,
})
const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: []
  refresh: []
  batch: []
}>()
</script>

<template>
  <section class="admin-unified-toolbar" aria-label="列表搜索与操作">
    <form class="admin-unified-toolbar__search" role="search" @submit.prevent="emit('search')">
      <ElInput
        :model-value="props.modelValue"
        clearable
        type="search"
        :aria-label="props.searchPlaceholder"
        :placeholder="props.searchPlaceholder"
        @update:model-value="value => emit('update:modelValue', String(value ?? ''))"
        @clear="emit('search')"
      >
        <template #prefix><Search :size="16" /></template>
      </ElInput>
      <ElButton native-type="submit">搜索</ElButton>
    </form>

    <div class="admin-unified-toolbar__actions">
      <ElButton :loading="props.loading" @click="emit('refresh')"><RefreshCw :size="15" />刷新</ElButton>
      <ElButton v-if="props.canBatch && props.selectedCount" type="warning" plain @click="emit('batch')">
        <SlidersHorizontal :size="15" />批量更新（{{ props.selectedCount }}）
      </ElButton>
      <slot name="actions" />
    </div>
  </section>
</template>
