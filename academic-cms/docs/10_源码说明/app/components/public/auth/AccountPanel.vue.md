# app / components / public / auth / AccountPanel.vue

## 文件定位

- **源码路径**：`app/components/public/auth/AccountPanel.vue`
- **文件类型**：Vue 组件
- **功能定位**：公开站展示组件；渲染页面区块、内容列表、详情或通用视觉元素。
- **规模**：65 行，4963 字节
- **内容校验**：SHA-256 `d536a157aac068a6a8cfdd6932b07ba34cf14299428af15dae97f07323799b5b`

## 直接依赖

- `@lucide/vue`
- `~/utils/interaction-errors`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `labels` | computed 声明，第 11 行 | 派生 labels 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `refresh` | 函数，第 23 行 | 加载并刷新 refresh，同步界面或运行时状态 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `logout` | 函数，第 28 行 | 封装 logout 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `revokeAll` | 函数，第 33 行 | 移除或失效 All，同时处理相关联状态 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `labels`：`labels = computed(() => props.locale === 'zh' ?`
- `refresh`：`async function refresh(): Promise<void>`
- `logout`：`async function logout(): Promise<void>`
- `revokeAll`：`async function revokeAll(): Promise<void>`

## Vue 模板交互

- 模板约 24 行；样式区约 0 行。
- 子组件：`PublicAuthStatusMessage`、`NuxtLink`、`UserRound`、`RefreshCw`、`KeyRound`、`ShieldCheck`、`LogOut`、`MonitorX`
- 事件绑定：`click → refresh`、`click → logout`、`click → revokeAll`
- 动态属性：`to`、`request-id`、`size`、`datetime`、`disabled`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
