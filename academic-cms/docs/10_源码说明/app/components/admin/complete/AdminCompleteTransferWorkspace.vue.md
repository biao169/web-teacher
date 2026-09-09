# app / components / admin / complete / AdminCompleteTransferWorkspace.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteTransferWorkspace.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台专项工作区组件；承载不能由通用 CRUD 表单覆盖的完整业务交互。
- **规模**：281 行，25234 字节
- **内容校验**：SHA-256 `dd8ccddb466dc4a8ced77ce199b03b1ac7457f5e1f894ebe76d39c7095ee3465`

## 直接依赖

- `../shared/AdminFormItem.vue`
- `element-plus`
- `~/admin/element-plus-ts6`
- `~/admin/download`
- `~/admin/formatters`
- `~~/shared/admin/registry`
- `~~/shared/contracts/auth`

## 直接调用方

- `app/pages/admin/import-export/index.vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `currentUser` | computed 声明 | 派生 current User 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `canExport` | computed 声明 | 派生 can Export 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `canPreview` | computed 声明 | 派生 can Preview 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `canApply` | computed 声明 | 派生 can Apply 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `groupedTables` | computed 声明 | 派生 grouped Tables 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `selectedSensitive` | computed 声明 | 派生 selected Sensitive 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `exportReady` | computed 声明 | 派生 export Ready 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `canApplyPreview` | computed 声明 | 派生 can Apply Preview 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `tableLabel` | 函数 | 返回 Label 对应的界面显示文本 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `formatBytes` | 函数 | 把 Bytes 转换为展示、传输或存储所需格式 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `errorText` | 函数 | 封装 Text 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `isCancelled` | 函数 | 检查 Cancelled 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `selectAll` | 函数 | 读取或定位 All，向调用方返回匹配结果 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `clearSelection` | 函数 | 移除或失效 Selection，同时处理相关联状态 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `invalidatePreview` | 函数 | 移除或失效 Preview，同时处理相关联状态 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `changeFormat` | 函数 | 更新 Format，并保持状态、校验与持久化结果一致 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `changeMode` | 函数 | 更新 Mode，并保持状态、校验与持久化结果一致 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `exportData` | 函数 | 封装 Data 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `readFile` | 函数 | 读取或定位 File，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `onFile` | 函数 | 响应 File 相关事件，协调后续业务流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `clearFile` | 函数 | 移除或失效 File，同时处理相关联状态 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `previewImport` | 函数 | 封装 Import 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `applyImport` | 函数 | 提交摘要锁定的原子恢复；配置恢复后提示并刷新页面，权限恢复后清理本地会话并跳转登录 | 由恢复结果区的提交按钮调用。 |

### 调用签名

- `currentUser`：`currentUser = computed<SafeUserView | null>(() => auth.session.value.authenticated ? auth.session.value.user as unknown as SafeUserView : null)`
- `canExport`：`canExport = computed(() => hasAdminPermission(currentUser.value, 'import_export', 'export'))`
- `canPreview`：`canPreview = computed(() => hasAdminPermission(currentUser.value, 'import_export', 'create'))`
- `canApply`：`canApply = computed(() => hasAdminPermission(currentUser.value, 'import_export', 'edit'))`
- `groupedTables`：`groupedTables = computed(() => GROUPS.map(group => (`
- `selectedSensitive`：`selectedSensitive = computed(() => TABLES.some(item => item.sensitive && selected.value.includes(item.key)))`
- `exportReady`：`exportReady = computed(() => canExport.value && selected.value.length > 0 && (format.value !== 'csv' || selected.value.length === 1) && (format.value !== 'backup' || (passphrase.v…`
- `canApplyPreview`：`canApplyPreview = computed(() => Boolean(canApply.value && preview.value && (restoreMode.value !== 'replace' || replacePhrase.value === 'REPLACE')))`
- `tableLabel`：`function tableLabel(key: string): string`
- `formatBytes`：`function formatBytes(value: number): string`
- `errorText`：`function errorText(value: unknown, fallback: string): string`
- `isCancelled`：`function isCancelled(value: unknown): boolean`
- `selectAll`：`function selectAll(): void`
- `clearSelection`：`function clearSelection(): void`
- `invalidatePreview`：`function invalidatePreview(): void`
- `changeFormat`：`function changeFormat(value: ExportFormat): void`
- `changeMode`：`function changeMode(value: RestoreMode): void`
- `exportData`：`async function exportData(): Promise<void>`
- `readFile`：`async function readFile(next: File): Promise<void>`
- `onFile`：`async function onFile(event: Event): Promise<void>`
- `clearFile`：`function clearFile(): void`
- `previewImport`：`async function previewImport(): Promise<void>`
- `applyImport`：`async function applyImport(): Promise<void>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `ExportFormat` | 类型 | 约束 Export Format 的数据结构或可选值 |
| `RestoreMode` | 类型 | 约束 Restore Mode 的数据结构或可选值 |
| `TransferTable` | 接口 | 约束 Transfer Table 的数据结构或可选值 |
| `ExportResponse` | 接口 | 约束 Export Response 的数据结构或可选值 |
| `PreviewTable` | 接口 | 约束 Preview Table 的数据结构或可选值 |
| `TransferPreview` | 接口 | 约束 Transfer Preview 的数据结构或可选值 |
| `ApplyResponse` | 接口 | 约束 Apply Response 的数据结构或可选值 |
| `RequestError` | 接口 | 约束 Request Error 的数据结构或可选值 |

## Vue 模板交互

- 模板约 72 行；样式区约 3 行。
- 子组件：`ElTabs`、`ElTabPane`、`ElCard`、`ElAlert`、`ElForm`、`AdminFormItem`、`ElRadioGroup`、`ElRadioButton`、`ElButton`、`ElCheckboxGroup`、`ElCheckbox`、`ElTag`、`ElInput`、`ElResult`、`ElDivider`、`ElDescriptions`、`ElDescriptionsItem`、`ElTable`、`ElTableColumn`
- 事件绑定：`change → changeFormat($event as ExportFormat)`、`click → selectAll`、`click → clearSelection`、`click → exportData`、`change → onFile`、`click → clearFile`、`input → invalidatePreview`、`change → changeMode($event as RestoreMode)`、`click → previewImport`、`click → applyImport`
- 动态属性：`closable`、`model-value`、`key`、`value`、`loading`、`disabled`、`sub-title`、`column`、`span`、`title`、`data`、`type`
- 局部样式选择器：`.transfer-page`、`.transfer-page>header h1`、`.transfer-page>header p`、`.transfer-tabs`、`.export-form`、`.restore-form`、`.selection-head`、`.primary-actions`、`.apply-row`、`.file-meta`、`.selection-head>div`、`.table-groups`、`.table-groups fieldset`、`.table-groups legend`、`.table-groups .el-checkbox-group`、`.table-groups .el-checkbox`、`.table-groups .el-checkbox span`、`.passphrase-grid`、`.passphrase-grid>.el-alert`、`.file-control`、`.file-button`、`.file-button input`、`.file-button span`、`.file-meta span`、`.preview-summary`、`.preview-summary code`、`.preview-warning`、`.preview-table`、`.preview-table small`、`.replace-confirm`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
- 预检结果必须展示配置生效范围及媒体实体的包含、缺失与容量统计；提交结果必须区分创建和复用。

## 本轮字段统一

2026-09-06：本文件涉及的表单标题改为复用 `AdminFormItem`；控件和业务提交方法保持原有职责。批量编辑通过共享字段描述符和 `AdminFieldRenderer` 渲染。验收范围与待验项目见 `docs/15_后台统一字段标题与批量编辑验收.md`。
