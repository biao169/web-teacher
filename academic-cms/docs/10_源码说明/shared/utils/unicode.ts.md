# shared / utils / unicode.ts

## 文件定位

- **源码路径**：`shared/utils/unicode.ts`
- **文件类型**：程序模块
- **功能定位**：前后端共享模块；提供跨运行时复用的类型、工具或后台定义。
- **规模**：24 行，731 字节
- **内容校验**：SHA-256 `6c25590a5f038de138de91db1a97a1d5d8b90b73aba16018a3e775085fd43adf`

## 直接调用方

- `server/cache/invalidation-map.ts`
- `server/i18n/fingerprint.ts`
- `server/media/config.ts`
- `server/media/http.ts`
- `server/media/object-key.ts`
- `server/media/store.ts`
- `server/security/bytes.ts`
- `server/services/contact/contact-service.ts`
- `server/services/media/media-service.ts`
- `server/services/public/public-content-blocks.ts`
- `server/services/public/public-query.ts`
- `server/services/public/public-row.ts`
- `server/services/public/public-values.ts`
- `server/view-model/serializer.ts`
- `shared/schemas/auth.ts`
- `shared/schemas/interactions.ts`
- `shared/utils/redirect.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `hasUnpairedSurrogate` | 函数，第 4 行 | Returns true only for malformed UTF-16; valid supplementary-plane pairs are accepted. | 由 `server/cache/invalidation-map.ts`、`server/i18n/fingerprint.ts`、`server/media/config.ts` 等模块导入使用。 |
| `codePointLength` | 函数，第 17 行 | 封装 Point Length 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/cache/invalidation-map.ts`、`server/i18n/fingerprint.ts`、`server/media/config.ts` 等模块导入使用。 |
| `utf8ByteLength` | 函数，第 21 行 | 封装 Byte Length 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/cache/invalidation-map.ts`、`server/i18n/fingerprint.ts`、`server/media/config.ts` 等模块导入使用。 |

### 调用签名

- `hasUnpairedSurrogate`：`export function hasUnpairedSurrogate(value: string): boolean`
- `codePointLength`：`export function codePointLength(value: string): number`
- `utf8ByteLength`：`export function utf8ByteLength(value: string): number`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
