# app / components / admin / complete / AdminCompleteRecordEditor.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteRecordEditor.vue`
- **文件类型**：Vue 组件
- **功能定位**：资源描述驱动的编辑器，服务网站设置、全局设置、导航与按钮、新闻基础信息；保留密钥三态及字段条件校验。
- **规模**：391 行，21274 字节
- **内容校验**：SHA-256 `45de7f7cc394a0a403c7be9e345ac24ded8da0d5ec9d52c8d90a0767b1fc7e83`

## 接入与状态约定

save/remove 的入口通过 editor.run 互斥；保存成功只发出一次 saved(uid, andReturn)，不再同时触发 back。新新闻进入富文本前先以 hidden 保存草稿。startLoad 使旧请求无法覆盖新对象。reloadLatest 先确认丢弃，读取成功才替换表单。

## 直接依赖

- `~/composables/useAdminEditorLifecycle`
- `@lucide/vue`
- `element-plus`
- `~/admin/element-plus-ts6`
- `~/admin/errors`
- `~/admin/formatters`
- `~/admin/complete-resource`
- `~/admin/editor-fields`
- `~/utils/media-fallback`
- `~~/shared/admin/identity`
- `../shared/AdminEditorShell.vue`
- `../shared/AdminCheckedFormItem.vue`
- `../shared/AdminFieldRenderer.vue`
- `../shared/AdminIdentitySection.vue`
- `../shared/AdminNavigationFilterTool.vue`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `identityResource` | computed 派生状态，第 56 行 | 根据当前表单、权限或 URL 派生状态，供模板及操作校验读取。 |
| `isEdit` | computed 派生状态，第 62 行 | 派生 is Edit 的响应式状态，供模板和交互逻辑读取 |
| `completeAdminReadOnly` | computed 派生状态，第 63 行 | 派生 complete Admin Read Only 的响应式状态，供模板和交互逻辑读取 |
| `title` | computed 派生状态，第 64 行 | 派生 title 的响应式状态，供模板和交互逻辑读取 |
| `mediaFallback` | 函数，第 66 行 | 按参数执行本文件的 mediaFallback 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `applyNavigationFilter` | 函数，第 70 行 | 按参数执行本文件的 applyNavigationFilter 辅助逻辑，供下方签名对应的事件或相邻函数调用。 |
| `hasValue` | 函数，第 76 行 | 检查 Value 是否满足业务、安全或类型约束 |
| `conditionMatches` | 函数，第 77 行 | 封装 Matches 相关逻辑，供本文件或上层模块按其参数调用 |
| `fieldVisible` | 函数，第 85 行 | 封装 Visible 相关逻辑，供本文件或上层模块按其参数调用 |
| `fieldRequired` | 函数，第 86 行 | 封装 Required 相关逻辑，供本文件或上层模块按其参数调用 |
| `groups` | computed 派生状态，第 87 行 | 派生 groups 的响应式状态，供模板和交互逻辑读取 |
| `sections` | computed 派生状态，第 97 行 | 派生 sections 的响应式状态，供模板和交互逻辑读取 |
| `snapshot` | 函数，第 102 行 | 按资源字段顺序序列化 UID、字段与密钥操作三态，用于脏状态比较。 |
| `dirty` | computed 派生状态，第 109 行 | 派生 dirty 的响应式状态，供模板和交互逻辑读取 |
| `saveDisabled` | computed 派生状态，第 111 行 | 派生 save Disabled 的响应式状态，供模板和交互逻辑读取 |
| `clearState` | 函数，第 113 行 | 移除或失效 State，同时处理相关联状态 |
| `initializeSecretOperations` | 函数，第 123 行 | 封装 Secret Operations 相关逻辑，供本文件或上层模块按其参数调用 |
| `secretOperation` | 函数，第 129 行 | 封装 Operation 相关逻辑，供本文件或上层模块按其参数调用 |
| `updateSecretAction` | 函数，第 132 行 | 更新 Secret Action，并保持状态、校验与持久化结果一致 |
| `updateSecretValue` | 函数，第 139 行 | 更新 Secret Value，并保持状态、校验与持久化结果一致 |
| `displayRecord` | 函数，第 143 行 | 封装 Record 相关逻辑，供本文件或上层模块按其参数调用 |
| `markClean` | 函数，第 152 行 | 应用服务端记录，重建可编辑字段与比较基线，标记读取完成。 |
| `load` | 函数，第 161 行 | 加载并刷新 load，同步界面或运行时状态 |
| `payload` | 函数，第 182 行 | 只构造可写且实际改变的字段，附带并发版本与显式密钥变更操作。 |
| `validateClient` | 函数，第 198 行 | 按资源描述校验 UID、必填、条件、JSON 和组合字段，定位首个错误。 |
| `applyServerErrors` | 函数，第 227 行 | 将服务端字段错误映射到当前表单，保留用户输入。 |
| `save` | 函数，第 236 行 | 通过 editor.run 调用 saveImpl；确认、保存或删除期间拒绝重复启动。 |
| `saveImpl` | 函数，第 237 行 | 执行 save 的原有业务校验、版本检查和 API 操作；由同名入口通过 editor.run 调用，成功更新基线，失败保留当前编辑。 |
| `openNewsRichText` | 函数，第 258 行 | 检查新闻编辑权限；干净记录直接打开工具，否则先保存草稿或字段修改。 |
| `updateNewsFormat` | 函数，第 263 行 | 将切换为 HTML 的选择交给富文本交接流程，不直接破坏旧正文格式。 |
| `reloadLatest` | 函数，第 267 行 | 询问是否丢弃本地修改；最新记录读取成功后更新字段、版本与基线，读取失败保留当前输入。 |
| `requestBack` | 函数，第 278 行 | 请求父工作区或路由返回，由共享路由守卫进行一次未保存确认。 |
| `remove` | 函数，第 279 行 | 通过 editor.run 调用 removeImpl；确认、保存或删除期间拒绝重复启动。 |
| `removeImpl` | 函数，第 280 行 | 执行 remove 的原有业务校验、版本检查和 API 操作；由同名入口通过 editor.run 调用，成功更新基线，失败保留当前编辑。 |

