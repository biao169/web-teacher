<script setup lang="ts">
import { ElAutocomplete } from 'element-plus'
import {
  completedAdminSuggestionTokens,
  currentAdminSuggestionToken,
  normalizeAdminSuggestionKey,
  replaceCurrentAdminSuggestionToken,
} from '~~/shared/admin/suggestion-tools'
type SuggestionItem = { value: string }

const props = withDefaults(defineProps<{
  modelValue?: string | null
  module?: string
  field: string
  disabled?: boolean
  placeholder?: string
  multiline?: boolean
  multiple?: boolean
  maxLength?: number | undefined
  rows?: number
}>(), {
  modelValue: '',
  module: '',
  disabled: false,
  placeholder: '',
  multiline: false,
  multiple: false,
  maxLength: 0,
  rows: 5,
})
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const route = useRoute()
const { request } = useCompleteAdminApi()

const moduleAliases: Record<string, string> = {
  research: 'research-interests',
  'student-categories': 'student-category-displays',
}
const resolvedModule = computed(() => {
  if (props.module) return moduleAliases[props.module] ?? props.module
  const segment = route.path.split('/').filter(Boolean)[1] ?? ''
  return moduleAliases[segment] ?? segment
})
const lengthProps = computed(() => props.maxLength > 0 ? { maxlength: props.maxLength } : {})

function completedTokens(value: string): Set<string> {
  return new Set(completedAdminSuggestionTokens(value, props.multiple).map(normalizeAdminSuggestionKey))
}
async function fetchSuggestions(query: string, callback: (items: SuggestionItem[]) => void) {
  const q = currentAdminSuggestionToken(query, props.multiple)
  if (!resolvedModule.value) {
    callback([])
    return
  }
  try {
    const response = await request<Record<string, unknown>>('/api/v1/admin/complete/suggestions', {
      query: { module: resolvedModule.value, field: props.field, q },
    })
    const values = response.items ?? response.suggestions ?? response.data ?? response.values ?? []
    const completed = completedTokens(query)
    callback(Array.isArray(values)
      ? values.map(item => typeof item === 'string' ? { value: item } : item)
          .filter((item): item is SuggestionItem => Boolean(item && typeof item === 'object' && typeof (item as SuggestionItem).value === 'string'))
          .filter(item => !completed.has(normalizeAdminSuggestionKey(item.value)))
      : [])
  } catch {
    callback([])
  }
}
function selectSuggestion(item: Record<string, unknown>) {
  if (typeof item.value !== 'string') return
  emit('update:modelValue', replaceCurrentAdminSuggestionToken(props.modelValue, item.value, props.multiple))
}
</script>

<template>
  <ElAutocomplete
    :model-value="String(modelValue ?? '')"
    :fetch-suggestions="fetchSuggestions"
    :disabled="disabled"
    :placeholder="placeholder"
    :type="multiline ? 'textarea' : 'text'"
    :autosize="multiline ? { minRows: rows, maxRows: Math.max(rows, 12) } : false"
    v-bind="lengthProps"
    :trigger-on-focus="true"
    :debounce="180"
    highlight-first-item
    clearable
    @update:model-value="emit('update:modelValue', String($event ?? ''))"
    @select="selectSuggestion"
  />
</template>
