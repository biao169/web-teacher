# app / middleware / admin-auth.global.ts

## 文件定位

- **源码路径**：`app/middleware/admin-auth.global.ts`
- **文件类型**：程序模块
- **功能定位**：Nuxt 客户端路由中间件；在页面切换前执行访问控制或跳转。
- **规模**：37 行，2512 字节
- **内容校验**：SHA-256 `f60a0454eb426ff7643818d695b7ae7f02c48425f282d8dfbc65b6f5a44a1778`

## 直接依赖

- `~~/shared/admin/content-modules`
- `~~/shared/admin/paths`
- `~~/shared/admin/registry`
- `~~/shared/enums/auth`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `isAdminPath` | 函数，第 5 行 | 检查 Admin Path 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `leaveAdmin` | 函数，第 6 行 | 封装 Admin 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `denyPermission` | 函数，第 7 行 | 封装 Permission 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `default` | defineNuxtRouteMiddleware 默认处理器，第 14 行 | 封装 default 相关逻辑，供本文件或上层模块按其参数调用 | 作为模块公开能力导出；可由调用方按签名传参使用。 |

### 调用签名

- `isAdminPath`：`function isAdminPath(path: string): boolean`
- `leaveAdmin`：`function leaveAdmin(path: string)`
- `denyPermission`：`async function denyPermission(module: AuthModule, action: PermissionAction = 'view')`
- `default`：`defineNuxtRouteMiddleware(async (to) =>`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
