# scripts / test-navigation-runtime.mjs

## 文件定位

- **源码路径**：`scripts/test-navigation-runtime.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：223 行，11822 字节
- **内容校验**：SHA-256 `621958bb3c7dc11bfa2c02900fd61cd089c769a7028cad71d19f47855344c61e`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `absorbCookies` | 函数，第 15 行 | 封装 Cookies 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `csrfToken` | 函数，第 26 行 | 封装 Token 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `request` | 函数，第 30 行 | 封装 request 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 21 次。 |
| `expectStatus` | 函数，第 52 行 | 封装 Status 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 20 次。 |
| `errorPayload` | 函数，第 56 行 | 封装 Payload 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `detail` | 函数，第 60 行 | 封装 detail 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 11 次。 |
| `create` | 函数，第 66 行 | 创建 create，并完成初始化或持久化处理 | 仅在本文件内部使用，标识符共出现 10 次。 |

### 调用签名

- `absorbCookies`：`function absorbCookies(response)`
- `csrfToken`：`function csrfToken()`
- `request`：`async function request(path,`
- `expectStatus`：`function expectStatus(result, expected, label)`
- `errorPayload`：`function errorPayload(result)`
- `detail`：`async function detail(uid)`
- `create`：`async function create(body, label)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
