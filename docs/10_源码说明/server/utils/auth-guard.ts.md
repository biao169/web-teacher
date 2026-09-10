# server / utils / auth-guard.ts

## 文件定位

- **源码路径**：`server/utils/auth-guard.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：26 行，1086 字节
- **内容校验**：SHA-256 `c78ddf652e658b6177503d6a9e8a4472261ccac55fb12c098b1b756e813b06e2`

## 直接依赖

- `../../shared/enums/auth`
- `../security/errors`
- `../security/permissions`
- `../services/auth/session-service`
- `./auth-runtime`
- `h3`

## 直接调用方

- `server/utils/admin-content-handler.ts`
- `server/utils/admin-read-handler.ts`
- `server/utils/admin-write-handler.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `requireActiveSession` | 函数，第 9 行 | Resolves the opaque cookie session once per request and fails closed. | 由 `server/utils/admin-content-handler.ts`、`server/utils/admin-read-handler.ts`、`server/utils/admin-write-handler.ts` 等模块导入使用。 |
| `requireEventPermission` | 函数，第 17 行 | Module permission checks are server-side and never inferred from UI visibility. | 由 `server/utils/admin-content-handler.ts`、`server/utils/admin-read-handler.ts`、`server/utils/admin-write-handler.ts` 等模块导入使用。 |

### 调用签名

- `requireActiveSession`：`export async function requireActiveSession(event: H3Event): Promise<ActiveSession>`
- `requireEventPermission`：`export async function requireEventPermission( event: H3Event, module: AuthModule, action: PermissionAction, ): Promise<ActiveSession>`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
