# server / api / v1 / admin / complete / translation / [uid].patch.ts

## 文件定位

- **源码路径**：`server/api/v1/admin/complete/translation/[uid].patch.ts`
- **文件类型**：接口路由
- **功能定位**：PATCH /api/v1/admin/complete/translation/:uid 的服务端接口入口；负责接收请求并委托安全、服务或存储层处理。
- **规模**：28 行，1096 字节
- **内容校验**：SHA-256 `70d3ce812461f34aff738508209d4a8e54dbe6feccb97467135a0eb97390ef59`
- **HTTP 入口**：`PATCH /api/v1/admin/complete/translation/:uid`

## 直接依赖

- `h3`
- `~~/server/services/complete-admin/translation-service`
- `~~/server/utils/complete-admin/api`
- `~~/server/utils/complete-admin/auth`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `manualBody` | 函数，第 11 行 | 封装 Body 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `default` | defineEventHandler 默认处理器，第 16 行 | 处理 PATCH /api/v1/admin/complete/translation/:uid 请求，并把流程委托给权限与业务服务 | 由 Nitro 文件路由自动注册；收到匹配 HTTP 请求时执行。 |

### 调用签名

- `manualBody`：`function manualBody(value: unknown): ManualTranslationBody`
- `default`：`defineEventHandler(async (event) =>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `ManualTranslationBody` | 接口，第 6 行 | 约束 Manual Translation Body 的数据结构或可选值 |

## 维护注意事项

- 接口入口保持薄层：参数边界在入口校验，业务规则进入 service，数据库细节进入 store/adapter。
