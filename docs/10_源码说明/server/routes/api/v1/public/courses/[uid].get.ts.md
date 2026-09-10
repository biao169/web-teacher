# server / routes / api / v1 / public / courses / [uid].get.ts

## 文件定位

- **源码路径**：`server/routes/api/v1/public/courses/[uid].get.ts`
- **文件类型**：接口路由
- **功能定位**：GET /api/v1/public/courses/:uid 的服务端接口入口；负责接收请求并委托安全、服务或存储层处理。
- **规模**：9 行，530 字节
- **内容校验**：SHA-256 `580928de92ac792f2dd5b69cabcfe6ba5b07edd084fe36c4786a16bb380129eb`
- **HTTP 入口**：`GET /api/v1/public/courses/:uid`

## 直接依赖

- `../../../../../services/public/public-query`
- `../../../../../utils/public-http`
- `../../../../../utils/public-runtime`
- `h3`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `default` | defineEventHandler 默认处理器，第 6 行 | 处理 GET /api/v1/public/courses/:uid 请求，并把流程委托给权限与业务服务 | 由 Nitro 文件路由自动注册；收到匹配 HTTP 请求时执行。 |

### 调用签名

- `default`：`defineEventHandler(event => handlePublicResult(event, 'Public courses detail request', () =>`

## 维护注意事项

- 接口入口保持薄层：参数边界在入口校验，业务规则进入 service，数据库细节进入 store/adapter。
