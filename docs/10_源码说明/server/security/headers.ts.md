# server / security / headers.ts

## 文件定位

- **源码路径**：`server/security/headers.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：68 行，2785 字节
- **内容校验**：SHA-256 `d8733053ecf03ad41ba26de51c4539b14a6454ba679a1fa611b90f1c759823b4`

## 直接依赖

- `./bytes`
- `./errors`

## 直接调用方

- `server/middleware/01-api-security.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `createCspNonce` | 函数，第 9 行 | 创建 Csp Nonce，并完成初始化或持久化处理 | 由 `server/middleware/01-api-security.ts` 等模块导入使用。 |
| `buildContentSecurityPolicy` | 函数，第 13 行 | 根据输入组装 Content Security Policy 所需的结果对象或结构 | 由 `server/middleware/01-api-security.ts` 等模块导入使用。 |
| `buildSecurityHeaders` | 函数，第 37 行 | 根据输入组装 Security Headers 所需的结果对象或结构 | 由 `server/middleware/01-api-security.ts` 等模块导入使用。 |
| `buildApiSecurityHeaders` | 函数，第 52 行 | 根据输入组装 Api Security Headers 所需的结果对象或结构 | 由 `server/middleware/01-api-security.ts` 等模块导入使用。 |

### 调用签名

- `createCspNonce`：`export function createCspNonce(cryptoProvider: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): string`
- `buildContentSecurityPolicy`：`export function buildContentSecurityPolicy(nonce: string, production: boolean): string`
- `buildSecurityHeaders`：`export function buildSecurityHeaders(options: SecurityHeaderOptions): Readonly<Record<string, string>>`
- `buildApiSecurityHeaders`：`export function buildApiSecurityHeaders(production: boolean): Readonly<Record<string, string>>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `SecurityHeaderOptions` | 接口，第 4 行 | 约束 Security Header Options 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
