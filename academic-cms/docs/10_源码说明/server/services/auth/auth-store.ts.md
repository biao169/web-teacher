# server / services / auth / auth-store.ts

## 文件定位

- **源码路径**：`server/services/auth/auth-store.ts`
- **文件类型**：程序模块
- **功能定位**：服务端持久化访问层；封装 SQL 查询和数据库读写，供业务服务调用。
- **规模**：726 行，30067 字节
- **内容校验**：SHA-256 `0843d2c20a2daad5811f671f5defc91181712b2bc62e5620eaea13d61f32693c`

## 直接依赖

- `../../../db/contracts`
- `../../../db/errors`
- `../../../db/query`
- `../../../shared/enums/auth`
- `../../audit/commands`
- `../../security/errors`
- `../../security/permissions`

## 直接调用方

- `scripts/auth/bootstrap-admin.ts`
- `server/services/auth/account-service.ts`
- `server/services/auth/authentication-service.ts`
- `server/services/auth/bootstrap-service.ts`
- `server/services/auth/registration-service.ts`
- `server/services/auth/session-service.ts`
- `server/services/auth/throttle-service.ts`
- `server/utils/auth-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `value` | 函数，第 125 行 | 封装 value 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `text` | 函数，第 130 行 | 封装 text 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 23 次。 |
| `integer` | 函数，第 137 行 | 封装 integer 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `boolean` | 函数，第 143 行 | 封装 boolean 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 20 次。 |
| `userStatus` | 函数，第 149 行 | 封装 Status 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `revokeReason` | 函数，第 155 行 | 移除或失效 Reason，同时处理相关联状态 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `parseJsonArray` | 函数，第 163 行 | 解析 Json Array 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `parsePermission` | 函数，第 174 行 | 解析 Permission 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `assertSameIdentity` | 函数，第 184 行 | 检查 Same Identity 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `assertSameSession` | 函数，第 197 行 | 检查 Same Session 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `parseCredentialRows` | 函数，第 209 行 | 解析 Credential Rows 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `principalFromCredential` | 函数，第 240 行 | 封装 From Credential 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `throttleRows` | 函数，第 286 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `monotonicUpdatedAt` | 函数，第 299 行 | 封装 Updated At 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 10 次。 |
| `AuthStore.constructor` | 构造方法，第 304 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.loginPreflight` | 类方法，第 306 行 | 封装 Preflight 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.findCredentialByUsername` | 类方法，第 319 行 | 读取或定位 Credential By Username，向调用方返回匹配结果 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.registerPublicUser` | 类方法，第 323 行 | 封装 Public User 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.changePassword` | 类方法，第 389 行 | 更新 Password，并保持状态、校验与持久化结果一致 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.resolveSessionByHash` | 类方法，第 430 行 | 读取或定位 Session By Hash，向调用方返回匹配结果 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.persistSession` | 类方法，第 451 行 | 更新 Session，并保持状态、校验与持久化结果一致 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `insertedSessionParams` | 函数变量，第 458 行 | 创建 Session Params，并完成初始化或持久化处理 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `AuthStore.touchSession` | 类方法，第 532 行 | 根据输入组装 Session 所需的结果对象或结构 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.revokeSessionByHash` | 类方法，第 546 行 | 移除或失效 Session By Hash，同时处理相关联状态 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.revokeAllForUser` | 类方法，第 567 行 | 移除或失效 All For User，同时处理相关联状态 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.revokeAllForUserWithAudit` | 类方法，第 574 行 | 移除或失效 All For User With Audit，同时处理相关联状态 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.bootstrapAvailable` | 类方法，第 591 行 | 创建 Available，并完成初始化或持久化处理 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.bootstrapAdmin` | 类方法，第 601 行 | 创建 Admin，并完成初始化或持久化处理 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.recordThrottleFailures` | 类方法，第 671 行 | 封装 Throttle Failures 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |
| `AuthStore.cleanupExpiredSecurityState` | 类方法，第 714 行 | 移除或失效 Expired Security State，同时处理相关联状态 | 由 `scripts/auth/bootstrap-admin.ts`、`server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts` 等模块导入使用。 |

### 调用签名

- `value`：`function value(row: RawRow, field: string): SqlValue`
- `text`：`function text(row: RawRow, field: string, nullable = false): string | null`
- `integer`：`function integer(row: RawRow, field: string): number`
- `boolean`：`function boolean(row: RawRow, field: string): boolean`
- `userStatus`：`function userStatus(row: RawRow, field: string): UserStatus`
- `revokeReason`：`function revokeReason(row: RawRow, field: string): SessionRevokeReason | null`
- `parseJsonArray`：`function parseJsonArray(raw: string): unknown[]`
- `parsePermission`：`function parsePermission(row: RawRow): Readonly<PermissionFlags>`
- `assertSameIdentity`：`function assertSameIdentity(row: RawRow, first: RawRow): void`
- `assertSameSession`：`function assertSameSession(row: RawRow, first: RawRow): void`
- `parseCredentialRows`：`function parseCredentialRows(rows: readonly RawRow[]): CredentialRecord | null`
- `principalFromCredential`：`export function principalFromCredential(record: CredentialRecord, sessionUid: string): AuthenticatedPrincipal`
- `throttleRows`：`function throttleRows(rows: readonly RawRow[]): ThrottleState[]`
- `monotonicUpdatedAt`：`function monotonicUpdatedAt(column = 'updated_at'): string`
- `AuthStore.constructor`：`constructor(private readonly adapter: DatabaseAdapter)`
- `AuthStore.loginPreflight`：`async loginPreflight(username: string, throttleKeys: readonly string[], now: string): Promise<LoginPreflight>`
- `AuthStore.findCredentialByUsername`：`async findCredentialByUsername(username: string): Promise<CredentialRecord | null>`
- `AuthStore.registerPublicUser`：`async registerPublicUser(input: RegisterUserInput): Promise<void>`
- `AuthStore.changePassword`：`async changePassword(input: ChangePasswordInput): Promise<void>`
- `AuthStore.resolveSessionByHash`：`async resolveSessionByHash(tokenHash: string): Promise<ResolvedSessionRecord | null>`
- `AuthStore.persistSession`：`async persistSession(input: PersistSessionInput): Promise<void>`
- `insertedSessionParams`：`insertedSessionParams = (): SqlValue[] => [ input.sessionUid, input.sessionHash, input.userUid, input.at, ]`
- `AuthStore.touchSession`：`async touchSession(tokenHash: string, now: string, idleExpiresAt: string): Promise<boolean>`
- `AuthStore.revokeSessionByHash`：`async revokeSessionByHash(tokenHash: string, at: string, reason: SessionRevokeReason, audit?: AuditEvent): Promise<boolean>`
- `AuthStore.revokeAllForUser`：`async revokeAllForUser(userUid: string, at: string, reason: SessionRevokeReason): Promise<number>`
- `AuthStore.revokeAllForUserWithAudit`：`async revokeAllForUserWithAudit( userUid: string, at: string, reason: SessionRevokeReason, audit: AuditEvent, ): Promise<number>`
- `AuthStore.bootstrapAvailable`：`async bootstrapAvailable(): Promise<boolean>`
- `AuthStore.bootstrapAdmin`：`async bootstrapAdmin(input: BootstrapAdminInput): Promise<void>`
- `AuthStore.recordThrottleFailures`：`async recordThrottleFailures( entries: readonly ThrottleEntry[], now: string, resetBefore: string, blockUntil: string, expiresAt: string, ): Promise<ThrottleState[]>`
- `AuthStore.cleanupExpiredSecurityState`：`async cleanupExpiredSecurityState(now: string, revokedBefore: string): Promise<`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `UserStatus` | 类型，第 27 行 | 约束 User Status 的数据结构或可选值 |
| `SessionRevokeReason` | 类型，第 28 行 | 约束 Session Revoke Reason 的数据结构或可选值 |
| `ThrottleScope` | 类型，第 29 行 | 约束 Throttle Scope 的数据结构或可选值 |
| `CredentialRecord` | 接口，第 31 行 | 约束 Credential Record 的数据结构或可选值 |
| `ResolvedSessionRecord` | 接口，第 48 行 | 约束 Resolved Session Record 的数据结构或可选值 |
| `PersistSessionInput` | 接口，第 62 行 | 约束 Persist Session Input 的数据结构或可选值 |
| `BootstrapAdminInput` | 接口，第 76 行 | 约束 Bootstrap Admin Input 的数据结构或可选值 |
| `RegisterUserInput` | 接口，第 86 行 | 约束 Register User Input 的数据结构或可选值 |
| `ChangePasswordInput` | 接口，第 96 行 | 约束 Change Password Input 的数据结构或可选值 |
| `ThrottleEntry` | 接口，第 105 行 | 约束 Throttle Entry 的数据结构或可选值 |
| `ThrottleState` | 接口，第 111 行 | 约束 Throttle State 的数据结构或可选值 |
| `LoginPreflight` | 接口，第 118 行 | 约束 Login Preflight 的数据结构或可选值 |
| `AuthStore` | 类，第 303 行 | 封装 Auth Store 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
