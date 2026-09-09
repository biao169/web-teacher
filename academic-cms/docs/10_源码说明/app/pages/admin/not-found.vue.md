# app / pages / admin / not-found.vue

## 文件定位

- **源码路径**：`app/pages/admin/not-found.vue`
- **文件类型**：页面
- **功能定位**：后台页面入口，对应路由 /admin/not-found；负责装配后台布局、工作区或状态页。
- **规模**：3 行，525 字节
- **内容校验**：SHA-256 `b14d81b1431cb9f1fe1f5175540bf4d6942e2c067ba767eb012c37c11af10ec9`
- **页面路由**：`/admin/not-found`

## 直接依赖

- `@lucide/vue`
- `element-plus`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`AdminStatePanel`、`ElButton`、`LayoutDashboard`
- 事件绑定：无显式事件绑定。
- 动态属性：`size`

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
