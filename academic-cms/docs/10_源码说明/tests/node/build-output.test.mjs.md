# tests / node / build-output.test.mjs

## 文件定位

- **源码路径**：`tests/node/build-output.test.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：109 行，4118 字节
- **内容校验**：SHA-256 `b61697f58fd6229abc5dfc81f791c358c15b8930a3aa055e1ca1bae6bb661360`

## 直接依赖

- `../../scripts/lib/build-output.mjs`
- `../../scripts/lib/cloudflare-assets.mjs`
- `node:assert/strict`
- `node:fs/promises`
- `node:os`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `createOutput` | 函数，第 25 行 | 创建 Output，并完成初始化或持久化处理 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `now` | 对象函数，第 57 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `now` | 对象函数，第 93 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `createOutput`：`async function createOutput()`
- `now`：`now: () => new Date('2026-08-29T00:00:00.000Z')`
- `now`：`now: () => new Date('invalid')`

## 测试场景

- 第 34 行：`describe` — build target contract
- 第 35 行：`it` — maps both supported targets to exact Nitro presets
- 第 45 行：`it` — normalizes safe versions and rejects ambiguous metadata versions
- 第 51 行：`it` — writes, reads, and validates matching metadata
- 第 64 行：`it` — rejects output built for another target
- 第 70 行：`it` — rejects malformed metadata
- 第 76 行：`it` — rejects metadata whose preset conflicts with its target
- 第 90 行：`it` — rejects invalid clocks before publishing metadata
- 第 99 行：`describe` — Cloudflare static asset headers
- 第 100 行：`it` — writes immutable caching only for fingerprinted Nuxt assets

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
