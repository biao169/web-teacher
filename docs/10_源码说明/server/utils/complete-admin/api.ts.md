# server / utils / complete-admin / api.ts

## 文件定位

- **源码路径**：`server/utils/complete-admin/api.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：75 行，6250 字节
- **内容校验**：SHA-256 `00278fe661521a32eb5f0c6d3700adc116b1ad35300d3092abdd90dd03dcd997`

## 直接依赖

- `h3`

## 直接调用方

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
- `server/api/v1/admin/complete/suggestions/index.get.ts`
- 其余 8 个调用方见项目目录索引。

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `readBoundedJson` | 函数 | 读取或定位 Bounded Json，向调用方返回匹配结果 | 由 `server/api/v1/admin/complete/auth/overview.get.ts`、`server/api/v1/admin/complete/auth/roles/[uid]/permissions.put.ts`、`server/api/v1/admin/complete/auth/roles/[uid].delete.ts` 等模块导入使用。 |
| `adminError` | 函数 | 封装 Error 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/api/v1/admin/complete/auth/overview.get.ts`、`server/api/v1/admin/complete/auth/roles/[uid]/permissions.put.ts`、`server/api/v1/admin/complete/auth/roles/[uid].delete.ts` 等模块导入使用。 |
| `mapAdminError` | 函数 | 根据输入组装 Admin Error 所需的结果对象或结构 | 由 `server/api/v1/admin/complete/auth/overview.get.ts`、`server/api/v1/admin/complete/auth/roles/[uid]/permissions.put.ts`、`server/api/v1/admin/complete/auth/roles/[uid].delete.ts` 等模块导入使用。 |

### 调用签名

- `readBoundedJson`：`export async function readBoundedJson(event: H3Event, maxBytes = 1024 * 1024): Promise<unknown>`
- `adminError`：`export function adminError(statusCode: number, code: string, message: string): ReturnType<typeof createError>`
- `mapAdminError`：`export function mapAdminError(event: H3Event, error: unknown): never`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
- 媒体快照容量超限返回 413；清单、负载或目录校验错误返回 422；补偿回滚失败保留为服务端错误。
