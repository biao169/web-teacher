# shared / contracts / admin.ts

## 文件定位

- **源码路径**：`shared/contracts/admin.ts`
- **文件类型**：程序模块
- **功能定位**：前后端共享契约；定义请求、响应及领域数据的 TypeScript 类型。
- **规模**：13 行，991 字节
- **内容校验**：SHA-256 `e6a029cc8c4b77989f78de569d792bfb04e75e8482b034961d736f066881ad8b`

## 直接依赖

- `../enums/auth`

## 直接调用方

- `app/composables/useAdminDashboard.ts`
- `server/routes/api/v1/admin/dashboard.get.ts`
- `server/services/admin/dashboard-store.ts`
- `server/utils/admin-handler.ts`
- `server/utils/admin-http.ts`
- `server/utils/admin-read-handler.ts`
- `server/utils/admin-write-handler.ts`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `AdminPermissionRequirement` | 接口，第 2 行 | 约束 Admin Permission Requirement 的数据结构或可选值 |
| `AdminRuntimeView` | 接口，第 3 行 | 约束 Admin Runtime View 的数据结构或可选值 |
| `AdminDashboardOperationView` | 接口，第 4 行 | 约束 Admin Dashboard Operation View 的数据结构或可选值 |
| `AdminDashboardView` | 接口，第 8 行 | 约束 Admin Dashboard View 的数据结构或可选值 |
| `AdminApiErrorBody` | 接口，第 12 行 | 约束 Admin Api Error Body 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
