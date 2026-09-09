# app / components / admin / content / List.vue

## 文件定位

- **源码路径**：`app/components/admin/content/List.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台界面组件；构成后台导航、标题栏、状态反馈或内容管理交互。
- **规模**：332 行，17889 字节
- **内容校验**：SHA-256 `d2cf810e6c7da4251983ad0d4ebe77293b8d733fabf1ba6c853d87bb0e028560`

## 直接依赖

- `../shared/AdminDataTable.vue`
- `../shared/AdminListAvatar.vue`
- `../shared/AdminListShell.vue`
- `../shared/AdminListToolbar.vue`
- `../shared/AdminQuickField.vue`
- `../shared/AdminRowActions.vue`
- `@lucide/vue`
- `@tanstack/vue-query`
- `element-plus`
- `~/admin/content-utils`
- `~/admin/errors`
- `~/admin/query-client`
- `~/admin/unified-list`
- `~~/shared/admin/content-modules`
- `~~/shared/contracts/admin-content`
- `~~/shared/contracts/media`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `apiQuery` | computed 声明，第 38 行 | 派生 api Query 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `queryKey` | computed 声明，第 39 行 | 派生 query Key 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 8 次。 |
| `queryFn` | 对象函数，第 42 行 | 按条件查询或整理 Fn，返回可消费的结果集 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `details` | computed 声明，第 45 行 | 派生 details 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `totalPages` | computed 声明，第 46 行 | 派生 total Pages 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `primaryActionLabel` | computed 声明，第 47 行 | 派生 primary Action Label 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `canDelete` | computed 声明，第 48 行 | 派生 can Delete 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `actionLabels` | computed 声明，第 49 行 | 派生 action Labels 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `twoLineColumn` | 函数，第 54 行 | 封装 Line Column 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `booleanColumnOptions` | 函数，第 57 行 | 封装 Column Options 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `columnOptions` | 函数，第 62 行 | 封装 Options 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `tableColumns` | computed 声明，第 71 行 | 派生 table Columns 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `tableRows` | computed 声明，第 86 行 | 派生 table Rows 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `routeQueryWith` | 函数，第 104 行 | 封装 Query With 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `setQuery` | 函数，第 107 行 | 更新 Query，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `applySearch` | 函数，第 110 行 | 执行 Search 所代表的完整处理流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `setFilterValue` | 函数，第 111 行 | 更新 Filter Value，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `onColumnFilter` | 函数，第 115 行 | 响应 Column Filter 相关事件，协调后续业务流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `onSort` | 函数，第 119 行 | 响应 Sort 相关事件，协调后续业务流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `original` | 函数，第 123 行 | 封装 original 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `editRow` | 函数，第 126 行 | 更新 Row，并保持状态、校验与持久化结果一致 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `edit` | 函数，第 130 行 | 更新 edit，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `create` | 函数，第 133 行 | 创建 create，并完成初始化或持久化处理 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `rowEmail` | 函数，第 134 行 | 封装 Email 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `copyEmail` | 函数，第 138 行 | 封装 Email 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `removeRow` | 函数，第 146 行 | 移除或失效 Row，同时处理相关联状态 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `displayed` | 函数，第 170 行 | 封装 displayed 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `cellTone` | 函数，第 174 行 | 根据 Tone 返回对应的展示类型或颜色语义 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `rowMedia` | 函数，第 175 行 | 封装 Media 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `mediaAlt` | 函数，第 182 行 | 封装 Alt 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `setSelection` | 函数，第 187 行 | 更新 Selection，并保持状态、校验与持久化结果一致 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `quickUpdate` | 函数，第 194 行 | 封装 Update 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `mutationFn` | 对象函数，第 218 行 | 封装 Fn 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `onSuccess` | 对象函数，第 226 行 | 响应 Success 相关事件，协调后续业务流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `onError` | 对象函数，第 232 行 | 响应 Error 相关事件，协调后续业务流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `apiQuery`：`apiQuery = computed(() => contentListApiQuery(props.definition, route.query))`
- `queryKey`：`queryKey = computed(() => adminQueryKeys.list(props.definition.module, apiQuery.value))`
- `queryFn`：`queryFn: () => api.request<AdminContentListView>(\`/api/v1/admin/content/$`
- `details`：`details = computed(() => error.value ? adminErrorDetails(error.value) : null)`
- `totalPages`：`totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / Number(apiQuery.value.pageSize ?? 20))))`
- `primaryActionLabel`：`primaryActionLabel = computed(() => props.definition.module === 'messages' ? (data.value?.permissions.edit ? '处理' : '查看') : (data.value?.permissions.edit ? '编辑' : '查看'))`
- `canDelete`：`canDelete = computed(() => Boolean(props.definition.canDelete && data.value?.permissions.delete))`
- `actionLabels`：`actionLabels = computed(() =>`
- `twoLineColumn`：`function twoLineColumn(column: AdminListColumn): boolean`
- `booleanColumnOptions`：`function booleanColumnOptions(field: string): readonly AdminListOption[]`
- `columnOptions`：`function columnOptions(column: AdminListColumn): readonly AdminListOption[]`
- `tableColumns`：`tableColumns = computed<AdminUnifiedColumn[]>(() => props.definition.columns.map(column => (`
- `tableRows`：`tableRows = computed<AdminUnifiedTableRow[]>(() => (data.value?.items ?? []).map(item => (`
- `routeQueryWith`：`function routeQueryWith(changes: Readonly<Record<string, unknown>>): Record<string, string>`
- `setQuery`：`async function setQuery(changes: Readonly<Record<string, unknown>>): Promise<void>`
- `applySearch`：`function applySearch(): void`
- `setFilterValue`：`function setFilterValue(key: string, value: AdminListPrimitive | undefined): void`
- `onColumnFilter`：`function onColumnFilter(key: string, value: AdminListPrimitive | undefined): void`
- `onSort`：`function onSort(`
- `original`：`function original(row: AdminUnifiedTableRow): AdminContentListItem | undefined`
- `editRow`：`function editRow(row: AdminUnifiedTableRow): void`
- `edit`：`function edit(item: AdminContentListItem): void`
- `create`：`function create(): void`
- `rowEmail`：`function rowEmail(row: AdminUnifiedTableRow): string`
- `copyEmail`：`async function copyEmail(row: AdminUnifiedTableRow): Promise<void>`
- `removeRow`：`async function removeRow(row: AdminUnifiedTableRow): Promise<void>`
- `displayed`：`function displayed(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): string`
- `cellTone`：`function cellTone(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): AdminOptionTone`
- `rowMedia`：`function rowMedia(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): MediaViewModel | null`
- `mediaAlt`：`function mediaAlt(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): string | null`
- `setSelection`：`function setSelection(rows: AdminUnifiedTableRow[]): void`
- `quickUpdate`：`async function quickUpdate(row: AdminUnifiedTableRow, column: AdminUnifiedColumn, value: AdminListPrimitive): Promise<void>`
- `mutationFn`：`mutationFn: (`
- `onSuccess`：`onSuccess: async result =>`
- `onError`：`onError: async failure =>`

## Vue 模板交互

- 模板约 81 行；样式区约 4 行。
- 子组件：`AdminListShell`、`AdminListToolbar`、`AdminStatePanel`、`ElButton`、`AdminDataTable`、`AdminListAvatar`、`AdminQuickField`、`ElTag`、`AdminRowActions`、`Edit3`、`Copy`、`Trash2`、`ElPagination`、`AdminContentBatchDialog`
- 事件绑定：`create → create`、`search → applySearch`、`refresh → refetch()`、`batch → batchOpen = true`、`click → refetch()`、`selection-change → setSelection`、`sort-change → onSort`、`filter-change → onColumnFilter`、`edit → editRow`、`change → value => quickUpdate(row, column, value)`、`click → editRow(row)`、`click → copyEmail(row)`、`click → removeRow(row)`、`update:current-page → page => setQuery({ page })`、`update:page-size → pageSize => setQuery({ pageSize, page: 1 })`、`submit → payload => batchMutation.mutate(payload)`
- 动态属性：`title`、`description`、`can-create`、`create-label`、`loading`、`selected-count`、`can-batch`、`search-placeholder`、`request-id`、`rows`、`columns`、`selectable`、`selection-limit`、`filter-values`、`action-labels`、`preference-key`、`media`、`name`、`model-value`、`options`、`kind`、`aria-label`、`class`、`type`、`size`、`disabled`、`current-page`、`page-size`、`page-sizes`、`total`
- 局部样式选择器：`.admin-pagination`、`@media (max-width:720px)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
