# app / components / admin / complete / AdminCompleteMediaWorkspace.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteMediaWorkspace.vue`
- **文件类型**：Vue 组件
- **功能定位**：媒体库与回收站共用工作区；包括上传、完整预览、引用查询、元数据编辑、回收恢复及到期清理。
- **规模**：785 行，47880 字节
- **内容校验**：SHA-256 `591e01e2061ad863b05809ea1d65ddeaf4afdc5e399c3f42595e511d9d42ba74`

## 接入与状态约定
媒体仍被使用或引用统计尚未读取时，回收按钮禁用。元数据保存发生版本冲突后不更新 updated_at；阻止再次覆盖，提供加载最新版本。保存、回收、确认和显式重载采用同一锁。回收站始终保留原有保留期与永久清理条件。

## 直接依赖

- `~/composables/useLatestRequest`
- `~/admin/media`
- `~/composables/useAdminEditorLifecycle`
- `../shared/AdminFormItem.vue`
- `@lucide/vue`
- `element-plus`
- `~/admin/errors`
- `~/admin/formatters`
- `~/admin/media-upload`
- `~/admin/unified-list`
- `./AdminCompleteImageCropper.client.vue`
- `./AdminCompleteSuggestionField.vue`
- `../shared/AdminDataTable.vue`
- `../shared/AdminListShell.vue`
- `../shared/AdminListToolbar.vue`
- `../shared/AdminRowActions.vue`
- `../shared/AdminEditorShell.vue`
- `~~/shared/admin/registry`
- `~~/shared/admin/identity`
- `../shared/AdminCheckedFormItem.vue`
- `../shared/AdminIdentitySection.vue`
- `../shared/AdminMediaPreview.vue`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `isTrash` | computed 派生状态，第 26 行 | 派生 is Trash 的响应式状态，供模板和交互逻辑读取 |
| `currentUser` | computed 派生状态，第 61 行 | 派生 current User 的响应式状态，供模板和交互逻辑读取 |
| `canCreate` | computed 派生状态，第 62 行 | 派生 can Create 的响应式状态，供模板和交互逻辑读取 |
| `canEdit` | computed 派生状态，第 63 行 | 派生 can Edit 的响应式状态，供模板和交互逻辑读取 |
| `canDelete` | computed 派生状态，第 64 行 | 派生 can Delete 的响应式状态，供模板和交互逻辑读取 |
| `isCurrentList` | 函数变量，第 92 行 | 文件内部的 `isCurrentList` 实现；按下方完整调用签名传入参数，参与本文件“媒体库与回收站共用工作区；包括上传、完整预览、引用查询、元数据编辑、回收恢复及到期清理。”所述流程。 |
| `editDirty` | computed 派生状态，第 114 行 | 派生 edit Dirty 的响应式状态，供模板和交互逻辑读取 |
| `editQueryUid` | computed 派生状态，第 116 行 | 派生 editQueryUid 的响应式状态，供模板和交互逻辑读取 |
| `pageTitle` | computed 派生状态，第 117 行 | 派生 page Title 的响应式状态，供模板和交互逻辑读取 |
| `pageDescription` | computed 派生状态，第 118 行 | 派生 page Description 的响应式状态，供模板和交互逻辑读取 |
| `actionLabels` | computed 派生状态，第 121 行 | 派生 action Labels 的响应式状态，供模板和交互逻辑读取 |
| `columns` | computed 派生状态，第 146 行 | 派生 columns 的响应式状态，供模板和交互逻辑读取 |
| `lifecycleErrorText` | 函数，第 159 行 | 封装 Error Text 相关逻辑，供本文件或上层模块按其参数调用 |
| `usagePath` | 函数，第 167 行 | 封装 Path 相关逻辑，供本文件或上层模块按其参数调用 |
| `formatBytes` | 函数，第 173 行 | 把 Bytes 转换为展示、传输或存储所需格式 |
| `optionLabel` | 函数，第 180 行 | 返回 Label 对应的界面显示文本 |
| `optionTone` | 函数，第 181 行 | 根据 Tone 返回对应的展示类型或颜色语义 |
| `usageCount` | 函数，第 182 行 | 按参数执行本文件的 usageCount 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `canTrash` | 函数，第 183 行 | 仅当引用检查成功、该 UID 已返回统计且引用数为零时允许回收；服务端仍执行最终引用校验。 |
| `trashTitle` | 函数，第 184 行 | 按参数执行本文件的 trashTitle 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `clearRecord` | 函数，第 186 行 | 移除或失效 Record，同时处理相关联状态 |
| `adminPreviewUrl` | 函数，第 190 行 | 按参数执行本文件的 adminPreviewUrl 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `isPreviewable` | 函数，第 195 行 | 按参数执行本文件的 isPreviewable 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `previewFallback` | 函数，第 199 行 | 按参数执行本文件的 previewFallback 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `loadStats` | 函数，第 207 行 | 加载并刷新 Stats，同步界面或运行时状态 |
| `loadPreviews` | 函数，第 213 行 | 加载并刷新 Previews，同步界面或运行时状态 |
| `refreshPreview` | 函数，第 243 行 | 按参数执行本文件的 refreshPreview 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `loadUsageSummary` | 函数，第 269 行 | 按参数执行本文件的 loadUsageSummary 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `load` | 函数，第 283 行 | 加载并刷新 load，同步界面或运行时状态 |
| `search` | 函数，第 314 行 | 按条件查询或整理 search，返回可消费的结果集 |
| `setFilter` | 函数，第 315 行 | 更新 Filter，并保持状态、校验与持久化结果一致 |
| `columnFilter` | 函数，第 319 行 | 封装 Filter 相关逻辑，供本文件或上层模块按其参数调用 |
| `onSort` | 函数，第 320 行 | 响应 Sort 相关事件，协调后续业务流程 |
| `setSelection` | 函数，第 326 行 | 更新 Selection，并保持状态、校验与持久化结果一致 |
| `mediaRow` | 函数，第 327 行 | 封装 Row 相关逻辑，供本文件或上层模块按其参数调用 |
| `onFileSelected` | 函数，第 329 行 | 响应 File Selected 相关事件，协调后续业务流程 |
| `useCropped` | 函数，第 335 行 | 封装 Cropped 相关逻辑，供本文件或上层模块按其参数调用 |
| `uploadFile` | 函数，第 341 行 | 封装 File 相关逻辑，供本文件或上层模块按其参数调用 |
| `finalizeUploadedMedia` | 函数，第 378 行 | 按参数执行本文件的 finalizeUploadedMedia 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `upload` | 函数，第 385 行 | 封装 upload 相关逻辑，供本文件或上层模块按其参数调用 |
| `showUsage` | 函数，第 387 行 | 打开 Usage 对应的界面或交互状态 |
| `setStatus` | 函数，第 404 行 | 更新 Status，并保持状态、校验与持久化结果一致 |
| `batchStatus` | 函数，第 424 行 | 封装 Status 相关逻辑，供本文件或上层模块按其参数调用 |
| `scanPage` | 函数，第 444 行 | 收集 Page 对应的数据集合，并应用必要的范围或过滤规则 |
| `deepCheck` | 函数，第 461 行 | 封装 Check 相关逻辑，供本文件或上层模块按其参数调用 |
| `checkLabel` | 函数，第 472 行 | 返回 Label 对应的界面显示文本 |
| `showPreview` | 函数，第 481 行 | 打开 Preview 对应的界面或交互状态 |
| `download` | 函数，第 488 行 | 封装 download 相关逻辑，供本文件或上层模块按其参数调用 |
| `copyKey` | 函数，第 496 行 | 封装 Key 相关逻辑，供本文件或上层模块按其参数调用 |
| `setEditRecord` | 函数，第 501 行 | 填入媒体标题、分类和版本基线，清除冲突状态。 |
| `syncEditQuery` | 函数，第 509 行 | 把当前编辑 UID 写入或移出路由查询参数，使编辑状态可以刷新、分享和前进后退恢复 |
| `mediaEditHref` | 函数，第 516 行 | 按参数执行本文件的 mediaEditHref 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `resetEdit` | 函数，第 519 行 | 清除媒体编辑对象、基线和冲突状态，并使旧加载请求失效。 |
| `restoreEditFromQuery` | 函数，第 526 行 | 读取 URL 指定的对象，只接受仍有效且 UID 匹配的最后一次加载响应。 |
| `applyEditQuery` | 函数，第 548 行 | 在路由确认完成后根据 edit 参数打开、切换或关闭编辑实例。 |
| `reloadMetadata` | 函数，第 552 行 | 显式放弃并重新读取媒体信息；媒体已回收时关闭编辑器返回列表。 |
| `saveMetadata` | 函数，第 564 行 | 通过 editor.run 调用 saveMetadataImpl；确认、保存或删除期间拒绝重复启动。 |
| `saveMetadataImpl` | 函数，第 565 行 | 执行 saveMetadata 的原有业务校验、版本检查和 API 操作；由同名入口通过 editor.run 调用，成功更新基线，失败保留当前编辑。 |
| `closeEdit` | 函数，第 593 行 | 删除 URL 中的 edit 参数；路由未通过时保留当前媒体/译文。 |
| `trashEditedMedia` | 函数，第 595 行 | 通过 editor.run 调用 trashEditedMediaImpl；确认、保存或删除期间拒绝重复启动。 |
| `trashEditedMediaImpl` | 函数，第 596 行 | 执行 trashEditedMedia 的原有业务校验、版本检查和 API 操作；由同名入口通过 editor.run 调用，成功更新基线，失败保留当前编辑。 |
| `purge` | 函数，第 606 行 | 移除或失效 purge，同时处理相关联状态 |
| `cleanupExpired` | 函数，第 622 行 | 移除或失效 Expired，同时处理相关联状态 |

