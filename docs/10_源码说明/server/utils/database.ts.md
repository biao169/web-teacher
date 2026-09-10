# server / utils / database.ts

## 文件定位

- **源码路径**：`server/utils/database.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：10 行，481 字节
- **内容校验**：SHA-256 `f14ba60076279f4dec8d4b8c237dcd61cf5d1a871d820d942633ac3ff5a7755b`

## 直接依赖

- `#database-platform`
- `../../db/context`

## 直接调用方

- `server/routes/api/v1/admin/content/[module]/[uid].delete.ts`
- `server/routes/api/v1/admin/content/[module]/[uid].get.ts`
- `server/routes/api/v1/admin/content/[module]/[uid].patch.ts`
- `server/routes/api/v1/admin/content/[module]/batch.patch.ts`
- `server/routes/api/v1/admin/content/[module]/index.get.ts`
- `server/routes/api/v1/admin/content/[module]/index.post.ts`
- `server/routes/api/v1/admin/dashboard.get.ts`
- `server/utils/auth-runtime.ts`
- `server/utils/cache-runtime.ts`
- `server/utils/i18n-runtime.ts`
- `server/utils/interaction-runtime.ts`
- `server/utils/media-runtime.ts`
- `server/utils/public-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `useDatabase` | 函数，第 5 行 | Call only from database-dependent Services. /health never calls this helper. | 由 `server/routes/api/v1/admin/content/[module]/[uid].delete.ts`、`server/routes/api/v1/admin/content/[module]/[uid].get.ts`、`server/routes/api/v1/admin/content/[module]/[uid].patch.ts` 等模块导入使用。 |

### 调用签名

- `useDatabase`：`export function useDatabase(event: DatabaseRequest): DatabaseContext`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
