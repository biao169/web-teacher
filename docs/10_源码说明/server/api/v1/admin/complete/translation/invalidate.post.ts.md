# server / api / v1 / admin / complete / translation / invalidate.post.ts

## 文件定位

- **源码路径**：`server/api/v1/admin/complete/translation/invalidate.post.ts`
- **文件类型**：接口路由
- **功能定位**：POST /api/v1/admin/complete/translation/invalidate 的服务端接口入口；负责接收请求并委托安全、服务或存储层处理。
- **规模**：12 行，653 字节
- **内容校验**：SHA-256 `5b45ae1caae67517c64eada31175776c0855d1bb9707e5d2e525c09f1a5cac34`
- **HTTP 入口**：`POST /api/v1/admin/complete/translation/invalidate`

## 直接依赖

- `~~/server/services/complete-admin/translation-service`
- `~~/server/utils/complete-admin/api`
- `~~/server/utils/complete-admin/auth`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `default` | defineEventHandler 默认处理器，第 5 行 | 处理 POST /api/v1/admin/complete/translation/invalidate 请求，并把流程委托给权限与业务服务 | 由 Nitro 文件路由自动注册；收到匹配 HTTP 请求时执行。 |

### 调用签名

- `default`：`defineEventHandler(async (event) =>`

## 维护注意事项

- 接口入口保持薄层：参数边界在入口校验，业务规则进入 service，数据库细节进入 store/adapter。
