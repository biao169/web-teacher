# tests / unit / admin-formatters.spec.ts

## 文件定位

- **源码路径**：`tests/unit/admin-formatters.spec.ts`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：67 行，3978 字节
- **内容校验**：SHA-256 `c6c54a4536a96d108fe0e2f9e6f9a66aba47f4dc2838618fa4656ce36fb3924c`

## 直接依赖

- `../../app/admin/formatters`
- `../../app/admin/list-avatar`
- `../../app/admin/unified-list`
- `vitest`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 测试场景

- 第 6 行：`describe` — admin shared formatters
- 第 7 行：`it` — formats dates and datetimes through one stable entry point
- 第 13 行：`it` — normalizes booleans, list values and status colors
- 第 21 行：`it` — assigns centralized tones and labels to boolean and enum options
- 第 38 行：`it` — sizes table columns from their content kind and visible labels
- 第 46 行：`it` — keeps standard actions on one row and wraps only a content-wide action set
- 第 60 行：`it` — creates stable avatar initials for Chinese and spaced names

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
