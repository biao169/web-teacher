# app / components / admin / Sidebar.vue

## 文件定位

- **源码路径**：`app/components/admin/Sidebar.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台界面组件；构成后台导航、标题栏、状态反馈或内容管理交互。
- **规模**：16 行，920 字节
- **内容校验**：SHA-256 `e42857b99a5531673264a647127128661d4aad942c11114e691613f18e0fd8de`

## 直接依赖

- `@lucide/vue`
- `~~/shared/admin/registry`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 9 行；样式区约 0 行。
- 子组件：`AdminBrand`、`AdminSidebarNavigation`、`PanelLeftOpen`、`PanelLeftClose`
- 事件绑定：`navigate → emit(`、`click → emit(`
- 动态属性：`class`、`collapsed`、`groups`、`aria-label`、`size`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
