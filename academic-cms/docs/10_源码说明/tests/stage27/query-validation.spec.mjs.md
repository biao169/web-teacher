# tests / stage27 / query-validation.spec.mjs

## 文件定位

- **源码路径**：`tests/stage27/query-validation.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：37 行，2597 字节
- **内容校验**：SHA-256 `4ac793b2594ee0bcd889666f2571ce11d0190225a7f126e1b35142e2753d9661`

## 直接依赖

- `../helpers/offline-stage27.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `expectCode` | 函数，第 5 行 | 封装 Code 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 9 次。 |

### 调用签名

- `expectCode`：`function expectCode(action, code)`

## 测试场景

- 第 9 行：`test` — list query parser applies whitelists, pagination and typed filters
- 第 22 行：`test` — module validation normalizes DOI and enforces cross-field rules
- 第 31 行：`test` — batch validation accepts exactly one allowed writable field

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
