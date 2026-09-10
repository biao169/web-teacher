# tests / stage27 / static-contract.spec.mjs

## 文件定位

- **源码路径**：`tests/stage27/static-contract.spec.mjs`
- **文件类型**：测试模块
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：43 行，2339 字节
- **内容校验**：SHA-256 `304a46802aba79557ac0bfbc8510af9d84d6675d95a0c0f52afeee91208d5994`

## 直接依赖

- `node:test`
- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `../helpers/offline-stage27.mjs`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `text` | 函数变量，第 7 行 | 封装 text 相关逻辑，供本文件或上层模块按其参数调用 |

### 调用签名

- `text`：`text = path => …`

## 验证内容

- one canonical descriptor and one set of content API routes remain
- catch-all page renders shared list and editor workspace
- migration adds mutation guard and admin indexes without rewriting old migrations

运行：`node --test tests/stage27/static-contract.spec.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
