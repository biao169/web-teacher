# app / pages / admin / import-export / index.vue

## 文件定位

- **源码路径**：`app/pages/admin/import-export/index.vue`
- **文件类型**：页面
- **功能定位**：后台页面入口，对应路由 /admin/import-export；负责装配后台布局、工作区或状态页。
- **规模**：9 行，288 字节
- **内容校验**：SHA-256 `7f2d50397cbce0505beb1245275432803e0bf723162d6526161bd2b80b50e642`
- **页面路由**：`/admin/import-export`

## 直接依赖

- `../../../components/admin/complete/AdminCompleteTransferWorkspace.vue`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`AdminCompleteTransferWorkspace`
- 事件绑定：无显式事件绑定。

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
