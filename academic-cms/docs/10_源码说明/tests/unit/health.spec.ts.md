# tests / unit / health.spec.ts

## 文件定位

- **源码路径**：`tests/unit/health.spec.ts`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：67 行，1984 字节
- **内容校验**：SHA-256 `d6633c69e71b5c55dbae9cf014edfc5d1bbf29a7e59d10fb26045982fd2c4e6f`

## 直接依赖

- `../../server/utils/health`
- `vitest`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `now` | 对象函数，第 35 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `now` | 对象函数，第 55 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `now`：`now: () => new Date('2026-08-29T00:00:00.000Z')`
- `now`：`now: () => new Date(Number.NaN)`

## 测试场景

- 第 8 行：`describe` — normalizeRuntimeKind
- 第 13 行：`it` — maps unexpected values to unknown
- 第 19 行：`describe` — normalizeHealthVersion
- 第 20 行：`it` — trims a bounded version identifier
- 第 29 行：`describe` — createHealthPayload
- 第 30 行：`it` — creates a deterministic, non-sensitive payload
- 第 50 行：`it` — rejects an invalid clock value instead of emitting broken JSON
- 第 59 行：`it` — rejects unsafe request IDs at the contract boundary

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
