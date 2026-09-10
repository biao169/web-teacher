# app / components / admin / content / Editor.vue

## 文件定位

- **源码路径**：`app/components/admin/content/Editor.vue`
- **文件类型**：Vue 组件
- **功能定位**：元数据驱动的通用内容编辑器，覆盖教师、研究方向、学生、论文等九个模块；维护最小字段补丁、版本令牌和专项论文助手。
- **规模**：360 行，20709 字节
- **内容校验**：SHA-256 `39a55433f863e7e2a7a9a3813bb77410093a12a3a97a9aa478baa01c64ed2a74`

## 接入与状态约定

dirty 根据字段快照与保存基线比较；后台 refetch 在 dirty 或写入中不重置表单。编辑模式必须已有 recordUpdatedAt 才可提交。成功重建基线后导航；失败保留输入和并发令牌。对象实例由 Workspace 的 key 隔离。

## 直接依赖

- `~/composables/useAdminEditorLifecycle`
- `@tanstack/vue-query`
- `@lucide/vue`
- `element-plus`
- `~/admin/errors`
- `~/admin/formatters`
- `~/admin/query-client`
- `~/admin/content-utils`
- `~/admin/editor-fields`
- `~/utils/media-fallback`
- `~~/shared/admin/identity`
- `~~/shared/admin/content-modules`
- `~~/shared/admin/publication-tools`
- `~~/shared/admin/registry`
- `~~/shared/contracts/admin-content`
- `~~/shared/admin/paths`
- `../shared/AdminEditorShell.vue`
- `../shared/AdminCheckedFormItem.vue`
- `../shared/AdminFieldRenderer.vue`
- `../shared/AdminIdentitySection.vue`
- `../complete/AdminPublicationMetadataAssistant.vue`
- `../complete/AdminPublicationCitationGenerator.vue`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `returnPath` | computed 派生状态，第 52 行 | 派生 return Path 的响应式状态，供模板和交互逻辑读取 |
| `details` | computed 派生状态，第 59 行 | 派生 details 的响应式状态，供模板和交互逻辑读取 |
| `permissions` | computed 派生状态，第 60 行 | 派生 permissions 的响应式状态，供模板和交互逻辑读取 |
| `canWrite` | computed 派生状态，第 70 行 | 派生 can Write 的响应式状态，供模板和交互逻辑读取 |
| `title` | computed 派生状态，第 71 行 | 派生 title 的响应式状态，供模板和交互逻辑读取 |
| `groupedFields` | computed 派生状态，第 72 行 | 派生 grouped Fields 的响应式状态，供模板和交互逻辑读取 |
| `editorSections` | computed 派生状态，第 78 行 | 派生 editor Sections 的响应式状态，供模板和交互逻辑读取 |
| `formSnapshot` | 函数，第 82 行 | 按元数据字段顺序序列化 UID 与字段值，用于可靠比较当前内容和保存基线。 |
| `currentSnapshot` | computed 派生状态，第 85 行 | 派生 current Snapshot 的响应式状态，供模板和交互逻辑读取 |
| `dirty` | computed 派生状态，第 86 行 | 派生 dirty 的响应式状态，供模板和交互逻辑读取 |
| `canSubmit` | computed 派生状态，第 88 行 | 派生 can Submit 的响应式状态，供模板和交互逻辑读取 |
| `publicationAppliedCount` | computed 派生状态，第 89 行 | 根据当前表单、权限或 URL 派生状态，供模板及操作校验读取。 |
| `mediaFallback` | 函数，第 91 行 | 按参数执行本文件的 mediaFallback 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `reset` | 函数，第 95 行 | 封装 reset 相关逻辑，供本文件或上层模块按其参数调用 |
| `publicationFieldLabelMark` | 函数，第 107 行 | 按参数执行本文件的 publicationFieldLabelMark 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `setPublicationAssistant` | 函数，第 111 行 | 按参数执行本文件的 setPublicationAssistant 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `isPublicationLookupField` | 函数，第 115 行 | 按参数执行本文件的 isPublicationLookupField 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `displayPublicationOriginal` | 函数，第 119 行 | 按参数执行本文件的 displayPublicationOriginal 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `applyPublicationFields` | 函数，第 123 行 | 按参数执行本文件的 applyPublicationFields 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `undoPublicationField` | 函数，第 138 行 | 按参数执行本文件的 undoPublicationField 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `undoAllPublicationFields` | 函数，第 145 行 | 按参数执行本文件的 undoAllPublicationFields 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `refreshRelatedQueries` | 函数，第 152 行 | 加载并刷新 Related Queries，同步界面或运行时状态 |
| `save` | 函数，第 212 行 | 更新 save，并保持状态、校验与持久化结果一致 |
| `focusFirstFieldError` | 函数，第 219 行 | 滚动并聚焦第一个校验失败字段。 |
| `reloadLatest` | 函数，第 227 行 | 询问是否丢弃本地修改；最新记录读取成功后更新字段、版本与基线，读取失败保留当前输入。 |
| `reloadLatestImpl` | 函数，第 228 行 | 执行 reloadLatest 的原有业务校验、版本检查和 API 操作；由同名入口通过 editor.run 调用，成功更新基线，失败保留当前编辑。 |
| `remove` | 函数，第 236 行 | 通过 editor.run 调用 removeImpl；确认、保存或删除期间拒绝重复启动。 |
| `removeImpl` | 函数，第 237 行 | 执行 remove 的原有业务校验、版本检查和 API 操作；由同名入口通过 editor.run 调用，成功更新基线，失败保留当前编辑。 |

