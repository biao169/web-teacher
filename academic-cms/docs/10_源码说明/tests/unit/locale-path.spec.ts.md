# tests / unit / locale-path.spec.ts

## 文件定位

- **源码路径**：`tests/unit/locale-path.spec.ts`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：21 行，765 字节
- **内容校验**：SHA-256 `28df8eac72169b152c4b6f87db973cb5f93bf3b7a23d2cabf82655da6036f02e`

## 直接依赖

- `../../shared/utils/locale-path`
- `vitest`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 测试场景

- 第 4 行：`describe` — switchLocalePath
- 第 16 行：`it` — falls back to the target locale root and preserves URL suffixes

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
