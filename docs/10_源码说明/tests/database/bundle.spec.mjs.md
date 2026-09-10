# tests / database / bundle.spec.mjs

## 文件定位

- **源码路径**：`tests/database/bundle.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：25 行，1394 字节
- **内容校验**：SHA-256 `213e224633c56eed669c8586e95d2be06d939bc200a99eb17cbc4078d4f3cd67`

## 直接依赖

- `../../scripts/lib/database-bundle.mjs`
- `node:assert/strict`
- `node:fs/promises`
- `node:os`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `fixture` | 函数，第 8 行 | 封装 fixture 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |

### 调用签名

- `fixture`：`async function fixture(run)`

## 测试场景

- 第 13 行：`test` — Worker database guard accepts a JS-only D1 output
- 第 17 行：`test` — Worker database guard rejects a transitive native SQLite import
- 第 21 行：`test` — Worker database guard rejects native addon files regardless of name

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
