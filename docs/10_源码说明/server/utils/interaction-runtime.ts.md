# server / utils / interaction-runtime.ts

## 文件定位

- **源码路径**：`server/utils/interaction-runtime.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：48 行，2040 字节
- **内容校验**：SHA-256 `c959838ef19be044fc67b55b55193f3fac970591e7d57a75f43b7986519967ec`

## 直接依赖

- `../services/auth/account-service`
- `../services/auth/registration-service`
- `../services/contact/contact-service`
- `../services/contact/contact-store`
- `../services/interactions/action-throttle-service`
- `../services/interactions/action-throttle-store`
- `../services/interactions/settings-store`
- `./auth-runtime`
- `./database`
- `h3`

## 直接调用方

- `server/routes/api/v1/auth/password/change.post.ts`
- `server/routes/api/v1/auth/register.post.ts`
- `server/routes/api/v1/auth/registration.get.ts`
- `server/routes/api/v1/auth/sessions/revoke-all.post.ts`
- `server/routes/api/v1/public/contact.get.ts`
- `server/routes/api/v1/public/contact.post.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `useInteractionRuntime` | 函数，第 19 行 | 封装 Runtime 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/routes/api/v1/auth/password/change.post.ts`、`server/routes/api/v1/auth/register.post.ts`、`server/routes/api/v1/auth/registration.get.ts` 等模块导入使用。 |

### 调用签名

- `useInteractionRuntime`：`export function useInteractionRuntime(event: H3Event): InteractionRuntime`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `InteractionRuntime` | 接口，第 12 行 | 约束 Interaction Runtime 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