### 调用签名

- `isTrash`：`isTrash = computed(() => props.mode === 'trash')`
- `currentUser`：`currentUser = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)`
- `canCreate`：`canCreate = computed(() => hasAdminPermission(currentUser.value, 'media_assets', 'create'))`
- `canEdit`：`canEdit = computed(() => hasAdminPermission(currentUser.value, 'media_assets', 'edit'))`
- `canDelete`：`canDelete = computed(() => hasAdminPermission(currentUser.value, 'media_assets', 'delete'))`
- `isCurrentList`：`isCurrentList: () => …`
- `editDirty`：`editDirty = computed(() => editOpen.value && editBaseline.value !== JSON.stringify(editForm))`
- `editQueryUid`：`editQueryUid = computed(() => typeof route.query.edit === 'string' ? route.query.edit.trim() : '')`
- `pageTitle`：`pageTitle = computed(() => isTrash.value ? '媒体回收站' : '媒体库')`
- `pageDescription`：`pageDescription = computed(() => isTrash.value`
- `actionLabels`：`actionLabels = computed(() => {`
- `columns`：`columns = computed<AdminUnifiedColumn[]>(() => [`
- `lifecycleErrorText`：`function lifecycleErrorText(value: unknown, status: 'active' | 'trash'): string`
- `usagePath`：`function usagePath(value: unknown): string | null`
- `formatBytes`：`function formatBytes(value: number): string`
- `optionLabel`：`function optionLabel(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): string`
- `optionTone`：`function optionTone(row: AdminUnifiedTableRow, column: AdminUnifiedColumn): 'success' | 'warning' | 'danger' | 'info' | 'primary'`
- `usageCount`：`function usageCount(row: MediaRow): number`
- `canTrash`：`function canTrash(row: MediaRow): boolean`
- `trashTitle`：`function trashTitle(row: MediaRow): string`
- `clearRecord`：`function clearRecord(record: Record<string, unknown>)`
- `adminPreviewUrl`：`function adminPreviewUrl(row: MediaRow): string`
- `isPreviewable`：`function isPreviewable(row: MediaRow): boolean`
- `previewFallback`：`function previewFallback(row: MediaRow): string`
- `loadStats`：`async function loadStats()`
- `loadPreviews`：`async function loadPreviews(isCurrent: () => boolean)`
- `refreshPreview`：`async function refreshPreview(row: MediaRow): Promise<void>`
- `loadUsageSummary`：`async function loadUsageSummary(isCurrent: () => boolean)`
- `load`：`async function load()`
- `search`：`function search()`
- `setFilter`：`function setFilter(key: string, value: AdminListPrimitive | undefined): void`
- `columnFilter`：`function columnFilter(key: string, value: AdminListPrimitive | undefined): void`
- `onSort`：`function onSort(value: AdminUnifiedSortChange): void`
- `setSelection`：`function setSelection(value: AdminUnifiedTableRow[]): void`
- `mediaRow`：`function mediaRow(value: AdminUnifiedTableRow): MediaRow`
- `onFileSelected`：`function onFileSelected(event: Event)`
- `useCropped`：`function useCropped(file: File)`
- `uploadFile`：`async function uploadFile(file: File)`
- `finalizeUploadedMedia`：`async function finalizeUploadedMedia(media: AdminUploadedMedia, row: MediaRow, isCurrent: () => boolean): Promise<void>`
- `upload`：`async function upload()`
- `showUsage`：`async function showUsage(row: MediaRow)`
- `setStatus`：`async function setStatus(row: MediaRow, status: 'active' | 'trash'): Promise<boolean>`
- `batchStatus`：`async function batchStatus(status: 'active' | 'trash')`
- `scanPage`：`async function scanPage(deep = false)`
- `deepCheck`：`async function deepCheck(row: MediaRow)`
- `checkLabel`：`function checkLabel(row: MediaRow): { label: string; type: 'success' | 'warning' | 'danger' | 'info' }`
- `showPreview`：`async function showPreview(row: MediaRow)`
- `download`：`function download(row: MediaRow)`
- `copyKey`：`async function copyKey(row: MediaRow)`
- `setEditRecord`：`function setEditRecord(row: MediaRow): void`
- `syncEditQuery`：`async function syncEditQuery(uid: string | null): Promise<void>`
- `mediaEditHref`：`function mediaEditHref(row: MediaRow): string`
- `resetEdit`：`function resetEdit(): void`
- `restoreEditFromQuery`：`async function restoreEditFromQuery(): Promise<void>`
- `applyEditQuery`：`async function applyEditQuery(): Promise<void>`
- `reloadMetadata`：`async function reloadMetadata(): Promise<void>`
- `saveMetadata`：`async function saveMetadata(andReturn = true): Promise<void>`
- `saveMetadataImpl`：`async function saveMetadataImpl(andReturn = true)`
- `closeEdit`：`async function closeEdit(): Promise<void>`
- `trashEditedMedia`：`async function trashEditedMedia(): Promise<void>`
- `trashEditedMediaImpl`：`async function trashEditedMediaImpl(): Promise<void>`
- `purge`：`async function purge(row: MediaRow)`
- `cleanupExpired`：`async function cleanupExpired()`

## 模板接入

子组件：`AdminCheckedFormItem`、`AdminCompleteImageCropper`、`AdminCompleteSuggestionField`、`AdminDataTable`、`AdminEditorShell`、`AdminFormItem`、`AdminIdentitySection`、`AdminListShell`、`AdminListToolbar`、`AdminMediaPreview`、`AdminRowActions`、`ElAlert`、`ElButton`、`ElCard`、`ElDescriptions`、`ElDescriptionsItem`、`ElDialog`、`ElDropdown`、`ElDropdownItem`、`ElDropdownMenu`、`ElEmpty`、`ElForm`、`ElInput`、`ElPagination`、`ElTable`、`ElTableColumn`、`ElTag`、`ExternalLink`、`Trash2`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
