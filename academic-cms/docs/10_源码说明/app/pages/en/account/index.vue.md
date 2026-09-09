# app / pages / en / account / index.vue

## 文件定位

- **源码路径**：`app/pages/en/account/index.vue`
- **文件类型**：页面
- **功能定位**：公开站页面入口，对应路由 /en/account；负责获取页面数据、设置 SEO 并渲染内容组件。
- **规模**：6 行，471 字节
- **内容校验**：SHA-256 `ccbaa52248f25eb203c154bddd986b1eca1fb3e7195dfe41ced713f3ab79391b`
- **页面路由**：`/en/account`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`PublicAuthPageShell`、`PublicAuthAccountPanel`
- 事件绑定：无显式事件绑定。

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
