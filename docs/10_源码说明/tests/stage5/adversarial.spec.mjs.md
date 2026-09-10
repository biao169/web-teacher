# tests / stage5 / adversarial.spec.mjs

## 文件定位

- **源码路径**：`tests/stage5/adversarial.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：102 行，5576 字节
- **内容校验**：SHA-256 `035210ad09ed24c8cc03599962dd284a93f2c055389d5ac3850a68153c283e3e`

## 直接依赖

- `../helpers/offline-stage5.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 测试场景

- 第 81 行：`test` — out-of-range public pagination fails closed instead of emitting duplicate empty URLs
- 第 87 行：`test` — public record identifiers reject percent-encoded and raw path ambiguity
- 第 94 行：`test` — markdown projection removes raw HTML outside code and maps article H1 to a section heading

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。

## 前台 2/10 当前实现（2026-09-06）

- 公共查询预算中的研究方向期望从单条 execute 调整为三条固定 batch；仍检查无逐条追加查询及异常协议处理。

本节更新早期签名和查询说明；专项行为与验证见 docs/22_前台列表_筛选前编号与分页验收.md。
