<script setup lang="ts">
import { ElFormItem } from 'element-plus'

withDefaults(defineProps<{
  label: string
  required?: boolean | undefined
  labelMark?: string
}>(), { required: undefined, labelMark: '' })
</script>

<template>
  <ElFormItem class="admin-form-item is-no-asterisk" :label="label" v-bind="required === undefined ? {} : { required }">
    <template #label>
      <span class="admin-field-label">
        <span class="admin-field-label__title" :title="label">
          <span class="admin-field-label__required" aria-hidden="true">*</span>
          <span class="admin-field-label__text">{{ label }}</span>
          <sup v-if="labelMark" class="admin-field-label__mark">{{ labelMark }}</sup>
        </span>
        <span v-if="$slots['label-actions']" class="admin-field-label__actions"><slot name="label-actions" /></span>
      </span>
    </template>
    <slot />
    <template v-if="$slots.error" #error="scope"><slot name="error" v-bind="scope" /></template>
  </ElFormItem>
</template>

<style scoped>
.admin-form-item.el-form-item--label-top :deep(.el-form-item__label) { display: flex; width: 100%; max-width: 100%; min-width: 0; }
.admin-field-label { display: flex; width: 100%; min-width: 0; align-items: center; justify-content: space-between; gap: .5rem; }
.admin-field-label__title { display: inline-flex; min-width: 0; align-items: baseline; gap: .2rem; white-space: nowrap; }
.admin-field-label__text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin-field-label__required, .admin-field-label__mark { flex: none; color: var(--el-color-danger); }
.admin-field-label__required { display: none; }
.admin-form-item.is-required .admin-field-label__required { display: inline; }
.admin-field-label__mark { font-size: .7em; line-height: 1; }
.admin-field-label__actions { display: inline-flex; flex: none; align-items: center; }
.admin-field-label__actions :deep(.el-button) { height: auto; padding: 0; font-size: var(--admin-font-size-caption); }
</style>
