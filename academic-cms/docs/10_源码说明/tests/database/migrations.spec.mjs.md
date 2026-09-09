# tests / database / migrations.spec.mjs

## 文件定位

- **源码路径**：`tests/database/migrations.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：101 行，6691 字节
- **内容校验**：SHA-256 `e8fbe3c677a12e7af5ec4e3964f2b72c91e16cd8f63af17d66adc7f84dbec0fa`

## 直接依赖

- `../../scripts/db/migrations.mjs`
- `../helpers/offline-db.mjs`
- `node:assert/strict`
- `node:child_process`
- `node:fs/promises`
- `node:os`
- `node:path`
- `node:sqlite`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `memory` | 函数，第 10 行 | 封装 memory 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 12 次。 |
| `migration` | 函数，第 11 行 | 封装 migration 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 17 次。 |

### 调用签名

- `memory`：`function memory(run)`
- `migration`：`function migration(name, sql)`

## 测试场景

- 第 13 行：`test` — migration apply is idempotent and preserves existing records
- 第 19 行：`test` — a failing incremental migration rolls back DDL, data and ledger
- 第 29 行：`test` — first-migration failure leaves no application or ledger tables
- 第 34 行：`test` — changed applied migration is rejected before any new SQL runs
- 第 39 行：`test` — unknown migration history is rejected
- 第 44 行：`test` — an unversioned existing database is not silently adopted
- 第 50 行：`test` — nested migration execution is rejected without ending the caller transaction
- 第 55 行：`test` — manifest detects modified SQL before database access
- 第 64 行：`test` — planning an absent SQLite database creates no file or directory
- 第 75 行：`test` — remote D1 migration refuses a placeholder ID before invoking Wrangler
- 第 79 行：`test` — offline migration SQL splitter preserves semicolons in quoted values
- 第 84 行：`test` — migration SQL cannot escape atomicity with an embedded COMMIT
- 第 91 行：`test` — transaction control hidden after comments is rejected before any writes
- 第 96 行：`test` — transaction words inside SQL values do not trigger false positives

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
