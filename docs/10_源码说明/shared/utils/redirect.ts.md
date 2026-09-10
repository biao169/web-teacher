# shared / utils / redirect.ts

## 文件定位

- **源码路径**：`shared/utils/redirect.ts`
- **文件类型**：程序模块
- **功能定位**：前后端共享模块；提供跨运行时复用的类型、工具或后台定义。
- **规模**：63 行，2601 字节
- **内容校验**：SHA-256 `af4bd71e6e3be683c07788d4e82f2f18d1808e1e52fef105e7e75aa1ccf5e6f2`

## 直接依赖

- `./unicode`

## 直接调用方

- `app/components/public/auth/LoginForm.vue`
- `app/components/public/auth/PasswordChangeForm.vue`
- `app/components/public/auth/RegisterForm.vue`
- `shared/admin/paths.ts`
- `shared/admin/registry.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `slashCount` | 函数，第 6 行 | 封装 Count 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `fullyDecodeUnambiguousPath` | 函数，第 18 行 | Decodes a path repeatedly while rejecting any encoding layer that can | 仅在本文件内部使用，标识符共出现 4 次。 |
| `hasForbiddenPrefix` | 函数，第 35 行 | 检查 Forbidden Prefix 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `safeApplicationRedirect` | 函数，第 40 行 | Accepts only an unambiguous same-origin application path. | 由 `app/components/public/auth/LoginForm.vue`、`app/components/public/auth/PasswordChangeForm.vue`、`app/components/public/auth/RegisterForm.vue` 等模块导入使用。 |

### 调用签名

- `slashCount`：`function slashCount(value: string): number`
- `fullyDecodeUnambiguousPath`：`function fullyDecodeUnambiguousPath(rawPath: string): string | null`
- `hasForbiddenPrefix`：`function hasForbiddenPrefix(pathname: string): boolean`
- `safeApplicationRedirect`：`export function safeApplicationRedirect(value: unknown, fallback: string): string`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
