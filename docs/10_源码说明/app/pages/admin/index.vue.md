# app / pages / admin / index.vue

## 文件定位

- **源码路径**：`app/pages/admin/index.vue`
- **文件类型**：页面
- **功能定位**：后台页面入口，对应路由 /admin；负责装配后台布局、工作区或状态页。
- **规模**：37 行，5486 字节
- **内容校验**：SHA-256 `b420b28ff215c832fbbd0fc626b5ca56b21777663e423a1fef32e5e1f0c45202`
- **页面路由**：`/admin`

## 直接依赖

- `@lucide/vue`
- `element-plus`
- `~/admin/errors`
- `~/admin/icons`
- `~~/shared/admin/registry`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `user` | computed 声明，第 10 行 | 派生 user 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `modules` | computed 声明，第 11 行 | 派生 modules 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `details` | computed 声明，第 12 行 | 派生 details 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `sessionExpiry` | computed 声明，第 15 行 | 派生 session Expiry 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `generatedAt` | computed 声明，第 16 行 | 派生 generated At 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `user`：`user = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)`
- `modules`：`modules = computed(() => visibleAdminModules(user.value).filter(item => item.module !== 'dashboard'))`
- `details`：`details = computed(() => error.value ? adminErrorDetails(error.value) : null)`
- `sessionExpiry`：`sessionExpiry = computed(() => auth.session.value.authenticated ? formatter.format(new Date(auth.session.value.expiresAt)) : '—')`
- `generatedAt`：`generatedAt = computed(() => data.value ? timeFormatter.format(new Date(data.value.generatedAt)) : '—')`

## Vue 模板交互

- 模板约 19 行；样式区约 0 行。
- 子组件：`AdminPageHeader`、`ElButton`、`RefreshCw`、`ElAlert`、`ElSkeleton`、`ElSkeletonItem`、`ShieldCheck`、`MessageSquareText`、`ServerCog`、`Clock3`、`ElTag`、`NuxtLink`、`ExternalLink`、`AdminStatePanel`
- 事件绑定：`click → refetch()`
- 动态属性：`loading`、`size`、`closable`、`title`、`description`、`key`、`to`、`is`、`datetime`

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
