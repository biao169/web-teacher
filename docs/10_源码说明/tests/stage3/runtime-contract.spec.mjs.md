# tests / stage3 / runtime-contract.spec.mjs

## 文件定位

- **源码路径**：`tests/stage3/runtime-contract.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：104 行，4597 字节
- **内容校验**：SHA-256 `ab94e7806b3de74d9622d43fb16c0b4b8fb14e8682500867ea2d84b5a0aeb78a`

## 直接依赖

- `../helpers/offline-stage3.mjs`
- `../helpers/stage3-doubles.mjs`
- `node:assert/strict`
- `node:crypto`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `hasCode` | 函数，第 9 行 | 检查 Code 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `sha256` | 函数，第 10 行 | 封装 sha256 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `head` | 对象方法，第 42 行 | 封装 head 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `read` | 对象方法，第 43 行 | 读取或定位 read，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `put` | 对象方法，第 44 行 | 封装 put 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `delete` | 对象方法，第 44 行 | 移除或失效 delete，同时处理相关联状态 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `clock` | 对象函数，第 48 行 | 封装 clock 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `fetch` | 对象方法，第 66 行 | 读取或定位 fetch，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `hasCode`：`function hasCode(code)`
- `sha256`：`function sha256(bytes)`
- `head`：`async head()`
- `read`：`async read()`
- `put`：`async put()`
- `delete`：`async delete()`
- `clock`：`clock: () => new Date('2026-08-29T00:00:00.000Z')`
- `fetch`：`async fetch()`

## 测试场景

- 第 12 行：`test` — default cache configuration is internally compatible with the public cache budget
- 第 27 行：`test` — media delivery requires catalog size to exactly match storage, including zero-sized catalog rows
- 第 64 行：`test` — static fetch adapter detects a body shorter than its declared representation
- 第 81 行：`test` — translation localization enforces a total batch text budget
- 第 96 行：`test` — cache runtime delegates background refresh through H3 event.waitUntil

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
