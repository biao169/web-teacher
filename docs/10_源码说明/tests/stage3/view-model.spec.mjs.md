# tests / stage3 / view-model.spec.mjs

## 文件定位

- **源码路径**：`tests/stage3/view-model.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：58 行，2203 字节
- **内容校验**：SHA-256 `0a98365823afdf42d89cc5b5f5131e25263f34c1a62377a476059587435245ac`

## 直接依赖

- `../helpers/offline-stage3.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `get` | 对象方法，第 34 行 | 读取或定位 get，向调用方返回匹配结果 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `get`：`get()`

## 测试场景

- 第 7 行：`test` — ViewModel serialization is stable and normalizes strings
- 第 14 行：`test` — ViewModel parser returns null-prototype records
- 第 31 行：`test` — ViewModel rejects accessors without invoking them
- 第 39 行：`test` — ViewModel rejects sparse and extended arrays
- 第 48 行：`test` — ViewModel rejects cycles and enforces byte limit
- 第 55 行：`test` — ViewModel digest is deterministic

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
