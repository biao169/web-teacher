# tests / stage4 / public-path.spec.mjs

## 文件定位

- **源码路径**：`tests/stage4/public-path.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：55 行，3096 字节
- **内容校验**：SHA-256 `e064c78dda3b5c2a76693ae76175b9e3a6cae27264f58c1260e903db3fb2e580`

## 直接依赖

- `../helpers/offline-stage4.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 测试场景

- 第 7 行：`test` — named public routes are localized and presentation fields are normalized
- 第 18 行：`test` — existing locale paths retain query and safe fragment while switching locale
- 第 25 行：`test` — external navigation requires credential-free HTTPS
- 第 35 行：`test` — internal navigation rejects platform internals, traversal, ambiguity and unsafe fragments
- 第 43 行：`test` — unknown or incomplete navigation is safely omitted and invalid icon is dropped
- 第 50 行：`test` — record paths encode identifiers as one URL segment

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
