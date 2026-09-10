# app / composables / useAdminDashboard.ts

## 文件定位

- **源码路径**：`app/composables/useAdminDashboard.ts`
- **文件类型**：程序模块
- **功能定位**：Nuxt/Vue 组合式逻辑模块；集中管理可复用的数据请求、状态和页面行为。
- **规模**：8 行，414 字节
- **内容校验**：SHA-256 `43aa762bc9bf5e08c172dd4e70998ce9d7a8890bf08e4d2180dea0ff5ab68259`

## 直接依赖

- `@tanstack/vue-query`
- `~/admin/query-client`
- `~~/shared/contracts/admin`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `useAdminDashboard` | 函数，第 4 行 | 封装 Dashboard 相关逻辑，供本文件或上层模块按其参数调用 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `queryFn` | 对象函数，第 6 行 | 按条件查询或整理 Fn，返回可消费的结果集 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `useAdminDashboard`：`export function useAdminDashboard()`
- `queryFn`：`queryFn: () => api.request<AdminDashboardView>('/api/v1/admin/dashboard')`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
