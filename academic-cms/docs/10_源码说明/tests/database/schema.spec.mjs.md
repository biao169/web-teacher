# tests / database / schema.spec.mjs

## 文件定位

- **源码路径**：`tests/database/schema.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：89 行，6001 字节
- **内容校验**：SHA-256 `4ee7458d4968a38010005a20765532949e4fe0840e4c10b9059760aee9912170`

## 直接依赖

- `../helpers/offline-db.mjs`
- `node:assert/strict`
- `node:child_process`
- `node:fs/promises`
- `node:path`
- `node:test`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 测试场景

- 第 11 行：`test` — all 19 source tables and 343 expanded columns are represented exactly
- 第 61 行：`test` — generated TypeScript artifacts are reproducible
- 第 65 行：`test` — initial migration cannot be regenerated over an existing file
- 第 72 行：`test` — stage-2 technical security tables are migration-owned and preserve the original 19-table business contract

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
