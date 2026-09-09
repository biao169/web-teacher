<script setup lang="ts">
import {
  ElDatePicker,
  ElInput,
  ElInputNumber,
  ElSwitch,
} from 'element-plus'
import { ElOption, ElSelect } from '~/admin/element-plus-ts6'
import type { AdminEditorFieldDescriptor } from '~/admin/editor-fields'
import AdminCompleteMediaPicker from '../complete/AdminCompleteMediaPicker.vue'
import AdminCompleteRelationPicker from '../complete/AdminCompleteRelationPicker.vue'
import AdminCompleteSuggestionField from '../complete/AdminCompleteSuggestionField.vue'
import AdminMediaPreview from './AdminMediaPreview.vue'

const props = withDefaults(defineProps<{
  descriptor: AdminEditorFieldDescriptor
  modelValue?: string | number | boolean | null
  disabled?: boolean
  compact?: boolean
  managedValue?: string | number | boolean | null
  mediaFallback?: string | null
}>(), {
  modelValue: null,
  disabled: false,
  compact: false,
  managedValue: null,
  mediaFallback: null,
})
const emit = defineEmits<{ 'update:modelValue': [value: string | number | boolean | null] }>()

function update(value: unknown): void {
  if (value === undefined) {
    emit('update:modelValue', null)
    return
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') emit('update:modelValue', value)
}
const textValue = computed(() => typeof props.modelValue === 'string' || typeof props.modelValue === 'number' ? String(props.modelValue) : '')
const inputType = computed(() => props.descriptor.baseControl === 'email' ? 'email' : props.descriptor.baseControl === 'url' ? 'url' : 'text')
const suggestionIdentity = computed(() => {
  const key = props.descriptor.enhancement?.suggestionKey ?? `${props.descriptor.module}.${props.descriptor.key}`
  const separator = key.indexOf('.')
  return separator > 0 ? { module: key.slice(0, separator), field: key.slice(separator + 1) } : { module: props.descriptor.module, field: props.descriptor.key }
})
const numberProps = computed(() => ({
  ...(props.descriptor.min === undefined ? {} : { min: props.descriptor.min }),
  ...(props.descriptor.max === undefined ? {} : { max: props.descriptor.max }),
  ...(props.compact ? { controlsPosition: 'right' as const } : {}),
}))
const lengthProps = computed(() => props.descriptor.maxLength === undefined ? {} : { maxlength: props.descriptor.maxLength })
const textareaRows = computed(() => props.compact ? 3 : (props.descriptor.rows ?? 5))
</script>

<template>
  <div class="admin-field-renderer" :data-admin-control="descriptor.control" :data-admin-field-source="descriptor.source">
    <div v-if="descriptor.control === 'media'" class="admin-field-renderer__media">
      <AdminCompleteMediaPicker
        :model-value="typeof modelValue === 'string' ? modelValue : ''"
        :accept="[...descriptor.accept]"
        :disabled="disabled"
        @update:model-value="update"
      />
      <AdminMediaPreview
        :object-key="typeof modelValue === 'string' ? modelValue : ''"
        :alt="descriptor.label"
        :fallback-text="mediaFallback"
        height="8.5rem"
      />
    </div>
    <AdminCompleteRelationPicker
      v-else-if="descriptor.control === 'relation' && descriptor.relationResource"
      :model-value="typeof modelValue === 'string' ? modelValue : ''"
      :resource="descriptor.relationResource"
      :label-field="descriptor.relationLabelField ?? 'title'"
      :disabled="disabled"
      @update:model-value="update"
    />
    <AdminCompleteSuggestionField
      v-else-if="descriptor.control === 'suggestion'"
      :model-value="textValue"
      :module="suggestionIdentity.module"
      :field="suggestionIdentity.field"
      :disabled="disabled"
      :placeholder="descriptor.placeholder"
      :multiline="descriptor.baseControl === 'textarea'"
      :multiple="Boolean(descriptor.enhancement?.multiple)"
      :rows="textareaRows"
      v-bind="descriptor.maxLength === undefined ? {} : { maxLength: descriptor.maxLength }"
      @update:model-value="update"
    />
    <ElSwitch
      v-else-if="descriptor.control === 'boolean'"
      :model-value="descriptor.booleanValueMode === 'integer' ? (modelValue ? 1 : 0) : modelValue === true"
      :disabled="disabled"
      :active-value="descriptor.booleanValueMode === 'integer' ? 1 : true"
      :inactive-value="descriptor.booleanValueMode === 'integer' ? 0 : false"
      inline-prompt
      active-text="是"
      inactive-text="否"
      @update:model-value="update"
    />
    <ElInputNumber
      v-else-if="descriptor.control === 'integer'"
      :model-value="typeof modelValue === 'number' ? modelValue : null"
      :disabled="disabled"
      v-bind="numberProps"
      style="width:100%"
      @update:model-value="update"
    />
    <ElSelect
      v-else-if="descriptor.control === 'select'"
      :model-value="modelValue ?? ''"
      :disabled="disabled"
      clearable
      filterable
      :placeholder="descriptor.placeholder"
      style="width:100%"
      @update:model-value="update"
    >
      <ElOption
        v-for="option in descriptor.options"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
        :disabled="Boolean(option.managed && managedValue !== option.value)"
      />
    </ElSelect>
    <ElDatePicker
      v-else-if="descriptor.control === 'date'"
      :model-value="typeof modelValue === 'string' ? modelValue : ''"
      :disabled="disabled"
      type="date"
      value-format="YYYY-MM-DD"
      format="YYYY-MM-DD"
      :placeholder="descriptor.placeholder"
      style="width:100%"
      @update:model-value="update"
    />
    <ElDatePicker
      v-else-if="descriptor.control === 'datetime'"
      :model-value="typeof modelValue === 'string' ? modelValue : ''"
      :disabled="disabled"
      type="datetime"
      :value-format="descriptor.dateTimeValueFormat"
      format="YYYY-MM-DD HH:mm"
      :placeholder="descriptor.placeholder"
      style="width:100%"
      @update:model-value="update"
    />
    <ElInput
      v-else-if="descriptor.control === 'textarea' || descriptor.control === 'richtext'"
      :model-value="textValue"
      :disabled="disabled"
      type="textarea"
      :rows="textareaRows"
      v-bind="lengthProps"
      show-word-limit
      resize="vertical"
      :placeholder="descriptor.placeholder"
      @update:model-value="update"
    />
    <ElInput
      v-else
      :model-value="textValue"
      :disabled="disabled"
      :type="inputType"
      :inputmode="descriptor.control === 'decimal' ? 'decimal' : undefined"
      v-bind="lengthProps"
      :placeholder="descriptor.placeholder"
      clearable
      @update:model-value="update"
    />
  </div>
</template>

<style scoped>
.admin-field-renderer{width:100%}.admin-field-renderer__media{display:grid;grid-template-columns:minmax(0,1fr) minmax(10rem,15rem);gap:1rem;align-items:center}.admin-field-renderer__media :deep(.admin-media-field){min-width:0}@media(max-width:720px){.admin-field-renderer__media{grid-template-columns:1fr}}
</style>
