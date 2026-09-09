# scripts / test-global-settings-runtime.mjs

## 文件定位

- **源码路径**：`scripts/test-global-settings-runtime.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：200 行，9599 字节
- **内容校验**：SHA-256 `5c306a8cdeb7c71f6150f0db39f6692b399ce31afa834b85c0f0178fb6a06f86`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `absorbCookies` | 函数，第 15 行 | 封装 Cookies 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `csrfToken` | 函数，第 26 行 | 封装 Token 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `request` | 函数，第 30 行 | 封装 request 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 13 次。 |
| `expectStatus` | 函数，第 52 行 | 封装 Status 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 14 次。 |
| `detail` | 函数，第 56 行 | 封装 detail 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `update` | 函数，第 62 行 | 更新 update，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 7 次。 |

### 调用签名

- `absorbCookies`：`function absorbCookies(response)`
- `csrfToken`：`function csrfToken()`
- `request`：`async function request(path,`
- `expectStatus`：`function expectStatus(result, expected, label)`
- `detail`：`async function detail(uid)`
- `update`：`async function update(uid, values, label = 'global settings update')`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
