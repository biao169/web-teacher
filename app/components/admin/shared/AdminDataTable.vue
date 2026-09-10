<script setup lang="ts">
import { Filter, RotateCcw, Search } from '@lucide/vue'
import { ElButton, ElEmpty, ElInput, ElPopover, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { ElSelect } from '~/admin/element-plus-ts6'
import { adminStatusTagType, formatAdminListValue } from '~/admin/formatters'
import { adminActionColumnLayout, adminColumnDefaultWidth, adminColumnOptionLabel, adminColumnOptionTone, adminOptionTone, type AdminListOption, type AdminListPrimitive, type AdminOptionTone, type AdminUnifiedColumn, type AdminUnifiedSortChange, type AdminUnifiedTableRow } from '~/admin/unified-list'
import AdminSelectOption from './AdminSelectOption.vue'

const props = withDefaults(defineProps<{
  rows: readonly AdminUnifiedTableRow[]
  columns: readonly AdminUnifiedColumn[]
  loading?: boolean
  rowKey?: string
  selectable?: boolean
  selectionLimit?: number
  actionLabels?: readonly string[]
  fixedActions?: boolean
  preferenceKey?: string
  emptyDescription?: string
  filterValues?: Readonly<Record<string, unknown>>
  expandable?: boolean
}>(), {
  loading: false,
  rowKey: 'uid',
  selectable: false,
  selectionLimit: 25,
  actionLabels: () => [],
  fixedActions: true,
  preferenceKey: 'default',
  emptyDescription: '当前没有数据',
  filterValues: () => ({}),
  expandable: false,
})
const emit = defineEmits<{
  'selection-change': [rows: AdminUnifiedTableRow[]]
  'sort-change': [value: AdminUnifiedSortChange]
  'column-resize': [key: string, width: number]
  'filter-change': [key: string, value: AdminListPrimitive | undefined]
  edit: [row: AdminUnifiedTableRow]
}>()
const slots = useSlots()
const preferences = useAdminTablePreferences(() => props.preferenceKey)
const tableRows = computed(() => [...props.rows])
const actionLayout = computed(() => adminActionColumnLayout(props.actionLabels))
const actionColumnWidth = computed(() => actionLayout.value.width)
const filterDrafts = reactive<Record<string, AdminListPrimitive | undefined>>({})

watch(() => props.filterValues, values => {
  for (const key of Object.keys(filterDrafts)) Reflect.deleteProperty(filterDrafts, key)
  for (const [key, value] of Object.entries(values)) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') filterDrafts[key] = value
  }
}, { immediate: true, deep: true })

function selected(rows: AdminUnifiedTableRow[]): void { emit('selection-change', rows.slice(0, props.selectionLimit)) }
function sorted(value: { prop: string | null; order: 'ascending' | 'descending' | null }): void {
  emit('sort-change', { ...(value.prop ? { prop: value.prop } : {}), order: value.order })
}
function selectableRow(_row: AdminUnifiedTableRow, index: number): boolean { return index < props.selectionLimit }
function widthFor(column: AdminUnifiedColumn): number { return preferences.columnWidth(column.key) ?? adminColumnDefaultWidth(column) }
function resized(newWidth: number, _oldWidth: number, column: { property?: string }): void {
  const key = column.property
  if (!key) return
  preferences.setColumnWidth(key, newWidth)
  emit('column-resize', key, newWidth)
}
function tagged(column: AdminUnifiedColumn): boolean { return ['boolean', 'enum', 'visibility', 'status'].includes(column.kind ?? '') }
function tagType(column: AdminUnifiedColumn, value: unknown): AdminOptionTone { return adminColumnOptionTone(column, value) ?? (adminStatusTagType(value) || 'primary') }
function displayValue(column: AdminUnifiedColumn, value: unknown): string { return adminColumnOptionLabel(column, value) ?? formatAdminListValue(value, column.kind) }
function hasFilter(column: AdminUnifiedColumn): boolean {
  const value = props.filterValues[column.key]
  return value !== undefined && value !== null && value !== ''
}
function selectFilter(column: AdminUnifiedColumn): boolean {
  return Boolean(column.options?.length) || ['boolean', 'visibility', 'status'].includes(column.kind ?? '')
}
function filterOptions(column: AdminUnifiedColumn): readonly AdminListOption[] {
  if (column.options?.length) return column.options
  if (column.kind === 'boolean') return [{ value: true, label: '是', tone: 'success' }, { value: false, label: '否', tone: 'danger' }]
  return []
}
function filterOptionTone(column: AdminUnifiedColumn, value: unknown): AdminOptionTone | undefined {
  return adminColumnOptionTone(column, value) ?? adminOptionTone(value, column.kind)
}
function filterOptionToneProps(column: AdminUnifiedColumn, option: AdminListOption): { tone: AdminOptionTone } | Record<string, never> {
  const tone = option.tone ?? filterOptionTone(column, option.value)
  return tone ? { tone } : {}
}
function optionValue(value: AdminListPrimitive): string | number | boolean { return value ?? '' }
function updateFilterDraft(key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') filterDrafts[key] = undefined
  else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') filterDrafts[key] = value
}
function applyFilter(column: AdminUnifiedColumn): void { emit('filter-change', column.key, filterDrafts[column.key]) }
function clearFilter(column: AdminUnifiedColumn): void {
  filterDrafts[column.key] = undefined
  emit('filter-change', column.key, undefined)
}
</script>

