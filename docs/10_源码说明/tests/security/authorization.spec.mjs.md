# tests / security / authorization.spec.mjs

## 文件定位

- **源码路径**：`tests/security/authorization.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：81 行，5406 字节
- **内容校验**：SHA-256 `35cd054b55a5a6b229021490d8cbd6ecb9fc29ba29fb55c69d4194fd0068a61a`

## 直接依赖

- `../helpers/offline-security.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `principal` | 函数，第 5 行 | 封装 principal 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 24 次。 |

### 调用签名

- `principal`：`function principal(overrides =`

## 测试场景

- 第 19 行：`test` — permissions are explicit and default deny
- 第 28 行：`test` — must-change-password gate blocks every generic module permission and restricted visibility
- 第 43 行：`test` — role levels constrain role administration and never imply module access
- 第 52 行：`test` — visibility evaluates public, authenticated, staff, exact owner and hidden distinctly
- 第 63 行：`test` — role visibility scopes are an explicit allow-list rather than an inferred hierarchy
- 第 73 行：`test` — system administrator bootstrap grants every module but keeps protected delete flags false

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
