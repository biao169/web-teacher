# tests / stage3 / cache.spec.mjs

## 文件定位

- **源码路径**：`tests/stage3/cache.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：204 行，9951 字节
- **内容校验**：SHA-256 `48a8787c8fb2656d05a99a509351423f9c71b2e44531cf55af1343740204d9e2`

## 直接依赖

- `../helpers/offline-stage3.mjs`
- `../helpers/stage3-doubles.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `bytes` | 函数，第 6 行 | 封装 bytes 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 20 次。 |
| `now` | 对象函数，第 28 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `get` | 对象方法，第 82 行 | 读取或定位 get，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 17 次。 |
| `put` | 对象方法，第 83 行 | 封装 put 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 10 次。 |
| `delete` | 对象方法，第 84 行 | 移除或失效 delete，同时处理相关联状态 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `onAdapterError` | 对象函数，第 86 行 | 响应 Adapter Error 相关事件，协调后续业务流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `loader` | 函数变量，第 106 行 | 加载并刷新 loader，同步界面或运行时状态 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `now` | 对象函数，第 168 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |

### 调用签名

- `bytes`：`function bytes(text)`
- `now`：`now: () => now`
- `get`：`async get()`
- `put`：`async put()`
- `delete`：`async delete()`
- `onAdapterError`：`onAdapterError: (operation) => operations.push(operation)`
- `loader`：`loader = async () =>`
- `now`：`now: () => Number.NaN`

## 测试场景

- 第 26 行：`test` — memory cache is bounded LRU, copy-safe and expires entries
- 第 49 行：`test` — Cloudflare cache adapter validates envelopes and makes defensive copies
- 第 67 行：`test` — public cache removes corrupt entries and fails open on adapter outages
- 第 94 行：`test` — public cache coalesces concurrent misses and does not publish across invalidation
- 第 136 行：`test` — public cache rejects sensitive data in descriptors and payloads
- 第 155 行：`test` — cache invalidation map includes module, aggregate and stable record tags
- 第 167 行：`test` — cache adapters fail closed on malformed clocks and Cloudflare envelopes
- 第 193 行：`test` — public cache validates constructor limits before any cache access

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
