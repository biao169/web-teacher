# app / pages / admin / auth / index.vue

## 文件定位

- **源码路径**：`app/pages/admin/auth/index.vue`
- **文件类型**：页面
- **功能定位**：后台页面入口，对应路由 /admin/auth；负责装配后台布局、工作区或状态页。
- **规模**：9 行，178 字节
- **内容校验**：SHA-256 `4d4fc883e625a66f9ac119d582a06f9fa2e118c9ec18441b6d0f635a61518a10`
- **页面路由**：`/admin/auth`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 3 行；样式区约 0 行。
- 子组件：`AdminCompleteAuthWorkspace`
- 事件绑定：无显式事件绑定。

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
