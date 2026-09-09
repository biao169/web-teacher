# tests / complete-admin / hardening.test.mjs

## 文件定位

- **源码路径**：`tests/complete-admin/hardening.test.mjs`
- **文件类型**：测试模块
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：139 行，6915 字节
- **内容校验**：SHA-256 `02e3dfdc81e48a976da549ad34c9fcebf896cba38213c8c6c2fe5701ca42c8f7`

## 直接依赖

- `node:test`
- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:url`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `read` | 函数变量，第 8 行 | 读取或定位 read，向调用方返回匹配结果 |
| `filesUnder` | 函数，第 10 行 | 封装 Under 相关逻辑，供本文件或上层模块按其参数调用 |
| `walk` | 函数，第 13 行 | 封装 walk 相关逻辑，供本文件或上层模块按其参数调用 |

### 调用签名

- `read`：`read = (path) => …`
- `filesUnder`：`async function filesUnder(directory)`
- `walk`：`async function walk(current)`

## 验证内容

- D1 optimistic writes fail inside the same database batch
- complete-admin integrity migration enforces stable unique identities
- encrypted restore builds one bounded atomic database batch
- backup preview returns summaries and not decrypted table rows
- binary upload uses binary-aware request protection
- media service applies configured limits, dimensions and lifecycle checks
- operation logs use the dedicated read-only detail editor
- all canonical complete backend workspaces exist and legacy pages are removed
- consolidated project documentation 01 through 09 exists exactly once
- admin Vue code never uses v-html and public code does not import heavy admin tools
- Tiptap and media editor code is scoped to the admin tree
- package declares every specialized backend dependency and verification command

运行：`node --test tests/complete-admin/hardening.test.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
