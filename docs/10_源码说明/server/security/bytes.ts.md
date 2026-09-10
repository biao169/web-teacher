# server / security / bytes.ts

## 文件定位

- **源码路径**：`server/security/bytes.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：85 行，3331 字节
- **内容校验**：SHA-256 `17146dd7e46682e23c7140f19a7c90d3f410c513701961a1e7c3312b1420542a`

## 直接依赖

- `../../shared/utils/unicode`
- `./errors`

## 直接调用方

- `server/media/config.ts`
- `server/media/grants.ts`
- `server/security/account-input.ts`
- `server/security/config.ts`
- `server/security/headers.ts`
- `server/security/identity.ts`
- `server/security/password-policy.ts`
- `server/security/password.ts`
- `server/security/tokens.ts`
- `server/services/media/media-service.ts`
- `server/view-model/serializer.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `utf8` | 函数，第 9 行 | 封装 utf8 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/media/config.ts`、`server/media/grants.ts`、`server/security/account-input.ts` 等模块导入使用。 |
| `ownedArrayBuffer` | 函数，第 14 行 | Web Crypto requires an ArrayBuffer-owned view under TypeScript 6. | 由 `server/media/config.ts`、`server/media/grants.ts`、`server/security/account-input.ts` 等模块导入使用。 |
| `utf8Length` | 函数，第 20 行 | 封装 Length 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/media/config.ts`、`server/media/grants.ts`、`server/security/account-input.ts` 等模块导入使用。 |
| `base64UrlEncode` | 函数，第 24 行 | 封装 Url Encode 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/media/config.ts`、`server/media/grants.ts`、`server/security/account-input.ts` 等模块导入使用。 |
| `base64UrlDecode` | 函数，第 39 行 | 封装 Url Decode 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/media/config.ts`、`server/media/grants.ts`、`server/security/account-input.ts` 等模块导入使用。 |
| `hexEncode` | 函数，第 63 行 | 封装 Encode 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/media/config.ts`、`server/media/grants.ts`、`server/security/account-input.ts` 等模块导入使用。 |
| `constantTimeEqual` | 函数，第 70 行 | Constant work over the supplied lengths; secret inputs in this module are fixed length. | 由 `server/media/config.ts`、`server/media/grants.ts`、`server/security/account-input.ts` 等模块导入使用。 |
| `constantTimeStringEqual` | 函数，第 77 行 | 封装 Time String Equal 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/media/config.ts`、`server/media/grants.ts`、`server/security/account-input.ts` 等模块导入使用。 |
| `randomBytes` | 函数，第 81 行 | 封装 Bytes 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/media/config.ts`、`server/media/grants.ts`、`server/security/account-input.ts` 等模块导入使用。 |

### 调用签名

- `utf8`：`export function utf8(value: string): Uint8Array`
- `ownedArrayBuffer`：`export function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer`
- `utf8Length`：`export function utf8Length(value: string): number`
- `base64UrlEncode`：`export function base64UrlEncode(bytes: Uint8Array): string`
- `base64UrlDecode`：`export function base64UrlDecode(value: string): Uint8Array`
- `hexEncode`：`export function hexEncode(bytes: Uint8Array): string`
- `constantTimeEqual`：`export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean`
- `constantTimeStringEqual`：`export function constantTimeStringEqual(left: string, right: string): boolean`
- `randomBytes`：`export function randomBytes(length: number, cryptoProvider: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): Uint8Array`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
