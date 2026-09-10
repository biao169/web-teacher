# app / pages / zh / courses / [uid].vue

## 文件定位

- **源码路径**：`app/pages/zh/courses/[uid].vue`
- **文件类型**：页面
- **功能定位**：公开站页面入口，对应路由 /zh/courses/:uid；负责获取页面数据、设置 SEO 并渲染内容组件。
- **规模**：14 行，574 字节
- **内容校验**：SHA-256 `a06aeb1285e4de2d257291699cb0a958337d3763d79d083520f6850c70e2377c`
- **页面路由**：`/zh/courses/:uid`

## 直接依赖

- `~~/shared/contracts/public-content`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `identifier` | computed 声明，第 5 行 | 派生 identifier 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `identifier`：`identifier = computed(() =>`

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`PublicContentCourseDetail`
- 事件绑定：无显式事件绑定。
- 动态属性：`model`

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
