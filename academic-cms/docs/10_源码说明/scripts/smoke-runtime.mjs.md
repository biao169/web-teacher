# scripts / smoke-runtime.mjs

## 文件定位

- **源码路径**：`scripts/smoke-runtime.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：186 行，7282 字节
- **内容校验**：SHA-256 `14807a2d6449b40a4309b5ef5142e147d893bc6f4778a4720ce5f51366b859d2`

## 直接依赖

- `./lib/build-output.mjs`
- `./lib/run-command.mjs`
- `node:child_process`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `stopChild` | 函数 | 封装 Child 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `request` | 函数 | 封装 request 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 9 次。 |
| `waitForHealth` | 函数 | 封装 For Health 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `verifyRootRedirect` | 函数 | 检查 Root Redirect 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `verifyPublicSsr` | 函数 | 检查 Public Ssr 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `verifyImmutableNuxtAsset` | 函数 | 检查 Immutable Nuxt Asset 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `verifyAdminShell` | 函数 | 检查 Admin Shell 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `stopChild`：`async function stopChild()`
- `request`：`async function request(path, options =`
- `waitForHealth`：`async function waitForHealth()`
- `verifyRootRedirect`：`async function verifyRootRedirect()`
- `verifyPublicSsr`：`async function verifyPublicSsr()`
- `verifyImmutableNuxtAsset`：`async function verifyImmutableNuxtAsset(html)`
- `verifyAdminShell`：`async function verifyAdminShell()`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。

## 第 4/7 步：默认语言

根路径冒烟请求显式携带中文偏好 Cookie，再验证 302 和 no-store，避免把本地出口地区固定为中国。
