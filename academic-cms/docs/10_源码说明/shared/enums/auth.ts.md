# shared / enums / auth.ts

## 文件定位

- **源码路径**：`shared/enums/auth.ts`
- **文件类型**：程序模块
- **功能定位**：前后端共享枚举；集中约束领域状态和可选值。
- **规模**：86 行，2793 字节
- **内容校验**：SHA-256 `0ec4b80a3139326cde8c588e7ec7e905fb8d67153f0cd30784d75c67ca310eff`

## 直接调用方

- `app/components/admin/complete/AdminCompleteAuthWorkspace.vue`
- `app/components/admin/complete/AdminCompleteResourceWorkspace.vue`
- `app/middleware/admin-auth.global.ts`
- `db/seeds/sample-data.ts`
- `scripts/windows/initialize-local-demo.ts`
- `server/api/v1/admin/navigation.get.ts`
- `server/cache/invalidation-map.ts`
- `server/security/permissions.ts`
- `server/security/visibility.ts`
- `server/services/admin/content-list-media.ts`
- `server/services/auth/auth-store.ts`
- `server/services/auth/bootstrap-service.ts`
- `server/services/complete-admin/auth-service.ts`
- `server/services/media/media-service.ts`
- `server/services/public/public-content-store.ts`
- `server/services/public/public-module-base.ts`
- `server/services/public/public-row.ts`
- `server/utils/admin-content-handler.ts`
- `server/utils/auth-guard.ts`
- `shared/admin/content-modules.ts`
- `shared/admin/registry.ts`
- `shared/contracts/admin.ts`
- `shared/contracts/auth.ts`
- `shared/contracts/media.ts`
- `shared/enums/media.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `isAuthModule` | 函数，第 42 行 | 检查 Auth Module 是否满足业务、安全或类型约束 | 由 `app/components/admin/complete/AdminCompleteAuthWorkspace.vue`、`app/components/admin/complete/AdminCompleteResourceWorkspace.vue`、`app/middleware/admin-auth.global.ts` 等模块导入使用。 |
| `isVisibilityScope` | 函数，第 46 行 | 检查 Visibility Scope 是否满足业务、安全或类型约束 | 由 `app/components/admin/complete/AdminCompleteAuthWorkspace.vue`、`app/components/admin/complete/AdminCompleteResourceWorkspace.vue`、`app/middleware/admin-auth.global.ts` 等模块导入使用。 |
| `emptyPermissionFlags` | 函数，第 50 行 | 根据 Permission Flags 返回对应的展示类型或颜色语义 | 由 `app/components/admin/complete/AdminCompleteAuthWorkspace.vue`、`app/components/admin/complete/AdminCompleteResourceWorkspace.vue`、`app/middleware/admin-auth.global.ts` 等模块导入使用。 |
| `permissionUid` | 函数，第 64 行 | 封装 Uid 相关逻辑，供本文件或上层模块按其参数调用 | 由 `app/components/admin/complete/AdminCompleteAuthWorkspace.vue`、`app/components/admin/complete/AdminCompleteResourceWorkspace.vue`、`app/middleware/admin-auth.global.ts` 等模块导入使用。 |
| `systemAdministratorPermissions` | 函数，第 73 行 | The built-in role can operate every module. Deletion of protected system | 由 `app/components/admin/complete/AdminCompleteAuthWorkspace.vue`、`app/components/admin/complete/AdminCompleteResourceWorkspace.vue`、`app/middleware/admin-auth.global.ts` 等模块导入使用。 |

### 调用签名

- `isAuthModule`：`export function isAuthModule(value: unknown): value is AuthModule`
- `isVisibilityScope`：`export function isVisibilityScope(value: unknown): value is VisibilityScope`
- `emptyPermissionFlags`：`export function emptyPermissionFlags(): PermissionFlags`
- `permissionUid`：`export function permissionUid(module: AuthModule): string`
- `systemAdministratorPermissions`：`export function systemAdministratorPermissions(): Readonly<Record<AuthModule, PermissionFlags>>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `AUTH_MODULES` | 导出常量，第 1 行 | 提供 AUTH MODULES 的共享配置或不可变数据 |
| `AuthModule` | 类型，第 23 行 | 约束 Auth Module 的数据结构或可选值 |
| `PERMISSION_ACTIONS` | 导出常量，第 25 行 | 提供 PERMISSION ACTIONS 的共享配置或不可变数据 |
| `PermissionAction` | 类型，第 26 行 | 约束 Permission Action 的数据结构或可选值 |
| `PermissionFlags` | 接口，第 28 行 | 约束 Permission Flags 的数据结构或可选值 |
| `VISIBILITY_SCOPES` | 导出常量，第 36 行 | 提供 VISIBILITY SCOPES 的共享配置或不可变数据 |
| `VisibilityScope` | 类型，第 37 行 | 约束 Visibility Scope 的数据结构或可选值 |
| `SYSTEM_ADMIN_ROLE_UID` | 导出常量，第 54 行 | 提供 SYSTEM ADMIN ROLE UID 的共享配置或不可变数据 |
| `SYSTEM_ADMIN_ROLE_NAME` | 导出常量，第 55 行 | 提供 SYSTEM ADMIN ROLE NAME 的共享配置或不可变数据 |
| `SYSTEM_ADMIN_ROLE_LEVEL` | 导出常量，第 56 行 | 提供 SYSTEM ADMIN ROLE LEVEL 的共享配置或不可变数据 |
| `REGISTERED_USER_ROLE_UID` | 导出常量，第 59 行 | Built-in least-privilege role used only for explicitly enabled public registration. |
| `REGISTERED_USER_ROLE_NAME` | 导出常量，第 60 行 | 提供 REGISTERED USER ROLE NAME 的共享配置或不可变数据 |
| `REGISTERED_USER_ROLE_LEVEL` | 导出常量，第 61 行 | 提供 REGISTERED USER ROLE LEVEL 的共享配置或不可变数据 |
| `REGISTERED_USER_VISIBILITY_SCOPES` | 导出常量，第 62 行 | 提供 REGISTERED USER VISIBILITY SCOPES 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
