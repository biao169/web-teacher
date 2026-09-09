# app / components / admin / complete / AdminCompleteLogWorkspace.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteLogWorkspace.vue`
- **文件类型**：Vue 组件
- **功能定位**：只读操作日志列表与详情；URL 记录当前详情，过期请求不能重新打开已关闭或已切换的记录。
- **规模**：256 行，18278 字节
- **内容校验**：SHA-256 `1ea7897b77c48847524638fd1f64864bdd6b96b52fa37c6d863d12466506f30d`

## 接入与状态约定

只读详情不显示保存/删除按钮，dirty 固定为 false。openDetail 先更新 detail 参数；loadDetail 只接收最新 UID 的响应。关闭后失效未完成的详情请求。

## 直接依赖

- `~/composables/useAdminEditorLifecycle`
- `../shared/AdminFormItem.vue`
- `@lucide/vue`
- `element-plus`
- `~/admin/download`
- `~/admin/formatters`
- `~/admin/unified-list`
- `~~/shared/admin/registry`
- `~~/shared/contracts/auth`
- `../shared/AdminDataTable.vue`
- `../shared/AdminListShell.vue`
- `../shared/AdminListToolbar.vue`
- `../shared/AdminRowActions.vue`
- `../shared/AdminEditorShell.vue`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `currentUser` | computed 派生状态，第 47 行 | 派生 current User 的响应式状态，供模板和交互逻辑读取 |
| `canExport` | computed 派生状态，第 48 行 | 派生 can Export 的响应式状态，供模板和交互逻辑读取 |
| `detailQueryUid` | computed 派生状态，第 65 行 | 派生 detailQueryUid 的响应式状态，供模板和交互逻辑读取 |
| `detailPretty` | computed 派生状态，第 66 行 | 派生 detail Pretty 的响应式状态，供模板和交互逻辑读取 |
| `columns` | computed 派生状态，第 72 行 | 派生 columns 的响应式状态，供模板和交互逻辑读取 |
| `queryText` | 函数，第 81 行 | 按条件查询或整理 Text，返回可消费的结果集 |
| `initializeFilters` | 函数，第 82 行 | 封装 Filters 相关逻辑，供本文件或上层模块按其参数调用 |
| `moduleLabel` | 函数，第 85 行 | 返回 Label 对应的界面显示文本 |
| `actionLabel` | 函数，第 86 行 | 返回 Label 对应的界面显示文本 |
| `statusLabel` | 函数，第 87 行 | 返回 Label 对应的界面显示文本 |
| `statusType` | 函数，第 88 行 | 根据 Type 返回对应的展示类型或颜色语义 |
| `queryValues` | 函数，第 89 行 | 按条件查询或整理 Values，返回可消费的结果集 |
| `errorText` | 函数，第 102 行 | 封装 Text 相关逻辑，供本文件或上层模块按其参数调用 |
| `load` | 函数，第 104 行 | 加载并刷新 load，同步界面或运行时状态 |
| `applyFilters` | 函数，第 121 行 | 执行 Filters 所代表的完整处理流程 |
| `setFilter` | 函数，第 122 行 | 更新 Filter，并保持状态、校验与持久化结果一致 |
| `columnFilter` | 函数，第 126 行 | 封装 Filter 相关逻辑，供本文件或上层模块按其参数调用 |
| `onSort` | 函数，第 127 行 | 响应 Sort 相关事件，协调后续业务流程 |
| `openDetail` | 函数，第 133 行 | 先将日志 UID 写入 URL；不在请求完成后重新打开旧详情。 |
| `loadDetail` | 函数，第 138 行 | 读取当前日志详情，忽略已过期或 URL 已变化的返回结果。 |
| `syncDetailQuery` | 函数，第 151 行 | 把当前日志 UID 写入或移出 detail 查询参数 |
| `applyDetailQuery` | 函数，第 158 行 | 监听日志详情参数，缺失时关闭并取消旧响应，有值时按 UID 读取。 |
| `closeDetail` | 函数，第 170 行 | 请求移除 detail 参数，保留日志列表的其他查询条件。 |
| `rowIdentifier` | 函数，第 171 行 | 封装 Identifier 相关逻辑，供本文件或上层模块按其参数调用 |
| `copyIdentifier` | 函数，第 175 行 | 封装 Identifier 相关逻辑，供本文件或上层模块按其参数调用 |
| `exportLogs` | 函数，第 183 行 | 封装 Logs 相关逻辑，供本文件或上层模块按其参数调用 |

### 调用签名

- `currentUser`：`currentUser = computed<SafeUserView | null>(() => auth.session.value.authenticated ? auth.session.value.user as unknown as SafeUserView : null)`
- `canExport`：`canExport = computed(() => hasAdminPermission(currentUser.value, 'operation_logs', 'export'))`
- `detailQueryUid`：`detailQueryUid = computed(() => queryText(route.query.detail).trim())`
- `detailPretty`：`detailPretty = computed(() => JSON.stringify(detail.value?.detail ?? {}, null, 2))`
- `columns`：`columns = computed<AdminUnifiedColumn[]>(() => [`
- `queryText`：`function queryText(value: unknown): string`
- `initializeFilters`：`function initializeFilters(): void`
- `moduleLabel`：`function moduleLabel(value: string): string`
- `actionLabel`：`function actionLabel(value: string): string`
- `statusLabel`：`function statusLabel(value: unknown): string`
- `statusType`：`function statusType(value: unknown): 'success' | 'danger' | 'info' | 'warning'`
- `queryValues`：`function queryValues(includePage = true): Record<string, string | number | boolean | undefined>`
- `errorText`：`function errorText(value: any, fallback: string): string`
- `load`：`async function load(): Promise<void>`
- `applyFilters`：`function applyFilters(): void`
- `setFilter`：`function setFilter(key: string, value: AdminListPrimitive | undefined): void`
- `columnFilter`：`function columnFilter(key: string, value: AdminListPrimitive | undefined): void`
- `onSort`：`function onSort(value: AdminUnifiedSortChange): void`
- `openDetail`：`async function openDetail(row: AdminUnifiedTableRow): Promise<void>`
- `loadDetail`：`async function loadDetail(uid: string): Promise<void>`
- `syncDetailQuery`：`async function syncDetailQuery(uid: string | null): Promise<void>`
- `applyDetailQuery`：`async function applyDetailQuery(): Promise<void>`
- `closeDetail`：`async function closeDetail(): Promise<void>`
- `rowIdentifier`：`function rowIdentifier(row: AdminUnifiedTableRow): string`
- `copyIdentifier`：`async function copyIdentifier(row: AdminUnifiedTableRow): Promise<void>`
- `exportLogs`：`async function exportLogs(): Promise<void>`

## 模板接入

使用组件：`AdminDataTable`、`AdminEditorShell`、`AdminFormItem`、`AdminListShell`、`AdminListToolbar`、`AdminRowActions`、`Copy`、`ElAlert`、`ElButton`、`ElDescriptions`、`ElDescriptionsItem`、`ElDialog`、`ElForm`、`ElPagination`、`ElRadioButton`、`ElRadioGroup`、`ElSwitch`、`ElTag`。

## 维护要求

- 本步行为及验收边界见 [20_后台编辑生命周期统一与验收.md](../../../../../20_后台编辑生命周期统一与验收.md)。
- 共用编辑壳必须显式导入；业务 API、expectedUpdatedAt、权限和媒体引用规则由既有服务承担。
- docs/01–04 为受保护需求基线，不随本次实现更新。
