# tests / stage6 / adversarial.spec.mjs

## 文件定位

- **源码路径**：`tests/stage6/adversarial.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：76 行，6742 字节
- **内容校验**：SHA-256 `0d287aa7cdc12428f32dbcc5223df51e62cc8d05dbc34cec657ee132a9cdc0dc`

## 直接依赖

- `../helpers/offline-stage6.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `batch` | 对象函数，第 52 行 | 封装 batch 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `execute` | 对象函数，第 52 行 | 执行 execute 所代表的完整处理流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `batch`：`batch: commands=>h.adapter.batch(commands)`
- `execute`：`execute: async()=>`

## 测试场景

- 第 5 行：`test` — registration throttle is keyed independently from login throttling
- 第 14 行：`test` — contact honeypot returns an indistinguishable receipt without writing a message
- 第 22 行：`test` — contact throttle blocks the fifth submission for one identity
- 第 29 行：`test` — safe redirect helper rejects cross-origin and privileged internal destinations
- 第 35 行：`test` — honeypot submissions cannot consume a real visitor throttle budget
- 第 48 行：`test` — public registration does not depend on a post-commit credential readback
- 第 63 行：`test` — a disabled contact race cannot commit an audit event for an old colliding message uid

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
