# scripts / test-site-settings-runtime.mjs

## 文件定位

- **源码路径**：`scripts/test-site-settings-runtime.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：150 行，6403 字节
- **内容校验**：SHA-256 `89db95053a632664f1ed384ee4876a8f31359fb7add3e2d917d62cf44097f29f`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `absorbCookies` | 函数，第 15 行 | 封装 Cookies 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `csrfToken` | 函数，第 26 行 | 封装 Token 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `request` | 函数，第 30 行 | 封装 request 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 13 次。 |
| `expectStatus` | 函数，第 52 行 | 封装 Status 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 13 次。 |

### 调用签名

- `absorbCookies`：`function absorbCookies(response)`
- `csrfToken`：`function csrfToken()`
- `request`：`async function request(path,`
- `expectStatus`：`function expectStatus(result, expected, label)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
