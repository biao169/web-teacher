# server / services / complete-admin / auth-service.ts

## 文件定位

- **源码路径**：`server/services/complete-admin/auth-service.ts`
- **文件类型**：程序/脚本
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：402 行，24931 字节
- **内容校验**：SHA-256 `7a0775f9ebf5f6de92bc6ff3e0dbc654dded9e5898f4abe9b00b4c85bf6fc6fd`

## 直接依赖

- `h3`
- `~~/shared/complete-admin/core.mjs`
- `~~/shared/admin/registry`
- `~~/shared/enums/auth`
- `../../utils/complete-admin/auth`
- `../../utils/complete-admin/db`
- `./password-bridge`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `plain` | 函数，第 20 行 | 封装 plain 相关逻辑，供本文件或上层模块按其参数调用 |
| `bool` | 函数，第 24 行 | 封装 bool 相关逻辑，供本文件或上层模块按其参数调用 |
| `text` | 函数，第 29 行 | 封装 text 相关逻辑，供本文件或上层模块按其参数调用 |
| `expectedTimestamp` | 函数，第 38 行 | 封装 Timestamp 相关逻辑，供本文件或上层模块按其参数调用 |
| `nowAfter` | 函数，第 43 行 | 封装 After 相关逻辑，供本文件或上层模块按其参数调用 |
| `audit` | 函数，第 48 行 | 封装 audit 相关逻辑，供本文件或上层模块按其参数调用 |
| `authGeneration` | 函数，第 55 行 | 封装 Generation 相关逻辑，供本文件或上层模块按其参数调用 |
| `permissionGranted` | 函数，第 62 行 | 封装 Granted 相关逻辑，供本文件或上层模块按其参数调用 |
| `visibilityScopes` | 函数，第 71 行 | 封装 Scopes 相关逻辑，供本文件或上层模块按其参数调用 |
| `constructor` | 构造方法，第 83 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 |
| `db` | 方法，第 85 行 | 封装 db 相关逻辑，供本文件或上层模块按其参数调用 |
| `role` | 方法，第 87 行 | 封装 role 相关逻辑，供本文件或上层模块按其参数调用 |
| `assertRoleAssignable` | 方法，第 93 行 | 检查 Role Assignable 是否满足业务、安全或类型约束 |
| `targetUser` | 方法，第 101 行 | 封装 User 相关逻辑，供本文件或上层模块按其参数调用 |
| `safeUser` | 方法，第 109 行 | 封装 User 相关逻辑，供本文件或上层模块按其参数调用 |
| `assertRoleNameAvailable` | 方法，第 116 行 | 检查 Role Name Available 是否满足业务、安全或类型约束 |
| `assertLastSystemAdministratorSafe` | 方法，第 123 行 | 检查 Last System Administrator Safe 是否满足业务、安全或类型约束 |
| `overview` | 方法，第 130 行 | 封装 overview 相关逻辑，供本文件或上层模块按其参数调用 |
| `createUser` | 方法，第 155 行 | 创建 User，并完成初始化或持久化处理 |
| `updateUser` | 方法，第 180 行 | 更新 User，并保持状态、校验与持久化结果一致 |
| `resetPassword` | 方法，第 233 行 | 封装 Password 相关逻辑，供本文件或上层模块按其参数调用 |
| `saveRole` | 方法，第 251 行 | 更新 Role，并保持状态、校验与持久化结果一致 |
| `deleteRole` | 方法，第 303 行 | 移除或失效 Role，同时处理相关联状态 |
| `savePermissions` | 方法，第 323 行 | 更新 Permissions，并保持状态、校验与持久化结果一致 |
| `sessions` | 方法，第 372 行 | 封装 sessions 相关逻辑，供本文件或上层模块按其参数调用 |
| `revokeSessions` | 方法，第 381 行 | 移除或失效 Sessions，同时处理相关联状态 |

### 调用签名

- `plain`：`function plain(value: unknown, code = 'INVALID_BODY'): Record<string, any>`
- `bool`：`function bool(value: unknown): number`
- `text`：`function text(value: unknown, max: number, required = true): string | null`
- `expectedTimestamp`：`function expectedTimestamp(value: unknown): string`
- `nowAfter`：`function nowAfter(previous?: string | null): string`
- `audit`：`function audit(principal: AdminPrincipal, action: string, target: string | null, summary: string, detail: unknown, now: string): SqlOperation`
- `authGeneration`：`function authGeneration(now: string): SqlOperation`
- `permissionGranted`：`function permissionGranted(permissions: unknown, module: AuthModule, action: PermissionAction): boolean`
- `visibilityScopes`：`function visibilityScopes(value: unknown, fallback: unknown = ['public']): string`
- `constructor`：`constructor(private readonly event: H3Event, private readonly principal: AdminPrincipal)`
- `db`：`private async db(): Promise<SqlAdapter>`
- `role`：`private async role(db: SqlAdapter, uid: string): Promise<Record<string, any>>`
- `assertRoleAssignable`：`private async assertRoleAssignable(db: SqlAdapter, uid: string): Promise<Record<string, any>>`
- `targetUser`：`private async targetUser(db: SqlAdapter, uid: string): Promise<Record<string, any>>`
- `safeUser`：`private async safeUser(db: SqlAdapter, uid: string): Promise<Record<string, unknown>>`
- `assertRoleNameAvailable`：`private async assertRoleNameAvailable(db: SqlAdapter, name: string, excludingUid?: string): Promise<void>`
- `assertLastSystemAdministratorSafe`：`private async assertLastSystemAdministratorSafe(db: SqlAdapter, user: Record<string, any>, nextStatus: string, nextRole: Record<string, any>): Promise<void>`
- `overview`：`async overview(): Promise<Record<string, unknown>>`
- `createUser`：`async createUser(input: unknown): Promise<Record<string, unknown>>`
- `updateUser`：`async updateUser(uidValue: unknown, input: unknown): Promise<Record<string, unknown>>`
- `resetPassword`：`async resetPassword(uidValue: unknown, input: unknown): Promise<void>`
- `saveRole`：`async saveRole(uidValue: unknown, input: unknown): Promise<Record<string, unknown>>`
- `deleteRole`：`async deleteRole(uidValue: unknown, expectedValue: unknown): Promise<void>`
- `savePermissions`：`async savePermissions(roleUidValue: unknown, input: unknown): Promise<{ updated: number; roleUpdatedAt: string }>`
- `sessions`：`async sessions(uidValue: unknown): Promise<{ sessions: Record<string, unknown>[] }>`
- `revokeSessions`：`async revokeSessions(uidValue: unknown, input: unknown): Promise<{ revoked: number }>`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
