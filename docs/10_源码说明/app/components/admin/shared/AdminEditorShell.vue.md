# app / components / admin / shared / AdminEditorShell.vue

## 文件定位

- **源码路径**：`app/components/admin/shared/AdminEditorShell.vue`
- **文件类型**：Vue 组件
- **功能定位**：共享编辑壳：顶部区块导航、保存/保存并返回/返回、记录状态、业务危险动作及写入期间的交互锁定。
- **规模**：123 行，4723 字节
- **内容校验**：SHA-256 `bba895699f768e9ab25d93010bb5343e69b445a6ac1db8a62c1dc6763393b82e`

## 接入与状态约定

canWrite 控制可见保存动作；busy 与 saving 共同锁定字段、头尾返回按钮和快捷键。fieldset disabled 覆盖原生表单控件，inert 覆盖内容和危险/头部动作插槽中的自定义控件。壳不决定删除业务含义，也不直接调用 CRUD API。

## 直接依赖

- `@lucide/vue`
- `element-plus`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `busy` | computed 派生状态，第 34 行 | 根据当前表单、权限或 URL 派生状态，供模板及操作校验读取。 |
| `goBack` | 函数，第 35 行 | 空闲时发出 back 事件，写入期间忽略点击。 |
| `requestSave` | 函数，第 36 行 | 统一检查写权限、可保存状态和忙碌状态，发出保存或保存并返回事件。 |
| `scrollToSection` | 函数，第 43 行 | 将目标编辑区滚动到视口并标记当前导航项。 |
| `updateActiveSection` | 函数，第 48 行 | 依据滚动位置和区块坐标同步顶部导航高亮。 |
| `handleShortcut` | 函数，第 67 行 | 捕获 Ctrl/Cmd+S 并复用保存入口；不让快捷键绕过写入锁。 |

### 调用签名

- `busy`：`busy = computed(() => props.busy || props.saving)`
- `goBack`：`function goBack(): void`
- `requestSave`：`function requestSave(andReturn = false): void`
- `scrollToSection`：`function scrollToSection(id: string): void`
- `updateActiveSection`：`function updateActiveSection(): void`
- `handleShortcut`：`function handleShortcut(event: KeyboardEvent): void`

## 模板接入

使用组件：`AdminPageHeader`、`ArrowLeft`、`ElButton`、`ElTag`、`Save`。

## 维护要求

- 本步行为及验收边界见 [20_后台编辑生命周期统一与验收.md](../../../../../20_后台编辑生命周期统一与验收.md)。
- 共用编辑壳必须显式导入；业务 API、expectedUpdatedAt、权限和媒体引用规则由既有服务承担。
- docs/01–04 为受保护需求基线，不随本次实现更新。
