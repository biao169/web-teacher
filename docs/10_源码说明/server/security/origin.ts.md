# server / security / origin.ts

## 文件定位

- **源码路径**：`server/security/origin.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：46 行，2148 字节
- **内容校验**：SHA-256 `110ff050b1d412b496cfd26c0d3610c65932e26f1c150fd12116bcb7c3c4b3cf`

## 直接依赖

- `./errors`

## 直接调用方

- `server/security/request-protection.ts`
- `server/utils/auth-http.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `canonicalizeOrigin` | 函数，第 3 行 | 规范化 Origin，消除不安全或不一致的输入形式 | 由 `server/security/request-protection.ts`、`server/utils/auth-http.ts` 等模块导入使用。 |
| `requestOrigin` | 函数，第 14 行 | 封装 Origin 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/security/request-protection.ts`、`server/utils/auth-http.ts` 等模块导入使用。 |
| `selectClientNetwork` | 函数，第 22 行 | 读取或定位 Client Network，向调用方返回匹配结果 | 由 `server/security/request-protection.ts`、`server/utils/auth-http.ts` 等模块导入使用。 |
| `normalizeNetworkValue` | 函数，第 40 行 | 规范化 Network Value，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 4 次。 |

### 调用签名

- `canonicalizeOrigin`：`export function canonicalizeOrigin(value: string, code: 'AUTH_CONFIG' | 'AUTH_ORIGIN' = 'AUTH_ORIGIN'): string`
- `requestOrigin`：`export function requestOrigin(requestUrl: string): string`
- `selectClientNetwork`：`export function selectClientNetwork(input:`
- `normalizeNetworkValue`：`function normalizeNetworkValue(value: string | null | undefined): string | null`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
