# app / pages / admin / system-check.vue

## 文件定位

- **源码路径**：`app/pages/admin/system-check.vue`
- **文件类型**：页面
- **功能定位**：后台页面入口，对应路由 /admin/system-check；负责装配后台布局、工作区或状态页。
- **规模**：24 行，1878 字节
- **内容校验**：SHA-256 `1da49d2293288ede47d7d8fee560f0ecc39ce058d2f2c800dbae771ef72fcb2c`
- **页面路由**：`/admin/system-check`

## 直接依赖

- `element-plus`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `rows` | computed 声明，第 9 行 | 派生 rows 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `rows`：`rows = computed<readonly CapabilityRow[]>(() => Array.isArray(data.value?.capabilities) ? data.value.capabilities : [])`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `CapabilityRow` | 接口，第 4 行 | 约束 Capability Row 的数据结构或可选值 |

## Vue 模板交互

- 模板约 12 行；样式区约 1 行。
- 子组件：`ElButton`、`ElAlert`、`ElSkeleton`、`ElTable`、`ElTableColumn`、`ElTag`、`NuxtLink`
- 事件绑定：`click → refresh()`
- 动态属性：`loading`、`rows`、`data`、`type`、`to`
- 局部样式选择器：`.capabilities`、`.capabilities>header`、`.capabilities h1`、`.capabilities p`

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
