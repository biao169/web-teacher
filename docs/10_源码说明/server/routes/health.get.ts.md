# server / routes / health.get.ts

## 文件定位

- **源码路径**：`server/routes/health.get.ts`
- **文件类型**：接口路由
- **功能定位**：GET /health 的服务端接口入口；负责接收请求并委托安全、服务或存储层处理。
- **规模**：19 行，512 字节
- **内容校验**：SHA-256 `22a10a5c9953911663a56ccc4165f405fe745c2180720689ed6bdf7603a2d5c4`
- **HTTP 入口**：`GET /health`

## 直接依赖

- `../utils/health`
- `h3`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `default` | defineEventHandler 默认处理器，第 4 行 | 处理 GET /health 请求，并把流程委托给权限与业务服务 | 由 Nitro 文件路由自动注册；收到匹配 HTTP 请求时执行。 |

### 调用签名

- `default`：`defineEventHandler((event) =>`

## 维护注意事项

- 接口入口保持薄层：参数边界在入口校验，业务规则进入 service，数据库细节进入 store/adapter。
