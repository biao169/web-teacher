# tests / contracts / repository-contract.ts

## 文件定位

- **源码路径**：`tests/contracts/repository-contract.ts`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：339 行，25389 字节
- **内容校验**：SHA-256 `fab5abbf914e3feef995bf47584f552e3e5878556193c4c4e677aa35d631cadc`

## 直接依赖

- `../../db/catalog`
- `../../db/contracts`
- `../../db/errors`
- `../../db/models`
- `../../db/query`
- `../../db/read-plans`
- `../../db/repository`

## 直接调用方

- `tests/native/repository.spec.ts`
- `tests/workerd/repository.spec.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `equal` | 函数，第 12 行 | 封装 equal 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/native/repository.spec.ts`、`tests/workerd/repository.spec.ts` 等模块导入使用。 |
| `ok` | 函数，第 15 行 | 封装 ok 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/native/repository.spec.ts`、`tests/workerd/repository.spec.ts` 等模块导入使用。 |
| `rejects` | 函数，第 16 行 | 封装 rejects 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/native/repository.spec.ts`、`tests/workerd/repository.spec.ts` 等模块导入使用。 |
| `repository` | 函数，第 22 行 | 封装 repository 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 36 次。 |
| `now` | 对象函数，第 22 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `run` | 对象方法，第 37 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 48 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 54 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 62 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 72 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 80 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 88 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 99 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 109 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 116 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 125 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 137 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 143 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 152 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 161 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 167 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 174 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 179 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 187 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 194 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 201 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 208 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 213 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 221 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 232 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 239 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 251 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 264 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 272 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 280 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 288 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 294 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 301 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 311 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 321 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 330 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |
| `run` | 对象方法，第 334 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 38 次。 |

### 调用签名

- `equal`：`export function equal(actual: unknown, expected: unknown): void`
- `ok`：`export function ok(condition: unknown, message = 'Assertion failed'): asserts condition`
- `rejects`：`export async function rejects(operation: () => unknown | Promise<unknown>, code: string): Promise<void>`
- `repository`：`function repository(adapter: DatabaseAdapter)`
- `now`：`now: () => new Date(fixedTime)`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`
- `run`：`async run(`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `Harness` | 接口，第 10 行 | 约束 Harness 的数据结构或可选值 |
| `ContractCase` | 接口，第 11 行 | 约束 Contract Case 的数据结构或可选值 |
| `contractCases` | 导出常量，第 35 行 | 提供 contract Cases 的共享配置或不可变数据 |

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
