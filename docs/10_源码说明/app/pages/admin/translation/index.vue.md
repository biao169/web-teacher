# app / pages / admin / translation / index.vue

## 文件定位

- **源码路径**：`app/pages/admin/translation/index.vue`
- **文件类型**：页面
- **功能定位**：后台页面入口，对应路由 /admin/translation；负责装配后台布局、工作区或状态页。
- **规模**：8 行，306 字节
- **内容校验**：SHA-256 `de8e2c860ddc0a1386cc96cbea956d7f190aa944c18f39a8df0cf12353d564a2`
- **页面路由**：`/admin/translation`

## 直接依赖

- `../../../components/admin/complete/AdminCompleteTranslationWorkspace.vue`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`AdminCompleteTranslationWorkspace`
- 事件绑定：无显式事件绑定。

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
