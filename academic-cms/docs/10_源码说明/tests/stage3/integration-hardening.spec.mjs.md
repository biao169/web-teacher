# tests / stage3 / integration-hardening.spec.mjs

## 文件定位

- **源码路径**：`tests/stage3/integration-hardening.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：274 行，13452 字节
- **内容校验**：SHA-256 `82b097601ef14f0d18c1028feb2ccf8d4296370d6d44cd279d4f8bd2f1aca914`

## 直接依赖

- `../helpers/offline-stage3.mjs`
- `../helpers/stage3-doubles.mjs`
- `node:assert/strict`
- `node:crypto`
- `node:fs/promises`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `hasCode` | 函数变量，第 13 行 | 检查 Code 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 19 次。 |
| `translationRow` | 函数，第 15 行 | 封装 Row 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `now` | 对象函数，第 73 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `execute` | 对象函数，第 141 行 | 执行 execute 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `batch` | 对象方法，第 142 行 | 封装 batch 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `now` | 对象函数，第 176 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `markJoined` | 函数变量，第 206 行 | 封装 Joined 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `release` | 函数变量，第 225 行 | 封装 release 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `markStarted` | 函数变量，第 226 行 | 封装 Started 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `loader` | 函数变量，第 229 行 | 加载并刷新 loader，同步界面或运行时状态 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `hasCode`：`hasCode = code => error => error?.code === code`
- `translationRow`：`function translationRow(db, index, source, translated)`
- `now`：`now: () => new Date(8_640_000_000_000_000 - 1_000)`
- `execute`：`execute: command => harness.adapter.execute(command)`
- `batch`：`batch(commands)`
- `now`：`now: () => 0.5`
- `markJoined`：`markJoined = () => undefined`
- `release`：`release = () => undefined`
- `markStarted`：`markStarted = () => undefined`
- `loader`：`loader = async () =>`

## 测试场景

- 第 27 行：`test` — cache configuration canonicalizes trusted origins and rejects coercive numeric values
- 第 33 行：`test` — Cloudflare cache keys require configured origin and reuse one adapter per isolate binding
- 第 55 行：`test` — public cache policies cannot exceed the instance payload or adapter retention budgets
- 第 68 行：`test` — public cache rejects expiry dates outside the JavaScript Date range
- 第 83 行：`test` — cache invalidation rejects ambiguous empty identifiers and malformed module arrays
- 第 89 行：`test` — R2 adapter applies the configured object limit before calling the bucket
- 第 98 行：`test` — R2 validation rollback never deletes an object replaced after the attempted publish
- 第 122 行：`test` — stored translation results are bounded independently from caller input
- 第 134 行：`test` — media catalog omits the global PDF policy query when no publication PDF is projected
- 第 153 行：`test` — media grant runtime identity includes both lifetimes as well as the secret
- 第 161 行：`test` — Node media roots reject the application root and any overlap with public assets
- 第 168 行：`test` — Cloudflare adapter source contains no Host-derived cache-key fallback
- 第 175 行：`test` — memory cache rejects fractional clocks instead of creating ambiguous expiries
- 第 184 行：`test` — cache miss canonicalizes and hashes its loaded ViewModel only once before publication
- 第 203 行：`test` — cache coordinator coalesces misses across request-scoped service instances
- 第 259 行：`test` — stage-3 runner isolates compiled CommonJS output per invocation
- 第 268 行：`test` — media runtime config rejects coercive path and route values

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
