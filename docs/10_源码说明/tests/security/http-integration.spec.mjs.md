# tests / security / http-integration.spec.mjs

## 文件定位

- **源码路径**：`tests/security/http-integration.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：98 行，5541 字节
- **内容校验**：SHA-256 `b7e242e3979feb288873ea79cb0469299afde887d22ecf4a35b0ef27458a0c14`

## 直接依赖

- `../helpers/offline-security.mjs`
- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `stream` | 函数，第 7 行 | 封装 stream 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `pull` | 对象方法，第 10 行 | 封装 pull 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `jsonBytes` | 函数，第 19 行 | 封装 Bytes 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `stream`：`function stream(bytes, chunkSize = bytes.length || 1)`
- `pull`：`pull(controller)`
- `jsonBytes`：`function jsonBytes(value)`

## 测试场景

- 第 23 行：`test` — bounded JSON reader validates declared and streamed byte sizes
- 第 32 行：`test` — bounded JSON reader rejects malformed UTF-8, empty input and invalid JSON
- 第 39 行：`test` — authentication JSON bodies reject compressed content encodings before decoding
- 第 46 行：`test` — API security headers deny caching, framing, browser capabilities and content execution
- 第 57 行：`test` — Nuxt integration exposes complete auth routes and a mandatory admin wrapper
- 第 91 行：`test` — nonce-based document CSP is not combined with reusable SSR HTML SWR

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
