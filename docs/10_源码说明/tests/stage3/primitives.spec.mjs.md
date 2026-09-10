# tests / stage3 / primitives.spec.mjs

## 文件定位

- **源码路径**：`tests/stage3/primitives.spec.mjs`
- **文件类型**：测试模块
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：77 行，4267 字节
- **内容校验**：SHA-256 `1c3044979bca0d4a5c3dd5dc2ba207e11f7b045479f5f122d7dd4f06391a7f85`

## 直接依赖

- `node:assert/strict`
- `node:test`
- `../helpers/offline-stage3.mjs`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `get` | 方法，第 48 行 | 读取或定位 get，向调用方返回匹配结果 |

### 调用签名

- `get`：`get()`

## 验证内容

- managed object keys are portable and canonically encoded
- range, MIME and disposition helpers fail closed
- public ViewModel is deterministic and rejects executable or sensitive shapes
- source references round-trip arbitrary stable UIDs without delimiter ambiguity
- translation source canonicalization rejects invalid Unicode
- media grants are signed, scoped, stable within a bucket and expire

运行：`node --test tests/stage3/primitives.spec.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
