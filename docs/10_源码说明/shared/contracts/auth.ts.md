# shared / contracts / auth.ts

## 文件定位

- **源码路径**：`shared/contracts/auth.ts`
- **文件类型**：程序模块
- **功能定位**：前后端共享契约；定义请求、响应及领域数据的 TypeScript 类型。
- **规模**：50 行，1208 字节
- **内容校验**：SHA-256 `7208a0e13e3d9ae13867d78d5d7595e335eb521b98cef3b1de8e75583d857b06`

## 直接依赖

- `../enums/auth`

## 直接调用方

- `app/components/admin/Topbar.vue`
- `app/components/admin/complete/AdminCompleteAuthWorkspace.vue`
- `app/components/admin/complete/AdminCompleteLogWorkspace.vue`
- `app/components/admin/complete/AdminCompleteTransferWorkspace.vue`
- `app/composables/useAuthSession.ts`
- `server/security/permissions.ts`
- `server/services/auth/session-service.ts`
- `shared/contracts/interactions.ts`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `SafeRoleView` | 接口，第 3 行 | 约束 Safe Role View 的数据结构或可选值 |
| `SafeUserView` | 接口，第 10 行 | 约束 Safe User View 的数据结构或可选值 |
| `AuthenticatedSessionView` | 接口，第 21 行 | 约束 Authenticated Session View 的数据结构或可选值 |
| `AnonymousSessionView` | 接口，第 29 行 | 约束 Anonymous Session View 的数据结构或可选值 |
| `SessionView` | 类型，第 33 行 | 约束 Session View 的数据结构或可选值 |
| `LoginRequestBody` | 接口，第 35 行 | 约束 Login Request Body 的数据结构或可选值 |
| `BootstrapRequestBody` | 接口，第 40 行 | 约束 Bootstrap Request Body 的数据结构或可选值 |
| `BootstrapResponse` | 接口，第 47 行 | 约束 Bootstrap Response 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
