# tests / release / build-safety.test.mjs

## 文件定位

- **源码路径**：`tests/release/build-safety.test.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：124 行，8509 字节
- **内容校验**：SHA-256 `f4854abbffebcc88cd50c8af73b1cd116fb051f22b512ddeb446584e5d547dda`

## 直接依赖

- `../../scripts/lib/build-output.mjs`
- `../../scripts/release/assert-current-source.mjs`
- `../../scripts/release/build-transaction.mjs`
- `../../scripts/release/continuity.mjs`
- `../../scripts/release/environment.mjs`
- `../../scripts/release/inputs.mjs`
- `node:assert/strict`
- `node:fs/promises`
- `node:os`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `fixture` | 函数，第 14 行 | 封装 fixture 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 13 次。 |
| `oldOutput` | 函数，第 15 行 | 封装 Output 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `exists` | 函数变量，第 16 行 | 封装 exists 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |

### 调用签名

- `fixture`：`async function fixture()`
- `oldOutput`：`async function oldOutput(root)`
- `exists`：`exists = path=>access(path).then(()=>true,()=>false)`

## 测试场景

- 第 18 行：`test` — only own build target keys are accepted
- 第 21 行：`test` — failed build restores the last complete output
- 第 28 行：`test` — a successful build commits its own output and releases lock
- 第 35 行：`test` — parallel targets cannot mutate one shared build directory
- 第 42 行：`test` — a lock left by a dead or recycled build process is recovered automatically
- 第 47 行：`test` — rejecting a pre-existing output symlink does not delete that entry
- 第 54 行：`test` — missing output fails rather than retaining an old success marker
- 第 59 行：`test` — source identity responds to implementation changes but ignores reports
- 第 66 行：`test` — source symlinks are not silently fingerprinted as trusted files
- 第 70 行：`test` — exact dependency identity handles npm aliases without permitting ranges
- 第 74 行：`test` — reports-only input is returned as incomplete, not a complete source project
- 第 81 行：`test` — a symlinked temporary directory cannot move the last good build outside the project
- 第 87 行：`test` — production TypeScript excludes offline declaration substitutes from generated contexts
- 第 99 行：`test` — SSR session loads return CSRF cookie updates to the browser
- 第 106 行：`test` — personalized SSR documents declare private no-store before page rendering
- 第 113 行：`test` — build proof cannot be reused after implementation or tests change

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
