# server / security / session-policy.ts

## 文件定位

- **源码路径**：`server/security/session-policy.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：81 行，3513 字节
- **内容校验**：SHA-256 `62b792c230b894b5a959c1fa1057838521fb46bf26d96f55e635bf8db566e75e`

## 直接依赖

- `./errors`

## 直接调用方

- `server/services/auth/session-service.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `canonical` | 函数，第 22 行 | 规范化 canonical，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `validateSessionPolicy` | 函数，第 28 行 | 检查 Session Policy 是否满足业务、安全或类型约束 | 由 `server/services/auth/session-service.ts` 等模块导入使用。 |
| `newSessionTimes` | 函数，第 34 行 | 封装 Session Times 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/session-service.ts` 等模块导入使用。 |
| `sessionInvalidReason` | 函数，第 57 行 | 封装 Invalid Reason 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/session-service.ts` 等模块导入使用。 |
| `nextSessionTouch` | 函数，第 71 行 | 封装 Session Touch 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/session-service.ts` 等模块导入使用。 |

### 调用签名

- `canonical`：`function canonical(time: number): string`
- `validateSessionPolicy`：`export function validateSessionPolicy(policy: SessionPolicy): void`
- `newSessionTimes`：`export function newSessionTimes(now: Date, policy: SessionPolicy = DEFAULT_SESSION_POLICY): SessionTimes`
- `sessionInvalidReason`：`export function sessionInvalidReason(input: SessionValidityInput): SessionInvalidReason | null`
- `nextSessionTouch`：`export function nextSessionTouch(now: Date, lastSeenAt: string, expiresAt: string, policy: SessionPolicy = DEFAULT_SESSION_POLICY): SessionTouch`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `SessionPolicy` | 接口，第 3 行 | 约束 Session Policy 的数据结构或可选值 |
| `DEFAULT_SESSION_POLICY` | 导出常量，第 9 行 | 提供 DEFAULT SESSION POLICY 的共享配置或不可变数据 |
| `SessionTimes` | 接口，第 15 行 | 约束 Session Times 的数据结构或可选值 |
| `SessionInvalidReason` | 类型，第 47 行 | 约束 Session Invalid Reason 的数据结构或可选值 |
| `SessionValidityInput` | 接口，第 48 行 | 约束 Session Validity Input 的数据结构或可选值 |
| `SessionTouch` | 接口，第 70 行 | 约束 Session Touch 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
