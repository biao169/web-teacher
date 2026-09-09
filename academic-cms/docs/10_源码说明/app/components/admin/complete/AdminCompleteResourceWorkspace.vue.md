# app / components / admin / complete / AdminCompleteResourceWorkspace.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteResourceWorkspace.vue`
- **文件类型**：Vue 组件
- **功能定位**：通用资源列表与编辑入口；在路由确认后切换对象，按保存结果更新列表和当前 UID。
- **规模**：535 行，25054 字节
- **内容校验**：SHA-256 `d0b195485492da4955da1418d8220cd16a4f8815f8a6d6ef7566a35c61a9d0b9`

## 接入与状态约定

创建、选择和返回只请求修改 edit 参数；applyEditQuery 在路由守卫通过后应用状态。editorSaved 单独处理保存并返回，避免列表刷新与关闭竞争。现有分页、筛选和排序参数随 query 保留。

## 直接依赖

- `../shared/AdminFormItem.vue`
- `../shared/AdminFieldRenderer.vue`
- `~/admin/editor-fields`
- `element-plus`
- `~/admin/element-plus-ts6`
- `~/admin/errors`
- `~/admin/complete-resource`
- `~/admin/formatters`
- `~/admin/unified-list`
- `~~/shared/admin/registry`
- `~~/shared/enums/auth`
- `../shared/AdminDataTable.vue`
- `../shared/AdminListShell.vue`
- `../shared/AdminListToolbar.vue`
- `../shared/AdminQuickField.vue`
- `../shared/AdminRowActions.vue`
- `../shared/AdminSelectOption.vue`
- `./AdminCompleteRecordEditor.vue`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `editQueryValue` | computed 派生状态，第 70 行 | 派生 editQueryValue 的响应式状态，供模板和交互逻辑读取 |
| `readOnly` | computed 派生状态，第 81 行 | 派生 read Only 的响应式状态，供模板和交互逻辑读取 |
| `currentUser` | computed 派生状态，第 82 行 | 派生 current User 的响应式状态，供模板和交互逻辑读取 |
| `canCreate` | computed 派生状态，第 83 行 | 派生 can Create 的响应式状态，供模板和交互逻辑读取 |
| `canEdit` | computed 派生状态，第 84 行 | 派生 can Edit 的响应式状态，供模板和交互逻辑读取 |
| `canDelete` | computed 派生状态，第 85 行 | 派生 can Delete 的响应式状态，供模板和交互逻辑读取 |
| `tableColumns` | computed 派生状态，第 86 行 | 派生 table Columns 的响应式状态，供模板和交互逻辑读取 |
| `actionLabels` | computed 派生状态，第 87 行 | 派生 action Labels 的响应式状态，供模板和交互逻辑读取 |
| `batchFieldSchema` | computed 派生状态，第 93 行 | 派生 batch Field Schema 的响应式状态，供模板和交互逻辑读取 |
| `batchDescriptor` | computed 派生状态，第 94 行 | 根据当前表单、权限或 URL 派生状态，供模板及操作校验读取。 |
| `orderedSelected` | computed 派生状态，第 95 行 | 派生 ordered Selected 的响应式状态，供模板和交互逻辑读取 |
| `queryText` | 函数，第 100 行 | 按条件查询或整理 Text，返回可消费的结果集 |
| `labelFor` | 函数，第 106 行 | 封装 For 相关逻辑，供本文件或上层模块按其参数调用 |
| `rowUid` | 函数，第 110 行 | 封装 Uid 相关逻辑，供本文件或上层模块按其参数调用 |
| `rowUpdatedAt` | 函数，第 114 行 | 封装 Updated At 相关逻辑，供本文件或上层模块按其参数调用 |
| `newsPublicationState` | 函数，第 118 行 | 封装 Publication State 相关逻辑，供本文件或上层模块按其参数调用 |
| `newsFrontendPath` | 函数，第 126 行 | 按参数执行本文件的 newsFrontendPath 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `openNewsFrontend` | 函数，第 131 行 | 按参数执行本文件的 openNewsFrontend 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `dateTimeText` | 函数，第 137 行 | 封装 Time Text 相关逻辑，供本文件或上层模块按其参数调用 |
| `valueText` | 函数，第 141 行 | 封装 Text 相关逻辑，供本文件或上层模块按其参数调用 |
| `cancelled` | 函数，第 159 行 | 检查 cancelled 是否满足业务、安全或类型约束 |
| `messageFor` | 函数，第 164 行 | 封装 For 相关逻辑，供本文件或上层模块按其参数调用 |
| `resourceTagType` | 函数，第 169 行 | 根据 Tag Type 返回对应的展示类型或颜色语义 |
| `numberBounds` | 函数，第 173 行 | 封装 Bounds 相关逻辑，供本文件或上层模块按其参数调用 |
| `changeNewsPublication` | 函数，第 181 行 | 更新 News Publication，并保持状态、校验与持久化结果一致 |
| `initializeFilters` | 函数，第 204 行 | 封装 Filters 相关逻辑，供本文件或上层模块按其参数调用 |
| `activeFilters` | 函数，第 213 行 | 封装 Filters 相关逻辑，供本文件或上层模块按其参数调用 |
| `loadSchema` | 函数，第 222 行 | 加载并刷新 Schema，同步界面或运行时状态 |
| `load` | 函数，第 231 行 | 加载并刷新 load，同步界面或运行时状态 |
| `search` | 函数，第 260 行 | 按条件查询或整理 search，返回可消费的结果集 |
| `setFilterValue` | 函数，第 261 行 | 更新 Filter Value，并保持状态、校验与持久化结果一致 |
| `onColumnFilter` | 函数，第 265 行 | 响应 Column Filter 相关事件，协调后续业务流程 |
| `setSelection` | 函数，第 270 行 | 更新 Selection，并保持状态、校验与持久化结果一致 |
| `syncEditQuery` | 函数，第 271 行 | 把当前编辑 UID 写入或移出路由查询参数，使编辑状态可以刷新、分享和前进后退恢复 |
| `openEditor` | 函数，第 278 行 | 设置通用资源编辑 UID 并打开统一编辑器 |
| `createRecord` | 函数，第 283 行 | 创建 Record，并完成初始化或持久化处理 |
| `edit` | 函数，第 287 行 | 更新 edit，并保持状态、校验与持久化结果一致 |
| `reloadAfterMutation` | 函数，第 291 行 | 加载并刷新 After Mutation，同步界面或运行时状态 |
| `editorSaved` | 函数，第 295 行 | 保存成功后处理 UID 与是否返回，再刷新列表和必要的导航配置。 |
| `openNewsRichText` | 函数，第 302 行 | 检查新闻编辑权限；干净记录直接打开工具，否则先保存草稿或字段修改。 |
| `openNewsRichTextFromList` | 函数，第 308 行 | 按参数执行本文件的 openNewsRichTextFromList 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `closeEditor` | 函数，第 311 行 | 删除 URL 中的 edit 参数；由通过守卫后的监听关闭资源编辑器。 |
| `editorDeleted` | 函数，第 312 行 | 删除成功后返回列表，再刷新列表数据。 |
| `applyEditQuery` | 函数，第 314 行 | 在路由确认完成后根据 edit 参数打开、切换或关闭编辑实例。 |
| `quickUpdate` | 函数，第 336 行 | 封装 Update 相关逻辑，供本文件或上层模块按其参数调用 |
| `remove` | 函数，第 355 行 | 移除或失效 remove，同时处理相关联状态 |
| `resetBatchInput` | 函数，第 366 行 | 封装 Batch Input 相关逻辑，供本文件或上层模块按其参数调用 |
| `onBatchFieldChange` | 函数，第 380 行 | 响应 Batch Field Change 相关事件，协调后续业务流程 |
| `openBatch` | 函数，第 381 行 | 打开 Batch 对应的界面或交互状态 |
| `applyBatch` | 函数，第 387 行 | 执行 Batch 所代表的完整处理流程 |
| `onSort` | 函数，第 407 行 | 响应 Sort 相关事件，协调后续业务流程 |

