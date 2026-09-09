# scripts / test-admin-full-regression-runtime.ts

## 文件定位

- **源码路径**：`scripts/test-admin-full-regression-runtime.ts`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：209 行，11445 字节
- **内容校验**：SHA-256 `022debafbfecd8cea471962862139fe4444a77e32f1af7d2c2a04771c6c2a3a4`

## 直接依赖

- `../shared/admin/content-modules`
- `../shared/admin/registry`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `absorbCookies` | 函数，第 18 行 | 封装 Cookies 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `csrfToken` | 函数，第 29 行 | 封装 Token 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `cookieHeader` | 函数，第 30 行 | 封装 Header 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `request` | 函数，第 33 行 | 封装 request 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 25 次。 |
| `expectStatus` | 函数，第 55 行 | 封装 Status 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 25 次。 |
| `fieldValue` | 函数，第 60 行 | 封装 Value 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `absorbCookies`：`function absorbCookies(response: Response): void`
- `csrfToken`：`function csrfToken(): string`
- `cookieHeader`：`function cookieHeader(): string`
- `request`：`async function request(path: string, options:`
- `expectStatus`：`function expectStatus(result: Result, expected: readonly number[], label: string): void`
- `fieldValue`：`function fieldValue(field: AdminFieldDefinition, module: string): string | number | boolean | null`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `Result` | 接口，第 32 行 | 约束 Result 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
