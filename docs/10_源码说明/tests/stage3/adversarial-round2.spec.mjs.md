# tests / stage3 / adversarial-round2.spec.mjs

## 文件定位

- **源码路径**：`tests/stage3/adversarial-round2.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：146 行，6737 字节
- **内容校验**：SHA-256 `12961e61ed4ac4aba98ef69584e80a91cc780f5ebcf1c5702ca1b5b178ead2ff`

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
| `hasCode` | 函数，第 11 行 | 检查 Code 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 11 次。 |
| `sha256` | 函数，第 12 行 | 封装 sha256 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `withTempDirectory` | 函数，第 14 行 | 封装 Temp Directory 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `now` | 对象函数，第 68 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `seedMedia` | 函数，第 73 行 | 创建 Media，并完成初始化或持久化处理 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `validProjection` | 函数，第 81 行 | 封装 Projection 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `head` | 对象方法，第 93 行 | 封装 head 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `read` | 对象方法，第 93 行 | 读取或定位 read，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `put` | 对象方法，第 93 行 | 封装 put 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `delete` | 对象方法，第 93 行 | 移除或失效 delete，同时处理相关联状态 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `clock` | 对象函数，第 96 行 | 封装 clock 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `clock` | 对象函数，第 116 行 | 封装 clock 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `fetch` | 对象方法，第 129 行 | 读取或定位 fetch，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `hasCode`：`function hasCode(code)`
- `sha256`：`function sha256(bytes)`
- `withTempDirectory`：`async function withTempDirectory(run)`
- `now`：`now: () => Number.NaN`
- `seedMedia`：`function seedMedia(harness)`
- `validProjection`：`function validProjection(overrides =`
- `head`：`async head()`
- `read`：`async read()`
- `put`：`async put()`
- `delete`：`async delete()`
- `clock`：`clock: () => new Date('2026-08-29T00:00:00.000Z')`
- `clock`：`clock: () => new Date('2026-08-29T00:00:00.000Z')`
- `fetch`：`async fetch(request)`

## 测试场景

- 第 20 行：`test` — local store removes the published object when post-link verification fails
- 第 36 行：`test` — R2 store removes a newly-created object when returned metadata violates the contract
- 第 54 行：`test` — translation duplicate detection cannot collide null with literal sentinel text
- 第 67 行：`test` — memory cache rejects an invalid runtime clock without publishing immortal entries
- 第 89 行：`test` — media projection rejects invalid runtime enum values instead of signing malformed capabilities
- 第 115 行：`test` — media grant issuer validates every enum and boolean before signing
- 第 127 行：`test` — static fetch store rejects a 206 response for the wrong requested interval

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
