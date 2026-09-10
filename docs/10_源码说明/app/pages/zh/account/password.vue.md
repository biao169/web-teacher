# app / pages / zh / account / password.vue

## 文件定位

- **源码路径**：`app/pages/zh/account/password.vue`
- **文件类型**：页面
- **功能定位**：公开站页面入口，对应路由 /zh/account/password；负责获取页面数据、设置 SEO 并渲染内容组件。
- **规模**：6 行，426 字节
- **内容校验**：SHA-256 `578b996f1cb7dabe0dccb5ba6d60797a684dfd787114c554c6e342ac6a547068`
- **页面路由**：`/zh/account/password`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`PublicAuthPageShell`、`PublicAuthPasswordChangeForm`
- 事件绑定：无显式事件绑定。

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
