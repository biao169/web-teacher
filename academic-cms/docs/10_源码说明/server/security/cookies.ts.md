# server / security / cookies.ts

## 文件定位

- **源码路径**：`server/security/cookies.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：52 行，1973 字节
- **内容校验**：SHA-256 `cf5af3e57429d659e61f0008e568dfd08d5e873b3b71f113aff9d16dc5640f36`

## 直接依赖

- `./errors`

## 直接调用方

- `server/utils/auth-http.ts`
- `server/utils/auth-runtime.ts`
- `server/utils/complete-admin/auth.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `cookiePolicy` | 函数，第 20 行 | 封装 Policy 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/utils/auth-http.ts`、`server/utils/auth-runtime.ts`、`server/utils/complete-admin/auth.ts` 等模块导入使用。 |
| `remainingCookieLifetimeSeconds` | 函数，第 36 行 | Returns the remaining cookie lifetime without allowing a refreshed cookie to | 由 `server/utils/auth-http.ts`、`server/utils/auth-runtime.ts`、`server/utils/complete-admin/auth.ts` 等模块导入使用。 |

### 调用签名

- `cookiePolicy`：`export function cookiePolicy(secure: boolean, absoluteSeconds: number): CookiePolicy`
- `remainingCookieLifetimeSeconds`：`export function remainingCookieLifetimeSeconds( expiresAt: string, maximumSeconds: number, nowMilliseconds = Date.now(), ): number`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `CSRF_HEADER` | 导出常量，第 3 行 | 提供 CSRF HEADER 的共享配置或不可变数据 |
| `CookieOptions` | 接口，第 5 行 | 约束 Cookie Options 的数据结构或可选值 |
| `CookiePolicy` | 接口，第 13 行 | 约束 Cookie Policy 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
