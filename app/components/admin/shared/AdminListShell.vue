<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { ElButton, ElCard } from 'element-plus'

const props = withDefaults(defineProps<{
  eyebrow?: string
  title: string
  description?: string | undefined
  canCreate?: boolean
  createLabel?: string
  creating?: boolean
}>(), {
  eyebrow: '后台管理',
  description: '',
  canCreate: false,
  createLabel: '新建记录',
  creating: false,
})
const emit = defineEmits<{ create: [] }>()
</script>

<template>
  <section class="admin-unified-list-shell">
    <AdminPageHeader :eyebrow="props.eyebrow" :title="props.title" :description="props.description">
      <template #actions>
        <slot name="header-actions">
          <ElButton v-if="props.canCreate" type="primary" :loading="props.creating" @click="emit('create')">
            <Plus :size="16" />{{ props.createLabel }}
          </ElButton>
        </slot>
      </template>
    </AdminPageHeader>
    <ElCard shadow="never" class="admin-unified-list-card">
      <slot />
    </ElCard>
  </section>
</template>
