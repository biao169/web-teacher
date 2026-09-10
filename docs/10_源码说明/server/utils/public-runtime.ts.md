# server / utils / public-runtime.ts

## 文件定位

- **源码路径**：`server/utils/public-runtime.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：58 行，3010 字节
- **内容校验**：SHA-256 `30a98493f091460462db488e16584e50bfecf4ac17ec24d7addede437a9958ec`

## 直接依赖

- `#imports`
- `../services/public/modules/courses`
- `../services/public/modules/news`
- `../services/public/modules/patents`
- `../services/public/modules/projects`
- `../services/public/modules/publications`
- `../services/public/modules/research`
- `../services/public/modules/students`
- `../services/public/modules/team`
- `../services/public/public-home-service`
- `../services/public/public-shell-service`
- `./cache-runtime`
- `./database`
- `./i18n-runtime`
- `./media-runtime`
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
- `server/types/h3.d.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `usePublicRuntime` | 函数，第 31 行 | 封装 Runtime 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/routes/api/v1/public/courses/[uid].get.ts`、`server/routes/api/v1/public/courses.get.ts`、`server/routes/api/v1/public/home.get.ts` 等模块导入使用。 |

### 调用签名

- `usePublicRuntime`：`export function usePublicRuntime(event: H3Event): PublicRuntime`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `PublicRuntime` | 接口，第 18 行 | 约束 Public Runtime 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
