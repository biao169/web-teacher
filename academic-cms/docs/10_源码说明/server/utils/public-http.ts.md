# server / utils / public-http.ts

## 文件定位

- **源码路径**：`server/utils/public-http.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：50 行，2078 字节
- **内容校验**：SHA-256 `cd486361216e0ee0ed0cfecc46d90d909f5275c351325df89658e253b55631c8`

## 直接依赖

- `../../shared/utils/http-etag`
- `../services/public/errors`
- `../services/public/public-result`
- `h3`

## 直接调用方

- `server/routes/api/v1/public/courses.get.ts`
- `server/routes/api/v1/public/courses/[uid].get.ts`
- `server/routes/api/v1/public/home.get.ts`
- `server/routes/api/v1/public/news.get.ts`
- `server/routes/api/v1/public/news/[slug].get.ts`
- `server/routes/api/v1/public/patents.get.ts`
- `server/routes/api/v1/public/patents/[uid].get.ts`
- `server/routes/api/v1/public/projects.get.ts`
- `server/routes/api/v1/public/projects/[uid].get.ts`
- `server/routes/api/v1/public/publications.get.ts`
- `server/routes/api/v1/public/publications/[uid].get.ts`
- `server/routes/api/v1/public/publications/featured.get.ts`
- `server/routes/api/v1/public/research.get.ts`
- `server/routes/api/v1/public/shell.get.ts`
- `server/routes/api/v1/public/students.get.ts`
- `server/routes/api/v1/public/students/[uid].get.ts`
- `server/routes/api/v1/public/team.get.ts`
- `server/routes/api/v1/public/team/[uid].get.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `statusFor` | 函数，第 6 行 | 封装 For 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `publicHttpFailure` | 函数，第 15 行 | 封装 Http Failure 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/routes/api/v1/public/courses/[uid].get.ts`、`server/routes/api/v1/public/courses.get.ts`、`server/routes/api/v1/public/home.get.ts` 等模块导入使用。 |
| `sendPublicResult` | 函数，第 33 行 | 封装 Public Result 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/routes/api/v1/public/courses/[uid].get.ts`、`server/routes/api/v1/public/courses.get.ts`、`server/routes/api/v1/public/home.get.ts` 等模块导入使用。 |
| `handlePublicResult` | 函数，第 46 行 | 响应 Public Result 相关事件，协调后续业务流程 | 由 `server/routes/api/v1/public/courses/[uid].get.ts`、`server/routes/api/v1/public/courses.get.ts`、`server/routes/api/v1/public/home.get.ts` 等模块导入使用。 |

### 调用签名

- `statusFor`：`function statusFor(error: PublicSiteError): number`
- `publicHttpFailure`：`export function publicHttpFailure(event: H3Event, label: string, error: unknown): never`
- `sendPublicResult`：`export function sendPublicResult<T>(event: H3Event, result: PublicServiceResult<T>): T | null`
- `handlePublicResult`：`export async function handlePublicResult<T>(event: H3Event, label: string, loader: () => Promise<PublicServiceResult<T>>): Promise<T | null>`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
