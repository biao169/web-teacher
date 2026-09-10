# tests / complete-admin / core.test.mjs

## 文件定位

- **源码路径**：`tests/complete-admin/core.test.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：146 行，11507 字节
- **内容校验**：SHA-256 `bd5fc266d1acca66b573505c9d6af19e2f8399f34c550706af1dc2615a6f19d8`

## 直接依赖

- `node:test`
- `node:assert/strict`
- `../../shared/complete-admin/core.mjs`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 测试场景

- 第 9 行：`test` — catalog exposes every remaining backend area
- 第 17 行：`test` — every complete-resource field carries reusable placeholder and help metadata
- 第 32 行：`test` — secret fields require explicit three-state operations
- 第 41 行：`test` — navigation validation separates internal and external links
- 第 58 行：`test` — batch request rejects duplicates and unapproved fields
- 第 70 行：`test` — media type derives from bytes instead of filename
- 第 76 行：`test` — media descriptor keeps lifecycle changes behind guarded endpoints
- 第 86 行：`test` — global settings accept only canonical upload-extension JSON arrays
- 第 95 行：`test` — rich text accepts explicit nodes and escapes text
- 第 107 行：`test` — news descriptor exposes relation pickers, safe defaults and public cache tags
- 第 115 行：`test` — rich text rejects scripts, h1 and unsafe links
- 第 121 行：`test` — backup envelope is bounded and versioned
- 第 127 行：`test` — sensitive audit fields are recursively redacted
- 第 134 行：`test` — translation provider requests use fixed endpoints

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
