# app / pages / en / login.vue

## 文件定位

- **源码路径**：`app/pages/en/login.vue`
- **文件类型**：页面
- **功能定位**：公开站页面入口，对应路由 /en/login；负责获取页面数据、设置 SEO 并渲染内容组件。
- **规模**：6 行，461 字节
- **内容校验**：SHA-256 `8c3cc7e85f775b3bfd1d2dd0f30b9c3eaa4a67d3b1a6e105c86c47826935b7f4`
- **页面路由**：`/en/login`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`PublicAuthPageShell`、`PublicAuthLoginForm`
- 事件绑定：无显式事件绑定。

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
