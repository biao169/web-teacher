# server / utils / complete-admin / auth.ts

## 文件定位

- **源码路径**：`server/utils/complete-admin/auth.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：141 行，6904 字节
- **内容校验**：SHA-256 `f528c8137895a6d417343563ebb74295f5248167ee24ff66e40bb49429a11b51`

## 直接依赖

- `../../security/cookies`
- `../../security/errors`
- `../../security/request-protection`
- `../auth-runtime`
- `h3`

## 直接调用方

- `server/api/v1/admin/capabilities.get.ts`
- `server/api/v1/admin/complete/auth/overview.get.ts`
- `server/api/v1/admin/complete/auth/roles/[uid].delete.ts`
- `server/api/v1/admin/complete/auth/roles/[uid].patch.ts`
- `server/api/v1/admin/complete/auth/roles/[uid]/permissions.put.ts`
- `server/api/v1/admin/complete/auth/roles/index.post.ts`
- `server/api/v1/admin/complete/auth/users/[uid].patch.ts`
- `server/api/v1/admin/complete/auth/users/[uid]/password.post.ts`
- `server/api/v1/admin/complete/auth/users/[uid]/sessions.get.ts`
- `server/api/v1/admin/complete/auth/users/[uid]/sessions.post.ts`
- `server/api/v1/admin/complete/auth/users/index.post.ts`
- `server/api/v1/admin/complete/import-export/apply.post.ts`
- `server/api/v1/admin/complete/import-export/export.post.ts`
- `server/api/v1/admin/complete/import-export/preview.post.ts`
- `server/api/v1/admin/complete/logs/[uid].get.ts`
- `server/api/v1/admin/complete/logs/export.post.ts`
- `server/api/v1/admin/complete/logs/index.get.ts`
- `server/api/v1/admin/complete/media/[uid]/check.get.ts`
- `server/api/v1/admin/complete/media/[uid]/metadata.patch.ts`
- `server/api/v1/admin/complete/media/[uid]/purge.delete.ts`
- `server/api/v1/admin/complete/media/[uid]/status.patch.ts`
- `server/api/v1/admin/complete/media/[uid]/usage.get.ts`
- `server/api/v1/admin/complete/media/batch-status.patch.ts`
- `server/api/v1/admin/complete/media/cleanup.post.ts`
- `server/api/v1/admin/complete/media/index.get.ts`
- `server/api/v1/admin/complete/media/previews.get.ts`
- `server/api/v1/admin/complete/media/scan.get.ts`
- `server/api/v1/admin/complete/media/stats.get.ts`
- `server/api/v1/admin/complete/media/trash.get.ts`
- `server/api/v1/admin/complete/media/upload.post.ts`
- `server/api/v1/admin/complete/metadata/doi.get.ts`
- `server/api/v1/admin/complete/metadata/patent.get.ts`
- `server/api/v1/admin/complete/modules.get.ts`
- `server/api/v1/admin/complete/news/[uid]/rich-text.patch.ts`
- `server/api/v1/admin/complete/resource/[resource]/[uid].delete.ts`
- `server/api/v1/admin/complete/resource/[resource]/[uid].get.ts`
- `server/api/v1/admin/complete/resource/[resource]/[uid].patch.ts`
- `server/api/v1/admin/complete/resource/[resource]/batch.patch.ts`
- `server/api/v1/admin/complete/resource/[resource]/index.get.ts`
- `server/api/v1/admin/complete/resource/[resource]/index.post.ts`
- 其余 15 个调用方见项目目录索引。

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `safeRequestId` | 函数，第 20 行 | 封装 Request Id 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `fail` | 函数，第 25 行 | 封装 fail 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `permissionBoolean` | 函数，第 31 行 | 封装 Boolean 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `hasPermissionShape` | 函数，第 36 行 | 检查 Permission Shape 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `extractPrincipal` | 函数，第 63 行 | 封装 Principal 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `fetchSession` | 函数，第 84 行 | 读取或定位 Session，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `assertWriteRequest` | 函数，第 98 行 | 检查 Write Request 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `requireAdmin` | 函数，第 129 行 | 检查 Admin 是否满足业务、安全或类型约束 | 由 `server/api/v1/admin/capabilities.get.ts`、`server/api/v1/admin/complete/auth/overview.get.ts`、`server/api/v1/admin/complete/auth/roles/[uid]/permissions.put.ts` 等模块导入使用。 |

### 调用签名

- `safeRequestId`：`function safeRequestId(event: H3Event): string`
- `fail`：`function fail(event: H3Event, statusCode: number, code: string, message: string): never`
- `permissionBoolean`：`function permissionBoolean(entry: Record<string, unknown>, action: AdminAction): boolean`
- `hasPermissionShape`：`function hasPermissionShape(permissions: unknown, modules: readonly string[], action: AdminAction): boolean`
- `extractPrincipal`：`function extractPrincipal(payload: unknown): AdminPrincipal | null`
- `fetchSession`：`async function fetchSession(event: H3Event): Promise<AdminPrincipal | null>`
- `assertWriteRequest`：`async function assertWriteRequest(event: H3Event, binary = false): Promise<void>`
- `requireAdmin`：`export async function requireAdmin(event: H3Event, modules: readonly string[], action: AdminAction, options:`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `AdminAction` | 类型，第 8 行 | 约束 Admin Action 的数据结构或可选值 |
| `AdminPrincipal` | 接口，第 9 行 | 约束 Admin Principal 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
