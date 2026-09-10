# app / composables / useAuthSession.ts

## 文件定位

- **源码路径**：`app/composables/useAuthSession.ts`
- **文件类型**：程序模块
- **功能定位**：Nuxt/Vue 组合式逻辑模块；集中管理可复用的数据请求、状态和页面行为。
- **规模**：126 行，4547 字节
- **内容校验**：SHA-256 `081ca2756dd5f916f1395889517eeb8c185074364725ec5c8c1221ad6a1890a8`

## 直接依赖

- `~~/shared/contracts/auth`
- `~~/shared/contracts/interactions`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `useAuthSession` | 函数，第 12 行 | 封装 Session 相关逻辑，供本文件或上层模块按其参数调用 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `load` | 内部函数，第 19 行 | 加载并刷新 load，同步界面或运行时状态 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `clear` | 内部函数，第 40 行 | 移除或失效 clear，同时处理相关联状态 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `csrfHeaders` | 内部函数，第 46 行 | 封装 Headers 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `login` | 内部函数，第 51 行 | 封装 login 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `register` | 内部函数，第 61 行 | 封装 register 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `refresh` | 内部函数，第 67 行 | 加载并刷新 refresh，同步界面或运行时状态 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `logout` | 内部函数，第 83 行 | 封装 logout 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `revokeAll` | 内部函数，第 93 行 | 移除或失效 All，同时处理相关联状态 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `changePassword` | 内部函数，第 106 行 | 更新 Password，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `useAuthSession`：`export function useAuthSession()`
- `load`：`async function load(force = false): Promise<SessionView>`
- `clear`：`function clear(): void`
- `csrfHeaders`：`function csrfHeaders(): Record<string, string>`
- `login`：`async function login(body: LoginRequestBody): Promise<SessionView>`
- `register`：`async function register(body: RegistrationRequestBody): Promise<RegistrationReceiptView>`
- `refresh`：`async function refresh(): Promise<SessionView>`
- `logout`：`async function logout(): Promise<void>`
- `revokeAll`：`async function revokeAll(): Promise<RevokeAllSessionsResultView>`
- `changePassword`：`async function changePassword(body: PasswordChangeRequestBody): Promise<PasswordChangeResultView>`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
