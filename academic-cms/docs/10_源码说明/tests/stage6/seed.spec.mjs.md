# tests / stage6 / seed.spec.mjs

## 文件定位

- **源码路径**：`tests/stage6/seed.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：79 行，4213 字节
- **内容校验**：SHA-256 `06d1daaf641ae58ebb5f8d26b5ab1ec89c213e70be0329cb59d806ad0d2f196a`

## 直接依赖

- `../helpers/offline-stage6.mjs`
- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:test`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 测试场景

- 第 38 行：`test` — sample dataset refuses a non-empty database and rolls back atomically
- 第 50 行：`test` — sample dataset cannot be applied twice
- 第 61 行：`test` — sample translations are current fingerprints of the referenced source fields

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
