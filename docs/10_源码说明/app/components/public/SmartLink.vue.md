# app / components / public / SmartLink.vue

## 文件定位

- **源码路径**：`app/components/public/SmartLink.vue`
- **文件类型**：Vue 组件
- **功能定位**：公开站展示组件；渲染页面区块、内容列表、详情或通用视觉元素。
- **规模**：36 行，828 字节
- **内容校验**：SHA-256 `f1e2317e3b0a00c7f37c56e108a4e8dcf524f8742cd910e56796d0ceec5706cf`

## 直接依赖

- `@lucide/vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `newWindowLabel` | computed 声明，第 15 行 | 派生 new Window Label 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `newWindowLabel`：`newWindowLabel = computed(() => route.path.startsWith('/en') ? '(opens in a new window)' : '（在新窗口打开）')`

## Vue 模板交互

- 模板约 16 行；样式区约 0 行。
- 子组件：`ArrowUpRight`、`NuxtLink`
- 事件绑定：无显式事件绑定。
- 动态属性：`href`、`size`、`to`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
