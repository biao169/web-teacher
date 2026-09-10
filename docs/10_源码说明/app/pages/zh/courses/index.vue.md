# app / pages / zh / courses / index.vue

## 文件定位

- **源码路径**：`app/pages/zh/courses/index.vue`
- **文件类型**：页面
- **功能定位**：公开站页面入口，对应路由 /zh/courses；负责获取页面数据、设置 SEO 并渲染内容组件。
- **规模**：9 行，410 字节
- **内容校验**：SHA-256 `1f6815ec2ed6be7c2e49a0a08ee4342ceb078817c4f89b47bf2fb1ed5a976ac2`
- **页面路由**：`/zh/courses`

## 直接依赖

- `~~/shared/contracts/public-content`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`PublicContentCoursesList`
- 事件绑定：无显式事件绑定。
- 动态属性：`model`

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
