# app / components / admin / shared / AdminDataTable.vue

## 文件定位

- **源码路径**：`app/components/admin/shared/AdminDataTable.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台共享界面组件；统一列表、编辑器、操作按钮或字段控件的交互与样式。
- **规模**：204 行，10628 字节
- **内容校验**：SHA-256 `9cf423051eb0e5dcd4fd44ca403413c028ee9c3fc275f9bb2d6e8e2a07b85b4a`

## 直接依赖

- `./AdminSelectOption.vue`
- `@lucide/vue`
- `element-plus`
- `~/admin/element-plus-ts6`
- `~/admin/formatters`
- `~/admin/unified-list`

## 直接调用方

- `app/components/admin/complete/AdminCompleteAuthWorkspace.vue`
- `app/components/admin/complete/AdminCompleteLogWorkspace.vue`
- `app/components/admin/complete/AdminCompleteMediaWorkspace.vue`
- `app/components/admin/complete/AdminCompleteResourceWorkspace.vue`
- `app/components/admin/complete/AdminCompleteTranslationWorkspace.vue`
- `app/components/admin/content/List.vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `actionLabels` | 对象函数，第 27 行 | 封装 Labels 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `filterValues` | 对象函数，第 31 行 | 按条件查询或整理 Values，返回可消费的结果集 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `tableRows` | computed 声明，第 43 行 | 派生 table Rows 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `actionLayout` | computed 声明，第 44 行 | 派生 action Layout 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `actionColumnWidth` | computed 声明，第 45 行 | 派生 action Column Width 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `selected` | 函数，第 55 行 | 读取或定位 selected，向调用方返回匹配结果 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `sorted` | 函数，第 56 行 | 按条件查询或整理 sorted，返回可消费的结果集 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `selectableRow` | 函数，第 59 行 | 读取或定位 Row，向调用方返回匹配结果 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `widthFor` | 函数，第 60 行 | 封装 For 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `resized` | 函数，第 61 行 | 封装 resized 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `tagged` | 函数，第 67 行 | 封装 tagged 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `tagType` | 函数，第 68 行 | 根据 Type 返回对应的展示类型或颜色语义 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `displayValue` | 函数，第 69 行 | 封装 Value 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `hasFilter` | 函数，第 70 行 | 检查 Filter 是否满足业务、安全或类型约束 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `selectFilter` | 函数，第 74 行 | 读取或定位 Filter，向调用方返回匹配结果 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `filterOptions` | 函数，第 77 行 | 按条件查询或整理 Options，返回可消费的结果集 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `filterOptionTone` | 函数，第 82 行 | 根据 Option Tone 返回对应的展示类型或颜色语义 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `filterOptionToneProps` | 函数，第 85 行 | 根据 Option Tone Props 返回对应的展示类型或颜色语义 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `optionValue` | 函数，第 89 行 | 封装 Value 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `updateFilterDraft` | 函数，第 90 行 | 更新 Filter Draft，并保持状态、校验与持久化结果一致 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `applyFilter` | 函数，第 94 行 | 执行 Filter 所代表的完整处理流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `clearFilter` | 函数，第 95 行 | 移除或失效 Filter，同时处理相关联状态 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `actionLabels`：`actionLabels: () => []`
- `filterValues`：`filterValues: () => (`
- `tableRows`：`tableRows = computed(() => [...props.rows])`
- `actionLayout`：`actionLayout = computed(() => adminActionColumnLayout(props.actionLabels))`
- `actionColumnWidth`：`actionColumnWidth = computed(() => actionLayout.value.width)`
- `selected`：`function selected(rows: AdminUnifiedTableRow[]): void`
- `sorted`：`function sorted(value:`
- `selectableRow`：`function selectableRow(_row: AdminUnifiedTableRow, index: number): boolean`
- `widthFor`：`function widthFor(column: AdminUnifiedColumn): number`
- `resized`：`function resized(newWidth: number, _oldWidth: number, column:`
- `tagged`：`function tagged(column: AdminUnifiedColumn): boolean`
- `tagType`：`function tagType(column: AdminUnifiedColumn, value: unknown): AdminOptionTone`
- `displayValue`：`function displayValue(column: AdminUnifiedColumn, value: unknown): string`
- `hasFilter`：`function hasFilter(column: AdminUnifiedColumn): boolean`
- `selectFilter`：`function selectFilter(column: AdminUnifiedColumn): boolean`
- `filterOptions`：`function filterOptions(column: AdminUnifiedColumn): readonly AdminListOption[]`
- `filterOptionTone`：`function filterOptionTone(column: AdminUnifiedColumn, value: unknown): AdminOptionTone | undefined`
- `filterOptionToneProps`：`function filterOptionToneProps(column: AdminUnifiedColumn, option: AdminListOption):`
- `optionValue`：`function optionValue(value: AdminListPrimitive): string | number | boolean`
- `updateFilterDraft`：`function updateFilterDraft(key: string, value: unknown): void`
- `applyFilter`：`function applyFilter(column: AdminUnifiedColumn): void`
- `clearFilter`：`function clearFilter(column: AdminUnifiedColumn): void`

## Vue 模板交互

- 模板约 103 行；样式区约 0 行。
- 子组件：`ElTable`、`ElTableColumn`、`ElPopover`、`ElButton`、`Filter`、`ElSelect`、`AdminSelectOption`、`ElInput`、`Search`、`RotateCcw`、`ElTag`、`ElEmpty`
- 事件绑定：`selection-change → selected`、`sort-change → sorted`、`header-dragend → resized`、`update:model-value → (value: unknown) => updateFilterDraft(column.key, value)`、`update:model-value → value => updateFilterDraft(column.key, value)`、`click → clearFilter(column)`、`click → emit(`
- 动态属性：`aria-busy`、`data`、`row-key`、`selectable`、`row`、`key`、`column-key`、`prop`、`label`、`width`、`min-width`、`sortable`、`resizable`、`show-overflow-tooltip`、`class`、`aria-label`、`aria-pressed`、`title`、`size`、`model-value`、`data-tone`、`value`、`placeholder`、`column`、`type`、`fixed`、`style`、`description`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
