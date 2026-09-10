# tests / stage3 / media-storage.spec.mjs

## 文件定位

- **源码路径**：`tests/stage3/media-storage.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：191 行，10201 字节
- **内容校验**：SHA-256 `fcc61acd59aa1807c0cf1b9a45782a22daaa81b5792e26641cfe025dc01f3db5`

## 直接依赖

- `../helpers/offline-stage3.mjs`
- `../helpers/stage3-doubles.mjs`
- `node:assert/strict`
- `node:crypto`
- `node:fs/promises`
- `node:os`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `checksum` | 函数，第 10 行 | 检查 checksum 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `hasCode` | 函数，第 11 行 | 检查 Code 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 20 次。 |
| `withTempDirectory` | 函数，第 13 行 | 封装 Temp Directory 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `fetch` | 对象方法，第 108 行 | 读取或定位 fetch，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `fetch` | 对象方法，第 172 行 | 读取或定位 fetch，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 4 次。 |

### 调用签名

- `checksum`：`function checksum(bytes)`
- `hasCode`：`function hasCode(code)`
- `withTempDirectory`：`async function withTempDirectory(run)`
- `fetch`：`async fetch(request)`
- `fetch`：`async fetch(request)`

## 测试场景

- 第 19 行：`test` — local media store creates immutable objects and serves exact ranges
- 第 44 行：`test` — local media ETag detects same-size replacement even when mtime is restored
- 第 61 行：`test` — local media store rejects bad declarations, checksums and symlink traversal
- 第 85 行：`test` — R2 media adapter preserves metadata, conditional reads and range semantics
- 第 104 行：`test` — static fetch adapter is read-only and validates server range behavior
- 第 140 行：`test` — media input validation matches the configured one-gigabyte ceiling and rejects header injection
- 第 166 行：`test` — R2 adapter fails fast for an invalid bucket binding
- 第 170 行：`test` — static fetch adapter rejects mismatched partial response metadata

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