### 调用签名

- `identityResource`：`identityResource = computed<AdminIdentityResource>(() => {`
- `isEdit`：`isEdit = computed(() => Boolean(props.uid))`
- `completeAdminReadOnly`：`completeAdminReadOnly = computed(() => Boolean(props.readOnly || props.resource.readOnly))`
- `title`：`title = computed(() => ˋ${completeAdminReadOnly.value ? '查看' : (isEdit.value ? '编辑' : '新建')}${props.resource.label}ˋ)`
- `mediaFallback`：`function mediaFallback(field: string): string`
- `applyNavigationFilter`：`function applyNavigationFilter(path: string): void`
- `hasValue`：`function hasValue(value: unknown): boolean`
- `conditionMatches`：`function conditionMatches(condition: any): boolean`
- `fieldVisible`：`function fieldVisible(field: any): boolean`
- `fieldRequired`：`function fieldRequired(field: any): boolean`
- `groups`：`groups = computed(() => {`
- `sections`：`sections = computed(() => [`
- `snapshot`：`function snapshot(): string`
- `dirty`：`dirty = computed(() => baseline.value !== '' && snapshot() !== baseline.value)`
- `saveDisabled`：`saveDisabled = computed(() => loading.value || !loaded.value || saving.value || deleting.value || !ADMIN_UID_PATTERN.test(uidValue.value) || (isEdit.value && !dirty.value))`
- `clearState`：`function clearState(): void`
- `initializeSecretOperations`：`function initializeSecretOperations(): void`
- `secretOperation`：`function secretOperation(fieldKey: string): SecretOperation`
- `updateSecretAction`：`function updateSecretAction(fieldKey: string, value: unknown): void`
- `updateSecretValue`：`function updateSecretValue(fieldKey: string, value: unknown): void`
- `displayRecord`：`function displayRecord(record: Record<string, any>): Record<string, any>`
- `markClean`：`function markClean(record: Record<string, any>): void`
- `load`：`async function load(): Promise<void>`
- `payload`：`function payload(): Record<string, any>`
- `validateClient`：`function validateClient(): boolean`
- `applyServerErrors`：`function applyServerErrors(failure: any): void`
- `save`：`async function save(andReturn: boolean, openRichText = false): Promise<void>`
- `saveImpl`：`async function saveImpl(andReturn: boolean, openRichText = false): Promise<void>`
- `openNewsRichText`：`async function openNewsRichText(): Promise<void>`
- `updateNewsFormat`：`function updateNewsFormat(value: unknown): void`
- `reloadLatest`：`async function reloadLatest(): Promise<void>`
- `requestBack`：`async function requestBack(): Promise<void>`
- `remove`：`async function remove(): Promise<void>`
- `removeImpl`：`async function removeImpl(): Promise<void>`

## 模板接入

使用组件：`AdminCheckedFormItem`、`AdminEditorShell`、`AdminFieldRenderer`、`AdminIdentitySection`、`AdminNavigationFilterTool`、`AdminStatePanel`、`Clock3`、`ElAlert`、`ElButton`、`ElForm`、`ElInput`、`ElOption`、`ElSelect`、`ElSkeleton`、`ElSkeletonItem`、`ElTag`、`Trash2`。

## 维护要求

- 本步行为及验收边界见 [20_后台编辑生命周期统一与验收.md](../../../../../20_后台编辑生命周期统一与验收.md)。
- 共用编辑壳必须显式导入；业务 API、expectedUpdatedAt、权限和媒体引用规则由既有服务承担。
- docs/01–04 为受保护需求基线，不随本次实现更新。