<template>
  <section class="admin-unified-table-panel" :aria-busy="props.loading">
    <ElTable
      v-loading="props.loading"
      :data="tableRows"
      :row-key="props.rowKey"
      class="admin-overview-table"
      border
      stripe
      size="small"
      table-layout="fixed"
      empty-text=" "
      @selection-change="selected"
      @sort-change="sorted"
      @header-dragend="resized"
    >
      <ElTableColumn v-if="props.selectable" type="selection" width="48" :selectable="selectableRow" fixed="left" />
      <ElTableColumn v-if="props.expandable && slots.expand" type="expand" width="42" fixed="left">
        <template #default="{ row }"><slot name="expand" :row="row" /></template>
      </ElTableColumn>
      <ElTableColumn
        v-for="column in props.columns"
        :key="column.key"
        :column-key="column.key"
        :prop="column.key"
        :label="column.label"
        :width="widthFor(column)"
        :min-width="column.minWidth ?? column.width ?? 112"
        :sortable="column.sortable === false ? false : 'custom'"
        :resizable="column.resizable !== false"
        :show-overflow-tooltip="!column.twoLine"
      >
        <template #header>
          <span class="admin-column-header">
            <span class="admin-column-header__label">{{ column.label }}</span>
            <ElPopover v-if="column.filterable !== false" placement="bottom-start" trigger="click" :width="236">
              <template #reference>
                <ElButton
                  text
                  circle
                  size="small"
                  class="admin-column-filter-trigger"
                  :class="{ 'is-active': hasFilter(column) }"
                  :aria-label="`筛选${column.label}`"
                  :aria-pressed="hasFilter(column)"
                  :title="hasFilter(column) ? `${column.label}已有筛选条件` : `筛选${column.label}`"
                  @click.stop
                ><Filter :size="13" /></ElButton>
              </template>
              <form class="admin-column-filter" @submit.prevent="applyFilter(column)">
                <strong>{{ column.label }}筛选</strong>
                <ElSelect
                  v-if="selectFilter(column)"
                  :model-value="filterDrafts[column.key] ?? ''"
                  clearable
                  filterable
                  placeholder="全部"
                  @update:model-value="(value: unknown) => updateFilterDraft(column.key, value)"
                >
                  <template #label="{ label, value }">
                    <span class="admin-option-label">
                      <i v-if="filterOptionTone(column, value)" class="admin-option-label__dot" :data-tone="filterOptionTone(column, value)" aria-hidden="true" />
                      <span>{{ label }}</span>
                    </span>
                  </template>
                  <AdminSelectOption v-for="option in filterOptions(column)" :key="String(option.value)" :label="option.label" :value="optionValue(option.value)" v-bind="filterOptionToneProps(column, option)" />
                </ElSelect>
                <ElInput
                  v-else
                  :model-value="String(filterDrafts[column.key] ?? '')"
                  clearable
                  :placeholder="`输入${column.label}`"
                  @update:model-value="value => updateFilterDraft(column.key, value)"
                ><template #prefix><Search :size="14" /></template></ElInput>
                <div class="admin-column-filter__actions">
                  <ElButton size="small" @click="clearFilter(column)"><RotateCcw :size="13" />清除</ElButton>
                  <ElButton native-type="submit" size="small" type="primary">应用</ElButton>
                </div>
              </form>
            </ElPopover>
          </span>
        </template>
        <template #default="{ row }">
          <slot name="cell" :row="row" :column="column" :value="row[column.key]">
            <ElButton v-if="column.primary" link type="primary" class="admin-unified-primary-cell" @click="emit('edit', row)">
              <span :class="{ 'admin-two-line-cell': column.twoLine }">{{ formatAdminListValue(row[column.key], column.kind) }}</span>
            </ElButton>
            <ElTag v-else-if="tagged(column)" :type="tagType(column, row[column.key])" size="small" effect="plain">
              {{ displayValue(column, row[column.key]) }}
            </ElTag>
            <span v-else :class="{ 'admin-two-line-cell': column.twoLine }">{{ formatAdminListValue(row[column.key], column.kind) }}</span>
          </slot>
        </template>
      </ElTableColumn>
      <ElTableColumn v-if="slots.actions" label="操作" :width="actionColumnWidth" :fixed="props.fixedActions ? 'right' : false" :resizable="false" class-name="admin-actions-column" label-class-name="admin-actions-column">
        <template #default="{ row }">
          <div class="admin-actions-cell" :style="{ '--admin-action-columns': String(actionLayout.columns), '--admin-action-rows': String(actionLayout.rows) }"><slot name="actions" :row="row" /></div>
        </template>
      </ElTableColumn>
      <template #empty><ElEmpty :description="props.emptyDescription" /></template>
    </ElTable>
  </section>
</template>
