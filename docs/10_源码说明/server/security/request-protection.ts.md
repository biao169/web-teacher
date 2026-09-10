# server / security / request-protection.ts

## 文件定位

- **源码路径**：`server/security/request-protection.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：73 行，2703 字节
- **内容校验**：SHA-256 `62474c02fe4788e6c82ab3f50409a5af1c4f3324d76ef859da6c9496649fb911`

## 直接依赖

- `./errors`
- `./origin`
- `./tokens`

## 直接调用方

- `server/utils/auth-http.ts`
- `server/utils/complete-admin/auth.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `normalizedMethod` | 函数，第 23 行 | 规范化 Method，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `isSafeMethod` | 函数，第 30 行 | 检查 Safe Method 是否满足业务、安全或类型约束 | 由 `server/utils/auth-http.ts`、`server/utils/complete-admin/auth.ts` 等模块导入使用。 |
| `mediaType` | 函数，第 34 行 | 根据 Type 返回对应的展示类型或颜色语义 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `protectUnsafeRequest` | 函数，第 40 行 | Protects state-changing, browser-facing endpoints before their body is consumed. | 由 `server/utils/auth-http.ts`、`server/utils/complete-admin/auth.ts` 等模块导入使用。 |

### 调用签名

- `normalizedMethod`：`function normalizedMethod(value: string): string`
- `isSafeMethod`：`export function isSafeMethod(method: string): boolean`
- `mediaType`：`function mediaType(value: string | null | undefined): string | null`
- `protectUnsafeRequest`：`export async function protectUnsafeRequest(input: UnsafeRequestProtectionInput): Promise<void>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `UnsafeRequestProtectionInput` | 接口，第 8 行 | 约束 Unsafe Request Protection Input 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
