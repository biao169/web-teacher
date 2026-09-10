# server / security / permissions.ts

## 文件定位

- **源码路径**：`server/security/permissions.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：104 行，4034 字节
- **内容校验**：SHA-256 `0af986cc42105b4ee4d99b1fbce68b8848c1d3e8112e37b1266235ca54a1a90b`

## 直接依赖

- `../../shared/contracts/auth`
- `../../shared/enums/auth`
- `./errors`

## 直接调用方

- `server/security/visibility.ts`
- `server/services/admin/content-list-media.ts`
- `server/services/admin/content-service.ts`
- `server/services/admin/content-store.ts`
- `server/services/admin/dashboard-store.ts`
- `server/services/auth/auth-store.ts`
- `server/services/auth/session-service.ts`
- `server/services/media/media-service.ts`
- `server/utils/auth-guard.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `parseVisibilityScopes` | 函数，第 29 行 | 解析 Visibility Scopes 的输入格式，并输出受约束的数据结构 | 由 `server/security/visibility.ts`、`server/services/admin/content-list-media.ts`、`server/services/admin/content-service.ts` 等模块导入使用。 |
| `emptyPermissionRecord` | 函数，第 39 行 | 根据 Permission Record 返回对应的展示类型或颜色语义 | 由 `server/security/visibility.ts`、`server/services/admin/content-list-media.ts`、`server/services/admin/content-service.ts` 等模块导入使用。 |
| `permissionFlags` | 函数，第 45 行 | 封装 Flags 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/security/visibility.ts`、`server/services/admin/content-list-media.ts`、`server/services/admin/content-service.ts` 等模块导入使用。 |
| `hasPermission` | 函数，第 49 行 | 检查 Permission 是否满足业务、安全或类型约束 | 由 `server/security/visibility.ts`、`server/services/admin/content-list-media.ts`、`server/services/admin/content-service.ts` 等模块导入使用。 |
| `requirePermission` | 函数，第 56 行 | 检查 Permission 是否满足业务、安全或类型约束 | 由 `server/security/visibility.ts`、`server/services/admin/content-list-media.ts`、`server/services/admin/content-service.ts` 等模块导入使用。 |
| `canManageRole` | 函数，第 69 行 | Role hierarchy constrains role administration and never replaces module permission checks. | 由 `server/security/visibility.ts`、`server/services/admin/content-list-media.ts`、`server/services/admin/content-service.ts` 等模块导入使用。 |
| `toSafeUserView` | 函数，第 79 行 | 根据输入组装 Safe User View 所需的结果对象或结构 | 由 `server/security/visibility.ts`、`server/services/admin/content-list-media.ts`、`server/services/admin/content-service.ts` 等模块导入使用。 |

### 调用签名

- `parseVisibilityScopes`：`export function parseVisibilityScopes(value: unknown): ReadonlySet<VisibilityScope>`
- `emptyPermissionRecord`：`export function emptyPermissionRecord(): Record<AuthModule, Readonly<PermissionFlags>>`
- `permissionFlags`：`export function permissionFlags(value: PermissionFlags): Readonly<PermissionFlags>`
- `hasPermission`：`export function hasPermission(principal: AuthenticatedPrincipal | null, module: AuthModule, action: PermissionAction): boolean`
- `requirePermission`：`export function requirePermission(principal: AuthenticatedPrincipal | null, module: AuthModule, action: PermissionAction): AuthenticatedPrincipal`
- `canManageRole`：`export function canManageRole( principal: AuthenticatedPrincipal | null, target:`
- `toSafeUserView`：`export function toSafeUserView(principal: AuthenticatedPrincipal): SafeUserView`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `AuthenticatedPrincipal` | 接口，第 14 行 | 约束 Authenticated Principal 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