### 调用签名

- `returnPath`：`returnPath = computed(() => safeAdminReturnPath(typeof route.query.return === 'string' ? route.query.return : props.definition.path, props.definition.path))`
- `details`：`details = computed(() => detailQuery.error.value ? adminErrorDetails(detailQuery.error.value) : null)`
- `permissions`：`permissions = computed(() => {`
- `canWrite`：`canWrite = computed(() => props.mode === 'create' ? permissions.value.create : permissions.value.edit)`
- `title`：`title = computed(() => props.mode === 'create' ? ˋ新建${props.definition.singularTitle}ˋ : ˋ${canWrite.value ? '编辑' : '查看'}${props.definition.singularTitle}ˋ)`
- `groupedFields`：`groupedFields = computed(() => props.definition.groups.map(group => ({`
- `editorSections`：`editorSections = computed(() => [`
- `formSnapshot`：`function formSnapshot(): string`
- `currentSnapshot`：`currentSnapshot = computed(formSnapshot)`
- `dirty`：`dirty = computed(() => baseline.value !== '' && currentSnapshot.value !== baseline.value)`
- `canSubmit`：`canSubmit = computed(() => (props.mode === 'create' || Boolean(recordUpdatedAt.value)) && !deleteMutation.isPending.value && canWrite.value && ADMIN_UID_PATTERN.test(uidValue.value) && !saveMutation.isPending.value && (props.mode === 'create' || dirty.value))`
- `publicationAppliedCount`：`publicationAppliedCount = computed(() => Object.keys(publicationApplied).length)`
- `mediaFallback`：`function mediaFallback(field: string): string`
- `reset`：`function reset(values: Readonly<Record<string, AdminContentValue>> | null = null, updatedAt: string | null = null, uid: string | null = null): void`
- `publicationFieldLabelMark`：`function publicationFieldLabelMark(field: string): string`
- `setPublicationAssistant`：`function setPublicationAssistant(instance: unknown): void`
- `isPublicationLookupField`：`function isPublicationLookupField(field: string): field is 'doi' | 'title'`
- `displayPublicationOriginal`：`function displayPublicationOriginal(value: AdminContentValue): string`
- `applyPublicationFields`：`function applyPublicationFields(fields: PublicationMetadataFields | Partial<PublicationGeneratedFields>, source: string): void`
- `undoPublicationField`：`function undoPublicationField(field: string): void`
- `undoAllPublicationFields`：`function undoAllPublicationFields(): void`
- `refreshRelatedQueries`：`async function refreshRelatedQueries(record?: AdminContentDetailView): Promise<void>`
- `save`：`async function save(andReturn: boolean): Promise<void>`
- `focusFirstFieldError`：`async function focusFirstFieldError(errors: Readonly<Record<string, string>>): Promise<void>`
- `reloadLatest`：`async function reloadLatest(): Promise<void>`
- `reloadLatestImpl`：`async function reloadLatestImpl(): Promise<void>`
- `remove`：`async function remove(): Promise<void>`
- `removeImpl`：`async function removeImpl(): Promise<void>`

## 模板接入

使用组件：`AdminCheckedFormItem`、`AdminEditorShell`、`AdminFieldRenderer`、`AdminIdentitySection`、`AdminPublicationCitationGenerator`、`AdminPublicationMetadataAssistant`、`AdminStatePanel`、`Clock3`、`ElAlert`、`ElButton`、`ElForm`、`ElSkeleton`、`ElSkeletonItem`、`ElTag`、`RotateCcw`、`Search`、`Trash2`。

## 维护要求

- 本步行为及验收边界见 [20_后台编辑生命周期统一与验收.md](../../../../../20_后台编辑生命周期统一与验收.md)。
- 共用编辑壳必须显式导入；业务 API、expectedUpdatedAt、权限和媒体引用规则由既有服务承担。
- docs/01–04 为受保护需求基线，不随本次实现更新。
