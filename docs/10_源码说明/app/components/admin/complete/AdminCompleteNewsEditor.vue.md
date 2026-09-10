# app / components / admin / complete / AdminCompleteNewsEditor.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteNewsEditor.vue`
- **文件类型**：Vue 组件
- **功能定位**：新闻富文本正文编辑器；管理编辑文档、原始格式转换、乐观版本和返回新闻基础信息的交接。
- **规模**：211 行，11480 字节
- **内容校验**：SHA-256 `47b1dfce29f24b30edf6829f834f90dce3d8f9d983e54d2905a1e0a06007b213`

## 接入与状态约定

文档 JSON 与 baselineDocument 比较。非 HTML 原文导入后，保存才转为富文本。富文本媒体上传 busy 与通用写锁合并；加载最新版本成功后重新挂载正文工具并接收 ready 基线。

## 直接依赖

- `~/composables/useAdminEditorLifecycle`
- `@lucide/vue`
- `element-plus`
- `~/admin/errors`
- `~/admin/formatters`
- `~~/shared/admin/registry`
- `~/admin/news-rich-text`
- `./AdminCompleteRichTextEditor.client.vue`
- `../shared/AdminEditorShell.vue`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `returnPath` | computed 派生状态，第 39 行 | 根据当前表单、权限或 URL 派生状态，供模板及操作校验读取。 |
| `backLabel` | computed 派生状态，第 40 行 | 根据当前表单、权限或 URL 派生状态，供模板及操作校验读取。 |
| `currentUser` | computed 派生状态，第 43 行 | 派生 current User 的响应式状态，供模板和交互逻辑读取 |
| `canWrite` | computed 派生状态，第 44 行 | 派生 can Write 的响应式状态，供模板和交互逻辑读取 |
| `canDelete` | computed 派生状态，第 45 行 | 派生 canDelete 的响应式状态，供模板和交互逻辑读取 |
| `dirty` | computed 派生状态，第 46 行 | 派生 dirty 的响应式状态，供模板和交互逻辑读取 |
| `saveDisabled` | computed 派生状态，第 48 行 | 派生 save Disabled 的响应式状态，供模板和交互逻辑读取 |
| `publicationState` | computed 派生状态，第 49 行 | 派生 publication State 的响应式状态，供模板和交互逻辑读取 |
| `load` | 函数，第 59 行 | 加载并刷新 load，同步界面或运行时状态 |
| `save` | 函数，第 81 行 | 通过 editor.run 调用 saveImpl；确认、保存或删除期间拒绝重复启动。 |
| `saveImpl` | 函数，第 82 行 | 执行 save 的原有业务校验、版本检查和 API 操作；由同名入口通过 editor.run 调用，成功更新基线，失败保留当前编辑。 |
| `reloadLatest` | 函数，第 107 行 | 询问是否丢弃本地修改；最新记录读取成功后更新字段、版本与基线，读取失败保留当前输入。 |
| `requestBack` | 函数，第 127 行 | 请求父工作区或路由返回，由共享路由守卫进行一次未保存确认。 |
| `remove` | 函数，第 129 行 | 通过 editor.run 调用 removeImpl；确认、保存或删除期间拒绝重复启动。 |
| `removeImpl` | 函数，第 130 行 | 执行 remove 的原有业务校验、版本检查和 API 操作；由同名入口通过 editor.run 调用，成功更新基线，失败保留当前编辑。 |

### 调用签名

- `returnPath`：`returnPath = computed(() => newsEditorReturnPath(route.query.returnTo))`
- `backLabel`：`backLabel = computed(() => new URL(returnPath.value, 'https://cms.invalid').searchParams.has('edit') ? '返回新闻信息' : '返回列表')`
- `currentUser`：`currentUser = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)`
- `canWrite`：`canWrite = computed(() => hasAdminPermission(currentUser.value, 'news', 'edit'))`
- `canDelete`：`canDelete = computed(() => hasAdminPermission(currentUser.value, 'news', 'delete'))`
- `dirty`：`dirty = computed(() => !loading.value && Boolean(record.value) && baselineDocument.value !== null && (record.value?.content_format !== 'html' || JSON.stringify(documentValue.value) !== baselineDocument.value))`
- `saveDisabled`：`saveDisabled = computed(() => loading.value || saving.value || deleting.value || editorBusy.value || !documentValue.value || !dirty.value || !canWrite.value)`
- `publicationState`：`publicationState = computed(() => {`
- `load`：`async function load(): Promise<void>`
- `save`：`async function save(andReturn: boolean): Promise<void>`
- `saveImpl`：`async function saveImpl(andReturn: boolean): Promise<void>`
- `reloadLatest`：`async function reloadLatest(): Promise<void>`
- `requestBack`：`async function requestBack(): Promise<void>`
- `remove`：`async function remove(): Promise<void>`
- `removeImpl`：`async function removeImpl(): Promise<void>`

## 模板接入

使用组件：`AdminCompleteRichTextEditor`、`AdminEditorShell`、`AdminStatePanel`、`Clock3`、`ElAlert`、`ElButton`、`ElDescriptions`、`ElDescriptionsItem`、`ElSkeleton`、`ElTag`、`Trash2`。

## 维护要求

- 本步行为及验收边界见 [20_后台编辑生命周期统一与验收.md](../../../../../20_后台编辑生命周期统一与验收.md)。
- 共用编辑壳必须显式导入；业务 API、expectedUpdatedAt、权限和媒体引用规则由既有服务承担。
- docs/01–04 为受保护需求基线，不随本次实现更新。
