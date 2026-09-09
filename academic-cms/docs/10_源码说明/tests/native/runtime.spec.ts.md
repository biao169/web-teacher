# tests / native / runtime.spec.ts

## 文件定位

- **源码路径**：`tests/native/runtime.spec.ts`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：58 行，2850 字节
- **内容校验**：SHA-256 `aafb70eda512481a6a4e177b1687be4ad6722a3452716bbad6d8c2ae78d68212`

## 直接依赖

- `../../db/runtime/node`
- `../../scripts/db/migrations.mjs`
- `better-sqlite3`
- `node:fs/promises`
- `node:os`
- `node:path`
- `node:url`
- `vitest`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `value` | 函数变量，第 30 行 | 封装 value 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 8 次。 |

### 调用签名

- `value`：`value = async (sql: string) => (await context.adapter.execute(`

## 测试场景

- 第 10 行：`test` — production runtime refuses a missing database instead of creating it
- 第 21 行：`test` — WAL, foreign keys, busy timeout and persistence are enabled on an existing database
- 第 45 行：`test` — production runtime rejects an existing legacy database without modifying its content

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
