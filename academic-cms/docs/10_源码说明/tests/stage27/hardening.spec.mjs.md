# tests / stage27 / hardening.spec.mjs

## 文件定位

- **源码路径**：`tests/stage27/hardening.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：110 行，6098 字节
- **内容校验**：SHA-256 `12e1188cc389b83df78562ac55844b707f319e9301a07c58aac75c7d2f02fa2e`

## 直接依赖

- `../helpers/offline-stage27.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `serviceFor` | 函数，第 5 行 | 封装 For 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `newUid` | 对象函数，第 9 行 | 封装 Uid 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `now` | 对象函数，第 10 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `serviceFor`：`function serviceFor(harness, actor = principal())`
- `newUid`：`newUid: () => \`hardening-$`
- `now`：`now: () => new Date(now += 5)`

## 测试场景

- 第 70 行：`test` — content service checks the requested business module instead of dashboard permission
- 第 87 行：`test` — partial updates allow omitted required fields but reject clearing them when the current record is known
- 第 96 行：`test` — category keys allow documented underscores and formal news is absent from the generic editor
- 第 102 行：`test` — mutation input rejects unknown and prototype-sensitive fields

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
