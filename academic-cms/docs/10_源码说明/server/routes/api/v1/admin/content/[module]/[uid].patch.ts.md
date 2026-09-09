# server / routes / api / v1 / admin / content / [module] / [uid].patch.ts

## 文件定位

- **源码路径**：`server/routes/api/v1/admin/content/[module]/[uid].patch.ts`
- **文件类型**：接口路由
- **功能定位**：PATCH /api/v1/admin/content/:module/:uid 的服务端接口入口；负责接收请求并委托安全、服务或存储层处理。
- **规模**：9 行，593 字节
- **内容校验**：SHA-256 `4f22785e67875f3903570a2811e62c78c9cd6d32774df04d6277141a296ce5bb`
- **HTTP 入口**：`PATCH /api/v1/admin/content/:module/:uid`

## 直接依赖

- `../../../../../../services/admin/content-service`
- `../../../../../../utils/admin-content-handler`
- `../../../../../../utils/database`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `default` | defineAdminContentWriteHandler 默认处理器，第 5 行 | 处理 PATCH /api/v1/admin/content/:module/:uid 请求，并把流程委托给权限与业务服务 | 由 Nitro 文件路由自动注册；收到匹配 HTTP 请求时执行。 |

### 调用签名

- `default`：`defineAdminContentWriteHandler('edit', async (event, context, body) =>`

## 维护注意事项

- 接口入口保持薄层：参数边界在入口校验，业务规则进入 service，数据库细节进入 store/adapter。
