# app / pages / admin / settings / index.vue

## 文件定位

- **源码路径**：`app/pages/admin/settings/index.vue`
- **文件类型**：页面
- **功能定位**：后台页面入口，对应路由 /admin/settings；负责装配后台布局、工作区或状态页。
- **规模**：30 行，1519 字节
- **内容校验**：SHA-256 `d143254c7c2dc007f96488668014306a7d4bd2dae613d90d70b77ef0e971a171`
- **页面路由**：`/admin/settings`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 14 行；样式区约 3 行。
- 子组件：`NuxtLink`
- 事件绑定：无显式事件绑定。
- 动态属性：`key`、`to`
- 局部样式选择器：`.admin-settings-hub`、`.settings-grid`、`.settings-card`、`.settings-card:hover`、`.settings-card span`

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
