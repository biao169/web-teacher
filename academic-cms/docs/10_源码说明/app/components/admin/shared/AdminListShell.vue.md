# app / components / admin / shared / AdminListShell.vue

## 文件定位

- **源码路径**：`app/components/admin/shared/AdminListShell.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台共享界面组件；统一列表、编辑器、操作按钮或字段控件的交互与样式。
- **规模**：38 行，1044 字节
- **内容校验**：SHA-256 `914edaa9e5b91375f481b5978892c23d69374a65313ee9cae6317be5e9d9901e`

## 直接依赖

- `@lucide/vue`
- `element-plus`

## 直接调用方

- `app/components/admin/complete/AdminCompleteLogWorkspace.vue`
- `app/components/admin/complete/AdminCompleteMediaWorkspace.vue`
- `app/components/admin/complete/AdminCompleteResourceWorkspace.vue`
- `app/components/admin/content/List.vue`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 16 行；样式区约 0 行。
- 子组件：`AdminPageHeader`、`ElButton`、`Plus`、`ElCard`
- 事件绑定：`click → emit(`
- 动态属性：`eyebrow`、`title`、`description`、`loading`、`size`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
