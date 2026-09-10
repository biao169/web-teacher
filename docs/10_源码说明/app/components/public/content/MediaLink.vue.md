# app / components / public / content / MediaLink.vue

## 文件定位

- **源码路径**：`app/components/public/content/MediaLink.vue`
- **文件类型**：Vue 组件
- **功能定位**：公开站展示组件；渲染页面区块、内容列表、详情或通用视觉元素。
- **规模**：12 行，710 字节
- **内容校验**：SHA-256 `45b6a217c764691411fce37de5baf58d031339e09765a74709dd1bffbffed9d9`

## 直接依赖

- `@lucide/vue`
- `~~/shared/contracts/public-site`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 6 行；样式区约 0 行。
- 子组件：`FileText`、`Download`、`ExternalLink`
- 事件绑定：无显式事件绑定。
- 动态属性：`href`、`download`、`size`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
