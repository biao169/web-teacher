# server / utils / bounded-json.ts

## 文件定位

- **源码路径**：`server/utils/bounded-json.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：9 行，477 字节
- **内容校验**：SHA-256 `80519d942faedf691de30435ee6b3a32153f07fa48f60baaf7ef9a700386ef17`

## 直接依赖

- `../security/body`
- `h3`

## 直接调用方

- `server/routes/api/v1/auth/bootstrap.post.ts`
- `server/routes/api/v1/auth/login.post.ts`
- `server/routes/api/v1/auth/password/change.post.ts`
- `server/routes/api/v1/auth/register.post.ts`
- `server/routes/api/v1/auth/session/refresh.post.ts`
- `server/routes/api/v1/auth/sessions/revoke-all.post.ts`
- `server/routes/api/v1/public/contact.post.ts`
- `server/utils/admin-content-handler.ts`
- `server/utils/admin-write-handler.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `readBoundedJsonBody` | 函数，第 5 行 | 读取或定位 Bounded Json Body，向调用方返回匹配结果 | 由 `server/routes/api/v1/auth/bootstrap.post.ts`、`server/routes/api/v1/auth/login.post.ts`、`server/routes/api/v1/auth/password/change.post.ts` 等模块导入使用。 |

### 调用签名

- `readBoundedJsonBody`：`export function readBoundedJsonBody(event: H3Event, maximumBytes = AUTH_JSON_BODY_LIMIT): Promise<unknown>`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
