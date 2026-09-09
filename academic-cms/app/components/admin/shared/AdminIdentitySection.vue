<script setup lang="ts">
import { Copy, RefreshCw } from '@lucide/vue'
import { ElButton, ElInput, ElMessage } from 'element-plus'
import {
  ADMIN_UID_PATTERN,
  suggestedAdminUid,
  type AdminIdentityResource,
} from '~~/shared/admin/identity'
import AdminCheckedFormItem from './AdminCheckedFormItem.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  resource: AdminIdentityResource
  existing?: boolean
  disabled?: boolean
  error?: string
  sectionId?: string
}>(), { existing: false, disabled: false, error: '', sectionId: 'admin-form-identity-uid' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const localError = computed(() => {
  if (props.error) return props.error
  if (!props.modelValue.trim()) return '数据库 UID 不能为空。'
  if (!ADMIN_UID_PATTERN.test(props.modelValue)) return '仅支持字母、数字、冒号、点、下划线和短横线，最长 128 个字符。'
  return ''
})

function regenerate(): void {
  if (props.existing || props.disabled) return
  emit('update:modelValue', suggestedAdminUid(props.resource))
}
async function copyUid(): Promise<void> {
  if (!props.modelValue) return
  try {
    await navigator.clipboard.writeText(props.modelValue)
    ElMessage.success('UID 已复制')
  }
  catch { ElMessage.error('无法复制 UID，请手动选择复制。') }
}
</script>

<template>
  <section :id="sectionId" class="admin-form-section admin-identity-section">
    <header><div><small>稳定标识</small><h2>数据库 UID</h2><p>用于跨平台备份、恢复和对象关联；创建后不可修改。</p></div></header>
    <div class="admin-form-grid">
      <AdminCheckedFormItem
        class="is-wide"
        label="数据库 UID"
        :resource="resource"
        field="uid"
        :value="modelValue"
        :exclude-uid="existing ? modelValue : null"
        :required="true"
        :error="localError"
        data-admin-field="uid"
        data-complete-field="uid"
      >
        <div class="admin-uid-control">
          <ElInput
            :model-value="modelValue"
            :readonly="existing"
            :disabled="disabled"
            maxlength="128"
            show-word-limit
            autocomplete="off"
            placeholder="例如：publications:550e8400-e29b-41d4-a716-446655440000"
            @update:model-value="emit('update:modelValue', String($event))"
          />
          <ElButton :disabled="!modelValue" plain title="复制 UID" @click="copyUid"><Copy :size="15" />复制</ElButton>
          <ElButton v-if="!existing" :disabled="disabled" plain title="重新生成 UID" @click="regenerate"><RefreshCw :size="15" />重新生成</ElButton>
        </div>
        <p class="admin-field-help">{{ existing ? '该 UID 已被其他记录或关系引用，只读显示。' : '系统已自动生成建议值；首次保存前可以自定义。' }}</p>
      </AdminCheckedFormItem>
    </div>
  </section>
</template>

<style scoped>
.admin-uid-control{display:flex;width:100%;align-items:flex-start;gap:.5rem}.admin-uid-control :deep(.el-input){min-width:0;flex:1}.admin-uid-control :deep(.el-button){flex:none}@media(max-width:700px){.admin-uid-control{flex-wrap:wrap}.admin-uid-control :deep(.el-input){flex-basis:100%}}
</style>
