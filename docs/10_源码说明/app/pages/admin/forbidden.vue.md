# app / pages / admin / forbidden.vue

## 文件定位

- **源码路径**：`app/pages/admin/forbidden.vue`
- **文件类型**：页面
- **功能定位**：后台页面入口，对应路由 /admin/forbidden；负责装配后台布局、工作区或状态页。
- **规模**：3 行，699 字节
- **内容校验**：SHA-256 `bd2899ee47cc2891079418e3320ee22740e5573beb70b61a1d6c69914ef0ab08`
- **页面路由**：`/admin/forbidden`

## 直接依赖

- `@lucide/vue`
- `element-plus`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`AdminStatePanel`、`ElButton`、`ArrowLeft`、`LayoutDashboard`
- 事件绑定：`click → router.back()`
- 动态属性：`size`

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
