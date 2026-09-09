<script setup lang="ts">
import { ref, watch } from '#imports'
import { bytesToUnit, unitToBytes } from '../../shared/vpn.mjs'
import { bytesToGB, gbToBytes } from '../../shared/settings.mjs'
import type { SettingField } from '../../shared/client'
const props = defineProps<{ field: SettingField; modelValue: unknown; path: string; zh: boolean; error?: string | undefined; unit?: 'GB'|'GiB'|undefined }>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()
const raw = ref('')
watch(() => [props.modelValue, props.unit], ([value]) => {
  if (props.field.type === 'bytes') { try { raw.value = props.unit ? bytesToUnit(value as string | null,props.unit) : bytesToGB(value as string | null) } catch { /* retain invalid draft */ } }
  else raw.value = value == null ? '' : String(value)
}, { immediate: true })
function input(event: Event) {
  const el = event.target as HTMLInputElement
  if (props.field.type === 'boolean') return emit('update:modelValue', el.checked)
  raw.value = el.value
  if (props.field.type === 'bytes') {
    try { emit('update:modelValue', (props.unit ? unitToBytes(raw.value,props.unit,props.field.nullable) : gbToBytes(raw.value, props.field.nullable))) } catch { emit('update:modelValue', { invalidGB: raw.value }) }
  } else if (props.field.type === 'integer') emit('update:modelValue', el.value === '' && props.field.nullable ? null : /^\d+$/.test(el.value) ? Number(el.value) : el.value)
  else emit('update:modelValue', el.value)
}
</script>
<template>
  <div class="ft-field" :class="{ 'ft-check-field': field.type === 'boolean' }">
    <label :for="`ft-${path}`">{{ (zh ? field.zh : field.en).replace('· GB', '· '+(unit || 'GB')) }}</label>
    <input v-if="field.type === 'boolean'" :id="`ft-${path}`" type="checkbox" :checked="modelValue === true" :aria-invalid="!!error" :aria-describedby="error ? `ft-error-${path}` : undefined" @change="input">
    <select v-else-if="field.type === 'select'" :id="`ft-${path}`" :value="modelValue" :aria-invalid="!!error" :aria-describedby="error ? `ft-error-${path}` : undefined" @change="input"><option v-for="option in field.options" :key="option[0]" :value="option[0]">{{ option[zh ? 1 : 2] }}</option></select>
    <textarea v-else-if="field.type === 'text'" :id="`ft-${path}`" :value="raw" :maxlength="field.max" rows="2" :aria-invalid="!!error" :aria-describedby="error ? `ft-error-${path}` : undefined" @input="input" />
    <input v-else :id="`ft-${path}`" type="text" :inputmode="field.type === 'integer' ? 'numeric' : field.type === 'bytes' ? 'decimal' : 'text'" :value="raw" :aria-invalid="!!error" :aria-describedby="error ? `ft-error-${path}` : undefined" @input="input">
    <span v-if="error" :id="`ft-error-${path}`" class="ft-field-error">{{ zh ? '请检查数值、范围或重复内容。' : 'Check the value, range or duplicate entry.' }}<template v-if="field.min !== undefined"> {{ field.min }}–{{ field.max }}</template></span>
  </div>
</template>
