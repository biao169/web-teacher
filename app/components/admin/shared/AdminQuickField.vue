<script setup lang="ts">
import { ElButton } from 'element-plus'
import { ElOption, ElSelect } from '~/admin/element-plus-ts6'
import { adminBooleanValue, adminOptionTone, type AdminListOption, type AdminListPrimitive, type AdminOptionTone, type AdminUnifiedColumnKind } from '~/admin/unified-list'

const props = withDefaults(defineProps<{
  modelValue: AdminListPrimitive
  options: readonly AdminListOption[]
  kind?: AdminUnifiedColumnKind
  disabled?: boolean
  loading?: boolean
  ariaLabel?: string
}>(), { kind: 'text', disabled: false, loading: false, ariaLabel: '快速修改字段' })
const emit = defineEmits<{ change: [value: AdminListPrimitive] }>()

function sameValue(left: unknown, right: unknown): boolean {
  return String(left ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US') === String(right ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

const booleanPair = computed(() => {
  if (props.kind !== 'boolean' || props.options.length !== 2) return null
  const enabled = props.options.find(option => adminBooleanValue(option.value) === true)
  const disabled = props.options.find(option => adminBooleanValue(option.value) === false)
  return enabled && disabled ? { enabled, disabled } : null
})
const currentOption = computed(() => props.options.find(option => sameValue(option.value, props.modelValue)))
const currentBooleanOption = computed(() => adminBooleanValue(props.modelValue) === true ? booleanPair.value?.enabled : booleanPair.value?.disabled)
const nextBooleanOption = computed(() => adminBooleanValue(props.modelValue) === true ? booleanPair.value?.disabled : booleanPair.value?.enabled)
const booleanTone = computed<AdminOptionTone>(() => currentBooleanOption.value?.tone ?? adminOptionTone(props.modelValue, 'boolean') ?? 'info')
const booleanLabel = computed(() => currentBooleanOption.value?.label ?? currentOption.value?.label ?? '未设置')
const booleanAriaLabel = computed(() => `${props.ariaLabel}：当前${booleanLabel.value}${nextBooleanOption.value ? `，点击切换为${nextBooleanOption.value.label}` : ''}`)

function optionTone(option: AdminListOption): AdminOptionTone | undefined {
  return option.tone ?? adminOptionTone(option.value, props.kind)
}
function toneForValue(value: unknown): AdminOptionTone | undefined {
  const option = props.options.find(item => sameValue(item.value, value))
  return option ? optionTone(option) : adminOptionTone(value, props.kind)
}
function toggleBoolean(): void {
  if (props.disabled || props.loading || !nextBooleanOption.value) return
  emit('change', nextBooleanOption.value.value)
}
</script>

<template>
  <ElButton
    v-if="booleanPair"
    class="admin-quick-field admin-boolean-quick-field"
    :class="{ 'is-active': adminBooleanValue(props.modelValue) === true }"
    :type="booleanTone"
    :plain="adminBooleanValue(props.modelValue) !== true"
    :disabled="props.disabled || props.loading"
    :loading="props.loading"
    :aria-label="booleanAriaLabel"
    :aria-pressed="adminBooleanValue(props.modelValue) === true"
    size="small"
    @click="toggleBoolean"
  >{{ booleanLabel }}</ElButton>
  <ElSelect
    v-else
    class="admin-quick-field"
    :model-value="props.modelValue"
    :disabled="props.disabled"
    :loading="props.loading"
    :aria-label="props.ariaLabel"
    size="small"
    @change="(value: unknown) => emit('change', value as AdminListPrimitive)"
  >
    <template #label="{ label, value }">
      <span class="admin-option-label">
        <i v-if="toneForValue(value)" class="admin-option-label__dot" :data-tone="toneForValue(value)" aria-hidden="true" />
        <span>{{ label }}</span>
      </span>
    </template>
    <ElOption v-for="option in props.options" :key="String(option.value)" :label="option.label" :value="option.value">
      <span class="admin-option-label">
        <i v-if="optionTone(option)" class="admin-option-label__dot" :data-tone="optionTone(option)" aria-hidden="true" />
        <span>{{ option.label }}</span>
      </span>
    </ElOption>
  </ElSelect>
</template>
