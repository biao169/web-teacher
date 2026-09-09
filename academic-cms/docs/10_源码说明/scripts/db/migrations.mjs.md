# scripts / db / migrations.mjs

## 文件定位

- **源码路径**：`scripts/db/migrations.mjs`
- **文件类型**：脚本
- **功能定位**：数据库维护脚本；生成 Schema、执行迁移、更新清单或管理 D1。
- **规模**：88 行，5559 字节
- **内容校验**：SHA-256 `4b3b054918e5dc4d067e4c0b95146a39e85164c1f099d6fd531d53577f675361`

## 直接依赖

- `node:crypto`
- `node:fs/promises`
- `node:path`

## 直接调用方

- `scripts/db/d1.mjs`
- `scripts/db/migrate.mjs`
- `scripts/db/update-manifest.mjs`
- `scripts/release/admin-production-regression.mjs`
- `scripts/release/production-browser.mjs`
- `scripts/verify-stage1.mjs`
- `scripts/verify-stage2.mjs`
- `scripts/verify-stage26.mjs`
- `scripts/verify-stage27.mjs`
- `scripts/verify-stage3.mjs`
- `scripts/verify-stage4.mjs`
- `scripts/verify-stage5.mjs`
- `scripts/verify-stage6.mjs`
- `scripts/windows/initialize-local-demo.ts`
- `tests/backend/auth-management-completeness.test.mjs`
- `tests/database/migrations.spec.mjs`
- `tests/helpers/offline-db.mjs`
- `tests/helpers/offline-security.mjs`
- `tests/helpers/offline-stage27.mjs`
- `tests/helpers/offline-stage3.mjs`
- `tests/helpers/offline-stage4.mjs`
- `tests/helpers/offline-stage6.mjs`
- `tests/native/repository.spec.ts`
- `tests/native/runtime.spec.ts`
- `tests/release/native-services.spec.mjs`
- `tests/stage27/service.spec.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `sha256` | 函数变量，第 6 行 | 封装 sha256 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/db/d1.mjs`、`scripts/db/migrate.mjs`、`scripts/db/update-manifest.mjs` 等模块导入使用。 |
| `loadMigrations` | 函数，第 7 行 | 加载并刷新 Migrations，同步界面或运行时状态 | 由 `scripts/db/d1.mjs`、`scripts/db/migrate.mjs`、`scripts/db/update-manifest.mjs` 等模块导入使用。 |
| `planMigrations` | 函数，第 25 行 | 封装 Migrations 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/db/d1.mjs`、`scripts/db/migrate.mjs`、`scripts/db/update-manifest.mjs` 等模块导入使用。 |
| `applyMigrations` | 函数，第 40 行 | Synchronous transactions avoid interleaving await with writes on a shared connection. | 由 `scripts/db/d1.mjs`、`scripts/db/migrate.mjs`、`scripts/db/update-manifest.mjs` 等模块导入使用。 |
| `validateMigrationSql` | 函数，第 63 行 | Migration files cannot take transaction ownership or modify attached databases. | 由 `scripts/db/d1.mjs`、`scripts/db/migrate.mjs`、`scripts/db/update-manifest.mjs` 等模块导入使用。 |
| `splitSql` | 函数，第 72 行 | Quote/comment-aware splitting; triggers are deliberately outside the stage-1 contract. | 由 `scripts/db/d1.mjs`、`scripts/db/migrate.mjs`、`scripts/db/update-manifest.mjs` 等模块导入使用。 |

### 调用签名

- `sha256`：`sha256 = data => createHash('sha256').update(data).digest('hex')`
- `loadMigrations`：`export async function loadMigrations(directory)`
- `planMigrations`：`export function planMigrations(db, migrations)`
- `applyMigrations`：`export function applyMigrations(db, migrations)`
- `validateMigrationSql`：`export function validateMigrationSql(sql)`
- `splitSql`：`export function splitSql(sql)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
