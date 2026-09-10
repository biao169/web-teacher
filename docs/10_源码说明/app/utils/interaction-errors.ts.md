# app / utils / interaction-errors.ts

## 文件定位

- **源码路径**：`app/utils/interaction-errors.ts`
- **文件类型**：程序模块
- **功能定位**：项目支持文件；为工程运行、依赖锁定或开发工具提供配置。
- **规模**：17 行，736 字节
- **内容校验**：SHA-256 `2bc70a750e70fa5e0ebf3ebe175daa2a080d989156d41f0c13a0a51b9d9aec70`

## 直接调用方

- `app/components/public/auth/AccountPanel.vue`
- `app/components/public/auth/LoginForm.vue`
- `app/components/public/auth/PasswordChangeForm.vue`
- `app/components/public/auth/RegisterForm.vue`
- `app/components/public/contact/ContactForm.vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `apiErrorDetails` | 函数，第 7 行 | 封装 Error Details 相关逻辑，供本文件或上层模块按其参数调用 | 由 `app/components/public/auth/AccountPanel.vue`、`app/components/public/auth/LoginForm.vue`、`app/components/public/auth/PasswordChangeForm.vue` 等模块导入使用。 |

### 调用签名

- `apiErrorDetails`：`export function apiErrorDetails(error: unknown, fallback: string):`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `ApiErrorShape` | 接口，第 1 行 | 约束 Api Error Shape 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