### 调用签名

- `editQueryValue`：`editQueryValue = computed(() => queryText(route.query.edit))`
- `readOnly`：`readOnly = computed(() => Boolean(schema.value?.readOnly))`
- `currentUser`：`currentUser = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)`
- `canCreate`：`canCreate = computed(() => !readOnly.value && !schema.value?.readOnlyCreate && (!props.permissionModule || hasAdminPermission(currentUser.value, props.permissionModule, 'create')))`
- `canEdit`：`canEdit = computed(() => !readOnly.value && (!props.permissionModule || hasAdminPermission(currentUser.value, props.permissionModule, 'edit')))`
- `canDelete`：`canDelete = computed(() => !readOnly.value && !schema.value?.readOnlyCreate && !['users', 'roles', 'permissions'].includes(props.resourceKey) && (!props.permissionModule || hasAdminPermission(currentUser.value, props.permissionModule, 'delete')))`
- `tableColumns`：`tableColumns = computed(() => schema.value ? completeResourceColumns(schema.value, props.resourceKey) : [])`
- `actionLabels`：`actionLabels = computed(() => [`
- `batchFieldSchema`：`batchFieldSchema = computed(() => schema.value ? completeResourceField(schema.value, batchField.value) : undefined)`
- `batchDescriptor`：`batchDescriptor = computed(() => batchFieldSchema.value ? completeEditorFieldDescriptor(props.resourceKey, batchFieldSchema.value) : null)`
- `orderedSelected`：`orderedSelected = computed(() => {`
- `queryText`：`function queryText(value: unknown): string`
- `labelFor`：`function labelFor(key: string): string`
- `rowUid`：`function rowUid(row: AdminUnifiedTableRow): string`
- `rowUpdatedAt`：`function rowUpdatedAt(row: AdminUnifiedTableRow): string`
- `newsPublicationState`：`function newsPublicationState(row: AdminUnifiedTableRow): { label: string; type: PublicationTagType }`
- `newsFrontendPath`：`function newsFrontendPath(row: AdminUnifiedTableRow): string`
- `openNewsFrontend`：`function openNewsFrontend(row: AdminUnifiedTableRow): void`
- `dateTimeText`：`function dateTimeText(value: unknown): string`
- `valueText`：`function valueText(row: AdminUnifiedTableRow, key: string): string`
- `cancelled`：`function cancelled(failure: unknown): boolean`
- `messageFor`：`function messageFor(failure: unknown, fallback: string): string`
- `resourceTagType`：`function resourceTagType(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): AdminOptionTone`
- `numberBounds`：`function numberBounds(field: CompleteResourceField | undefined): { min?: number; max?: number }`
- `changeNewsPublication`：`async function changeNewsPublication(row: AdminUnifiedTableRow): Promise<void>`
- `initializeFilters`：`function initializeFilters(): void`
- `activeFilters`：`function activeFilters(): Record<string, AdminListPrimitive>`
- `loadSchema`：`async function loadSchema(): Promise<void>`
- `load`：`async function load(): Promise<void>`
- `search`：`function search(): void`
- `setFilterValue`：`function setFilterValue(key: string, value: AdminListPrimitive | undefined): void`
- `onColumnFilter`：`function onColumnFilter(key: string, value: AdminListPrimitive | undefined): void`
- `setSelection`：`function setSelection(items: AdminUnifiedTableRow[]): void`
- `syncEditQuery`：`async function syncEditQuery(value: string | null): Promise<void>`
- `openEditor`：`function openEditor(uid: string | null): void`
- `createRecord`：`function createRecord(): void`
- `edit`：`function edit(row: AdminUnifiedTableRow): void`
- `reloadAfterMutation`：`async function reloadAfterMutation(): Promise<void>`
- `editorSaved`：`async function editorSaved(uid: string, andReturn: boolean): Promise<void>`
- `openNewsRichText`：`async function openNewsRichText(uid: string): Promise<void>`
- `openNewsRichTextFromList`：`function openNewsRichTextFromList(uid: string): void`
- `closeEditor`：`async function closeEditor(): Promise<void>`
- `editorDeleted`：`async function editorDeleted(): Promise<void>`
- `applyEditQuery`：`async function applyEditQuery(): Promise<void>`
- `quickUpdate`：`async function quickUpdate(row: AdminUnifiedTableRow, key: string, value: AdminListPrimitive): Promise<void>`
- `remove`：`async function remove(row: AdminUnifiedTableRow): Promise<void>`
- `resetBatchInput`：`function resetBatchInput(): void`
- `onBatchFieldChange`：`function onBatchFieldChange(): void`
- `openBatch`：`function openBatch(): void`
- `applyBatch`：`async function applyBatch(): Promise<void>`
- `onSort`：`function onSort({ prop, order }: AdminUnifiedSortChange): void`

## 模板接入

使用组件：`AdminCompleteRecordEditor`、`AdminDataTable`、`AdminFieldRenderer`、`AdminFormItem`、`AdminListShell`、`AdminListToolbar`、`AdminQuickField`、`AdminRowActions`、`AdminSelectOption`、`ElAlert`、`ElButton`、`ElDialog`、`ElForm`、`ElInputNumber`、`ElPagination`、`ElRadioButton`、`ElRadioGroup`、`ElSelect`、`ElTag`。

## 维护要求

- 本步行为及验收边界见 [20_后台编辑生命周期统一与验收.md](../../../../../20_后台编辑生命周期统一与验收.md)。
- 共用编辑壳必须显式导入；业务 API、expectedUpdatedAt、权限和媒体引用规则由既有服务承担。
- docs/01–04 为受保护需求基线，不随本次实现更新。
