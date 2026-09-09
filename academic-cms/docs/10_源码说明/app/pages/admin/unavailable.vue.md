# app / pages / admin / unavailable.vue

## 文件定位

- **源码路径**：`app/pages/admin/unavailable.vue`
- **文件类型**：页面
- **功能定位**：后台页面入口，对应路由 /admin/unavailable；负责装配后台布局、工作区或状态页。
- **规模**：3 行，708 字节
- **内容校验**：SHA-256 `e65ee9602b7654c3f684a898863948aa3794328da78fa59b2859c47d0799fe10`
- **页面路由**：`/admin/unavailable`

## 直接依赖

- `@lucide/vue`
- `element-plus`
- `~~/shared/admin/paths`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `target` | computed 声明，第 1 行 | 派生 target 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `target`：`target = computed(() => safeAdminReturnPath(route.query.next, '/admin'))`

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`AdminStatePanel`、`ElButton`、`RefreshCw`
- 事件绑定：无显式事件绑定。
- 动态属性：`href`、`size`

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
