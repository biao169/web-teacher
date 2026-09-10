# app / pages / admin / news / editor / [uid] / index.vue

## 文件定位

- **源码路径**：`app/pages/admin/news/editor/[uid]/index.vue`
- **文件类型**：页面
- **功能定位**：后台页面入口，对应路由 /admin/news/editor/:uid；负责装配后台布局、工作区或状态页。
- **规模**：5 行，360 字节
- **内容校验**：SHA-256 `1e4b346dff5de712fdb021a787fd026858b03cd764a1f606493c294df6fc7714`
- **页面路由**：`/admin/news/editor/:uid`

## 直接依赖

- `../../../../../components/admin/complete/AdminCompleteNewsEditor.vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `uid` | computed 声明，第 3 行 | 派生 uid 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `uid`：`uid=computed(()=>String(route.params.uid||''))`

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`AdminCompleteNewsEditor`
- 事件绑定：无显式事件绑定。
- 动态属性：`uid`

## 维护注意事项

- 页面文件只负责路由装配；可复用业务状态应进入 composable，展示细节应进入 component。
