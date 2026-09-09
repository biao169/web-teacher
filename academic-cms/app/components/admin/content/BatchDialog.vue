<script setup lang="ts">
import AdminFormItem from '../shared/AdminFormItem.vue'
import { ElAlert, ElButton, ElDialog, ElForm } from 'element-plus'
import { ElOption, ElSelect } from '~/admin/element-plus-ts6'
import type { AdminContentListItem } from '~~/shared/contracts/admin-content'
import type { AdminContentModuleDefinition, AdminContentValue, AdminFieldDefinition } from '~~/shared/admin/content-modules'
import { defaultFieldValue } from '~/admin/content-utils'
import { contentEditorFieldDescriptor } from '~/admin/editor-fields'
import AdminFieldRenderer from '../shared/AdminFieldRenderer.vue'

const props = defineProps<{
  modelValue: boolean
  definition: AdminContentModuleDefinition
  selected: readonly AdminContentListItem[]
  submitting: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: { field: string; value: AdminContentValue }]
}>()
const selectedField = ref('')
const value = ref<AdminContentValue>(null)
const fields = computed(() => props.definition.batchFields
  .map(name => props.definition.fields.find(field => field.name === name))
  .filter((field): field is AdminFieldDefinition => Boolean(field && !field.readOnly)))
const activeField = computed(() => fields.value.find(field => field.name === selectedField.value) ?? null)
const descriptor = computed(() => activeField.value ? contentEditorFieldDescriptor(props.definition.module, activeField.value) : null)
watch(activeField, field => { value.value = field ? defaultFieldValue(field) : null })
watch(() => props.modelValue, open => {
  if (open && !selectedField.value && fields.value[0]) selectedField.value = fields.value[0].name
})
function close(): void { if (!props.submitting) emit('update:modelValue', false) }
function submit(): void {
  if (!activeField.value) return
  emit('submit', { field: activeField.value.name, value: value.value })
}
</script>

<template>
  <ElDialog :model-value="modelValue" title="批量更新" width="min(34rem, 92vw)" :close-on-click-modal="!submitting" @close="close">
    <ElAlert type="info" :closable="false" show-icon :title="`本次只更新当前页选中的 ${selected.length} 条记录`" description="系统会逐条校验记录版本；任意记录已被他人修改时，整批操作都不会提交。" />
    <ElForm class="admin-batch-form" label-position="top" @submit.prevent="submit">
      <AdminFormItem label="批量字段" required>
        <ElSelect v-model="selectedField" :disabled="submitting" placeholder="选择要修改的字段">
          <ElOption v-for="field in fields" :key="field.name" :label="field.label" :value="field.name" />
        </ElSelect>
        <p class="admin-field-help">选择本次批量修改的一个字段，未选择的字段保持原值。</p>
      </AdminFormItem>
      <AdminFormItem v-if="descriptor" :label="descriptor.label" :required="descriptor.required">
        <AdminFieldRenderer v-model="value" :descriptor="descriptor" :disabled="submitting" compact />
        <p class="admin-field-help">{{ descriptor.help }}</p>
      </AdminFormItem>
    </ElForm>
    <template #footer>
      <ElButton :disabled="submitting" @click="close">取消</ElButton>
      <ElButton type="primary" :loading="submitting" :disabled="!activeField || selected.length === 0" @click="submit">更新所选记录</ElButton>
    </template>
  </ElDialog>
</template>
