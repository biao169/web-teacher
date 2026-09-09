# server / security / config.ts

## 文件定位

- **源码路径**：`server/security/config.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：89 行，4860 字节
- **内容校验**：SHA-256 `e2fe3d8e9202aade2e1d2326857333b9b2870d176551b22ad36fdc3febf4ea43`

## 直接依赖

- `./bytes`
- `./errors`

## 直接调用方

- `scripts/auth/bootstrap-admin.ts`
- `server/utils/auth-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `integer` | 函数，第 32 行 | 封装 integer 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 9 次。 |
| `boolean` | 函数，第 37 行 | 封装 boolean 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `normalizeOrigin` | 函数，第 43 行 | 规范化 Origin，消除不安全或不一致的输入形式 | 由 `scripts/auth/bootstrap-admin.ts`、`server/utils/auth-runtime.ts` 等模块导入使用。 |
| `origins` | 函数，第 50 行 | 封装 origins 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `strongSecret` | 函数，第 54 行 | 封装 Secret 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `parseAuthConfig` | 函数，第 63 行 | 解析 Auth Config 的输入格式，并输出受约束的数据结构 | 由 `scripts/auth/bootstrap-admin.ts`、`server/utils/auth-runtime.ts` 等模块导入使用。 |

### 调用签名

- `integer`：`function integer(value: unknown, fallback: number, minimum: number, maximum: number, name: string): number`
- `boolean`：`function boolean(value: unknown, fallback: boolean, name: string): boolean`
- `normalizeOrigin`：`export function normalizeOrigin(value: string, production = false): string`
- `origins`：`function origins(value: unknown, production: boolean): string[]`
- `strongSecret`：`function strongSecret(value: unknown, name: string, optional = false): string | null`
- `parseAuthConfig`：`export function parseAuthConfig(raw: RawAuthConfig, production = false): AuthConfig`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `RawAuthConfig` | 接口，第 4 行 | 约束 Raw Auth Config 的数据结构或可选值 |
| `AuthConfig` | 接口，第 18 行 | 约束 Auth Config 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
