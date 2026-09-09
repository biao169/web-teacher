# server / utils / interaction-http.ts

## 文件定位

- **源码路径**：`server/utils/interaction-http.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：62 行，2164 字节
- **内容校验**：SHA-256 `e42251273d94ac7d59919b6cb9c00a4870e45f5a2485bf973c6a1c75444af27e`

## 直接依赖

- `../interactions/errors`
- `../security/errors`
- `../services/auth/session-service`
- `./auth-http`
- `./auth-runtime`
- `h3`
- `zod`

## 直接调用方

- `server/routes/api/v1/auth/registration.get.ts`
- `server/routes/api/v1/public/contact.get.ts`
- `server/routes/api/v1/public/contact.post.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `interactionFailure` | 函数，第 10 行 | 封装 Failure 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/routes/api/v1/auth/registration.get.ts`、`server/routes/api/v1/public/contact.get.ts`、`server/routes/api/v1/public/contact.post.ts` 等模块导入使用。 |
| `resolveLenientInteractionSession` | 函数，第 52 行 | 读取或定位 Lenient Interaction Session，向调用方返回匹配结果 | 由 `server/routes/api/v1/auth/registration.get.ts`、`server/routes/api/v1/public/contact.get.ts`、`server/routes/api/v1/public/contact.post.ts` 等模块导入使用。 |

### 调用签名

- `interactionFailure`：`export function interactionFailure(event: H3Event, error: unknown):`
- `resolveLenientInteractionSession`：`export async function resolveLenientInteractionSession(event: H3Event): Promise<ActiveSession | null>`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
